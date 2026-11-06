"""Password policy tests with mocked persistence; never connect to a database."""
import unittest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend import auth

class PasswordPolicyTests(unittest.TestCase):
    def test_all_four_groups_length_and_forbidden_word(self):
        for value in ['Abcdef1!', 'abcdefghi1!', 'ABCDEFGHI1!', 'Abcdefghij!', 'Abcdefghi12',
                      'GoodWIA123!', 'GoodwIa123!', 'Goodwia123!']:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                auth.PasswordBody(current_password='legacy', new_password=value)
        self.assertEqual(auth.validate_new_password('Abcdef12!'), 'Abcdef12!')
        self.assertEqual(auth.validate_new_password('Abcdef12_'), 'Abcdef12_')

    def test_registration_uses_same_policy(self):
        payload=dict(employee_id='fixture',full_name='테스트',organization='조직',
                     team_name='팀',role_name='직급',email='fixture@example.com')
        with self.assertRaises(ValidationError):
            auth.RegisterBody(password='abcdef123!', **payload)
        auth.RegisterBody(password='Abcdef123!', **payload)

    def test_existing_password_is_still_accepted_for_login(self):
        legacy='wia1234!'
        auth.LoginBody(employee_id='fixture', password=legacy)
        self.assertTrue(auth.verify_password(legacy,auth.hash_password(legacy)))

    def test_random_passwords_satisfy_policy_and_are_distinct(self):
        values={auth.generate_temporary_password() for _ in range(500)}
        self.assertEqual(len(values),500)
        for value in values:
            self.assertEqual(len(value),16)
            auth.validate_new_password(value)

    def test_reset_only_stores_hash_and_returns_uncacheable_temporary_password(self):
        db=MagicMock()
        db.execute.return_value.fetchone.return_value={'user_id':'fixture-user','full_name':'테스트'}
        app=FastAPI();app.include_router(auth.router)
        with patch.object(auth,'database') as database, patch.object(auth,'consume_public_attempt'):
            database.return_value.__enter__.return_value=db
            with TestClient(app) as client:
                response=client.post('/api/auth/reset-password',json={'employee_id':'fixture','full_name':'테스트'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers['cache-control'],'no-store')
        password=response.json()['temporary_password']
        auth.validate_new_password(password)
        updates=[c.args for c in db.execute.call_args_list if 'UPDATE platform.users' in c.args[0]]
        self.assertEqual(len(updates),1)
        sql,params=updates[0]
        self.assertIn('must_change_password=TRUE',sql)
        self.assertEqual(params[-1],'fixture-user')
        self.assertTrue(auth.verify_password(password,params[0]))
        self.assertNotIn(password,str(db.execute.call_args_list))
        self.assertTrue(any('DELETE FROM platform.sessions WHERE user_id=' in c.args[0] for c in db.execute.call_args_list))

    def test_mismatched_identity_does_not_update_account(self):
        db=MagicMock();db.execute.return_value.fetchone.return_value=None
        app=FastAPI();app.include_router(auth.router)
        with patch.object(auth,'database') as database, patch.object(auth,'consume_public_attempt'):
            database.return_value.__enter__.return_value=db
            with TestClient(app) as client:
                response=client.post('/api/auth/reset-password',json={'employee_id':'fixture','full_name':'테스트'})
        self.assertEqual(response.status_code,404)
        self.assertFalse(any('UPDATE platform.users' in c.args[0] for c in db.execute.call_args_list))

if __name__=='__main__':
    unittest.main()
