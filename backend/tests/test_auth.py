"""Integration tests against a disposable PostgreSQL database, never production."""
import hashlib
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

from fastapi.testclient import TestClient

from backend.auth import COOKIE, hash_password, token_hash, verify_password
from backend.database import database, initialize_schema
from backend.import_accounts import import_accounts, TABLES
from backend.main import create_app


@unittest.skipUnless(os.getenv('AX_TEST_POSTGRES') == '1', 'Requires an isolated PostgreSQL test instance')
class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('AX_DB_NAME') != 'wia_platform_test' or os.getenv('AX_DB_USER') != 'ax_test_admin':
            raise RuntimeError('Refusing to run destructive fixtures outside the dedicated test database')
        cls.encoded = hash_password('TestPassword123!')
        with database() as db:
            initialize_schema(db)

    def setUp(self):
        with database() as db:
            db.execute('TRUNCATE platform.sessions,platform.login_attempts,platform.users,platform.teams,platform.roles,platform.orgs CASCADE')
            db.execute("INSERT INTO platform.teams VALUES ('test-team','테스트팀',now())")
            db.execute("INSERT INTO platform.roles VALUES ('test-role','매니저',now())")
            db.execute('''INSERT INTO platform.users
                (user_id,employee_id,password_hash,full_name,team_id,role_id,must_change_password,is_admin,created_at,updated_at)
                VALUES ('test-user','Test001',%s,'테스트 사용자','test-team','test-role',FALSE,TRUE,now(),now())''', (self.encoded,))
        self.app = create_app()
        self.client = self.enterContext(TestClient(self.app, base_url='https://portal.test'))
        self.headers = {'X-AX-Request': '1', 'Origin': 'https://portal.test'}

    def login(self, client=None, password='TestPassword123!', employee='test001'):
        return (client or self.client).post('/api/auth/login', json={'employee_id': employee, 'password': password}, headers=self.headers)

    def registration(self, **changes):
        return dict(employee_id='new001', password='MyPassword123!', full_name='가입 사용자',
                    organization='DX Lab', team_name='테스트팀', role_name='매니저',
                    email='new001@example.com') | changes

    def test_public_registration_options_only_expose_directory_labels(self):
        with database() as db:
            db.execute("UPDATE platform.users SET email='private@example.com'")
            db.execute("INSERT INTO platform.orgs VALUES ('test-org','  테스트조직  ',now()), ('duplicate-org','테스트조직',now()), ('blank-org','  ',now())")
            db.execute("INSERT INTO platform.teams VALUES ('duplicate-team',' 테스트팀 ',now())")
            db.execute("INSERT INTO platform.roles VALUES ('blank-role','  ',now())")
        response = self.client.get('/api/auth/registration-options')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.json(), {
            'organizations': ['테스트조직'], 'teams': ['테스트팀'], 'roles': ['매니저'],
        })
        for private in ['테스트 사용자', 'Test001', 'private@example.com', self.encoded, 'test-user', '추천에 포함하지 않는 사용자 값', 'test-org']:
            self.assertNotIn(private, response.text)
        with database() as db:
            db.execute("DELETE FROM platform.orgs")
        self.assertEqual(self.client.get('/api/auth/registration-options').json()['organizations'], [])

    def test_register_normal_account_and_login_without_initial_password_change(self):
        response = self.client.post('/api/auth/register', json=self.registration(), headers=self.headers)
        self.assertEqual(response.status_code, 201, response.text)
        with database() as db:
            user = db.execute("SELECT * FROM platform.users WHERE employee_id='new001'").fetchone()
            self.assertEqual(db.execute('SELECT name FROM platform.orgs WHERE org_id=%s', (user['org_id'],)).fetchone()['name'], 'DX Lab')
            self.assertFalse(user['must_change_password'])
            self.assertFalse(user['is_admin'])
            self.assertEqual(user['team_id'], 'test-team')
            self.assertEqual(user['role_id'], 'test-role')
            self.assertTrue(verify_password('MyPassword123!', user['password_hash']))
        response = self.login(employee='new001', password='MyPassword123!')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['organization'], 'DX Lab')
        self.assertEqual(self.client.get('/api/agents').status_code, 200)

    def test_login_uses_org_directory_and_allows_unassigned_org(self):
        # Match production: no legacy users.organization column.
        with database() as db:
            db.execute('ALTER TABLE platform.users DROP COLUMN IF EXISTS organization')
        self.assertEqual(self.login().json()['organization'], '')
        with database() as db:
            db.execute("INSERT INTO platform.orgs VALUES ('assigned-org','조직 조회 검증',now())")
            db.execute("UPDATE platform.users SET org_id='assigned-org' WHERE user_id='test-user'")
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['organization'], '조직 조회 검증')
        self.assertEqual(self.client.get('/api/auth/me').json()['organization'], '조직 조회 검증')

    def test_register_duplicate_id_rolls_back_new_team_and_cannot_grant_admin(self):
        response = self.client.post('/api/auth/register', json=self.registration(employee_id='TEST001', team_name='신규팀'), headers=self.headers)
        self.assertEqual(response.status_code, 409)
        with database() as db:
            self.assertIsNone(db.execute("SELECT 1 FROM platform.teams WHERE name='신규팀'").fetchone())
        self.assertEqual(self.client.post('/api/auth/register', json=self.registration(is_admin=True), headers=self.headers).status_code, 422)
        for changes in [dict(password='wia1234!'), dict(organization='  '), dict(email='bad-email')]:
            self.assertEqual(self.client.post('/api/auth/register', json=self.registration(**changes), headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post('/api/auth/register', json=self.registration()).status_code, 403)

    def test_reset_requires_matching_name_revokes_shared_sessions_and_requires_change(self):
        self.login()
        token = self.client.cookies.get(COOKIE)
        payload = dict(employee_id=' TEST001 ', full_name='다른 이름')
        self.assertEqual(self.client.post('/api/auth/reset-password', json=payload, headers=self.headers).status_code, 404)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        payload['full_name'] = '테스트 사용자'
        response = self.client.post('/api/auth/reset-password', json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn('wia1234!', response.json()['message'])
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        with database() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM platform.sessions WHERE token_hash=%s', (token_hash(token),)).fetchone())
        self.assertEqual(self.login().status_code, 401)
        response = self.login(password='wia1234!')
        self.assertTrue(response.json()['must_change_password'])
        self.assertEqual(self.client.get('/api/agents').status_code, 403)
        response = self.client.post('/api/auth/password', json={'current_password':'wia1234!', 'new_password':'Replacement123!'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['must_change_password'])

    def test_reset_rate_limit_and_inactive_account(self):
        payload = dict(employee_id='Test001', full_name='없는 이름')
        self.assertEqual(self.client.post('/api/auth/reset-password', json=payload).status_code, 403)
        for _ in range(3):
            self.assertEqual(self.client.post('/api/auth/reset-password', json=payload, headers=self.headers).status_code, 404)
        self.assertEqual(self.client.post('/api/auth/reset-password', json=payload, headers=self.headers).status_code, 429)
        with database() as db:
            self.assertTrue(verify_password('TestPassword123!', db.execute("SELECT password_hash FROM platform.users WHERE user_id='test-user'").fetchone()['password_hash']))
            db.execute('DELETE FROM platform.login_attempts')
            db.execute("UPDATE platform.users SET is_active=FALSE WHERE user_id='test-user'")
        payload['full_name'] = '테스트 사용자'
        self.assertEqual(self.client.post('/api/auth/reset-password', json=payload, headers=self.headers).status_code, 404)

    def test_shared_cookie_me_upgrades_legacy_path_and_gateway_login_return(self):
        from tempfile import TemporaryDirectory
        import yaml
        from backend.main import create_app
        from fastapi.testclient import TestClient
        with TemporaryDirectory() as temporary:
            config = Path(temporary) / 'config.yaml'
            config.write_text(yaml.safe_dump({'version': 1, 'gateways': [
                {'prefix': '/wianews', 'upstream': 'https://upstream.invalid', 'require_login': True}]}))
            with TestClient(create_app(gateway_config_path=config), base_url='https://portal.test') as client:
                response = client.get('/wianews/agent?from=direct', follow_redirects=False)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers['location'], '/login?next=%2Fwianews%2Fagent%3Ffrom%3Ddirect')
        self.login()
        token = self.client.cookies.get(COOKIE)
        self.client.cookies.clear()
        self.client.cookies.set(COOKIE, token, path='/api')
        response = self.client.get('/api/auth/me')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any('Path=/' in value and 'Max-Age=28800' in value for value in response.headers.get_list('set-cookie')))

    def test_compatible_hash_login_cookie_and_logout(self):
        response = self.login(employee='  TEST001  ')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['full_name'], '테스트 사용자')
        self.assertNotIn('password_hash', response.json())
        cookie = response.headers['set-cookie']
        for flag in ['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/', 'Max-Age=28800']:
            self.assertIn(flag, cookie)
        token = self.client.cookies.get(COOKIE)
        with database() as db:
            session = db.execute('SELECT * FROM platform.sessions').fetchone()
            self.assertEqual(session['token_hash'], token_hash(token))
            self.assertNotEqual(session['token_hash'], token)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        self.assertEqual(self.client.get('/api/agents').status_code, 200)
        self.assertEqual(self.client.post('/api/auth/logout', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        with database() as db:
            self.assertEqual(db.execute('SELECT count(*) AS n FROM platform.sessions').fetchone()['n'], 0)

    def test_portal_agents_require_authentication(self):
        self.assertEqual(self.client.get('/api/agents').status_code, 401)
        self.assertEqual(self.client.get('/api/agents/wianews/launch', follow_redirects=False).status_code, 401)
        self.assertEqual(self.client.get('/login').status_code, 200)

    def test_csrf_and_origin_validation(self):
        payload = {'employee_id': 'test001', 'password': 'TestPassword123!'}
        self.assertEqual(self.client.post('/api/auth/login', json=payload).status_code, 403)
        self.assertEqual(self.client.post('/api/auth/login', json=payload, headers={**self.headers, 'Origin': 'https://other.test'}).status_code, 403)
        self.assertEqual(self.login().status_code, 200)

    def test_password_change_requires_current_password_and_revokes_other_sessions(self):
        with database() as db:
            db.execute("UPDATE platform.users SET must_change_password=TRUE WHERE user_id='test-user'")
        other = self.enterContext(TestClient(self.app, base_url='https://portal.test'))
        self.assertEqual(self.login(other).status_code, 200)
        self.assertEqual(self.login().status_code, 200)
        old_token = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.get('/api/agents').status_code, 403)
        bad = self.client.post('/api/auth/password', json={'current_password': 'incorrect', 'new_password': 'NewPassword456!'}, headers=self.headers)
        self.assertEqual(bad.status_code, 400)
        good = self.client.post('/api/auth/password', json={'current_password': 'TestPassword123!', 'new_password': 'NewPassword456!'}, headers=self.headers)
        self.assertEqual(good.status_code, 200)
        self.assertFalse(good.json()['must_change_password'])
        self.assertNotEqual(self.client.cookies.get(COOKIE), old_token)
        self.assertEqual(other.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.client.get('/api/agents').status_code, 200)
        self.assertEqual(self.login(password='TestPassword123!').status_code, 401)
        self.assertEqual(self.login(password='NewPassword456!').status_code, 200)
        with database() as db:
            row = db.execute('SELECT password_hash,password_changed_at FROM platform.users').fetchone()
            self.assertTrue(verify_password('NewPassword456!', row['password_hash']))
            self.assertIsNotNone(row['password_changed_at'])

    def test_expired_session_and_inactive_user_are_rejected(self):
        self.login()
        with database() as db:
            db.execute('UPDATE platform.sessions SET expires_at=%s', (time.time()-1,))
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.login()
        with database() as db:
            db.execute('UPDATE platform.users SET is_active=FALSE')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.login().status_code, 401)

    def test_failed_logins_persist_and_lock_out_at_ten_attempts(self):
        for _ in range(10):
            self.assertEqual(self.login(password='incorrect').status_code, 401)
        self.assertEqual(self.login().status_code, 429)
        with database() as db:
            count = db.execute("SELECT count FROM platform.login_attempts WHERE attempt_key='employee:test001'").fetchone()['count']
            self.assertEqual(count, 10)
            db.execute('UPDATE platform.login_attempts SET expires_at=%s', (time.time()-1,))
        self.assertEqual(self.login().status_code, 200)

    def test_sql_injection_and_password_policy(self):
        self.assertEqual(self.login(employee="' OR 1=1 --").status_code, 401)
        self.login()
        for password in ['short', 'letters12345', 'wia1234!', 'admin123']:
            response = self.client.post('/api/auth/password', json={'current_password': 'TestPassword123!', 'new_password': password}, headers=self.headers)
            self.assertEqual(response.status_code, 422)

    def test_import_preserves_accounts_and_never_overwrites_changed_passwords(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        source = Path(directory) / 'source.db'
        with database() as db:
            rows = {table: db.execute('SELECT * FROM platform.' + table).fetchall() for table in TABLES}
            db.execute('TRUNCATE platform.sessions,platform.login_attempts,platform.users,platform.teams,platform.roles,platform.orgs CASCADE')
        with sqlite3.connect(source) as original:
            for table, columns in TABLES.items():
                original.execute('CREATE TABLE ' + table + ' (' + ','.join(column + (' INTEGER' if column in {'must_change_password','is_active','is_admin'} else ' TEXT') for column in columns) + ')')
                for row in rows[table]:
                    values = [int(row[column]) if isinstance(row[column], bool) else row[column].isoformat() if hasattr(row[column], 'isoformat') else row[column] for column in columns]
                    original.execute('INSERT INTO ' + table + ' VALUES (' + ','.join('?' for _ in columns) + ')', values)
        before = hashlib.sha256(source.read_bytes()).digest()
        self.assertEqual(import_accounts(source)['users']['inserted'], 1)
        with database() as db:
            imported = db.execute('SELECT * FROM platform.users').fetchone()
            self.assertEqual(imported, rows['users'][0])
            new_hash = hash_password('ChangedPassword789!')
            db.execute('UPDATE platform.users SET password_hash=%s', (new_hash,))
        self.assertEqual(import_accounts(source)['users']['kept'], 1)
        with database() as db:
            self.assertEqual(db.execute('SELECT password_hash FROM platform.users').fetchone()['password_hash'], new_hash)
        self.assertEqual(hashlib.sha256(source.read_bytes()).digest(), before)
