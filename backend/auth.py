"""WiaNews-compatible account authentication backed by PostgreSQL."""
from datetime import datetime, timezone
import hashlib
import hmac
import re
import secrets
import time
import uuid
import unicodedata
import psycopg

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.database import database

COOKIE = 'ax_platform_session'
SESSION_SECONDS = 8 * 3600
router = APIRouter(prefix='/api/auth')
PUBLIC_FIELDS = ('user_id', 'employee_id', 'full_name', 'team_id', 'team_name', 'role_id',
                 'role_name', 'organization', 'is_admin', 'email', 'must_change_password', 'is_active',
                 'created_at', 'updated_at', 'last_login_at', 'password_changed_at')
USER_QUERY = '''SELECT u.*, t.name AS team_name, r.name AS role_name,
                       COALESCE(o.name, '') AS organization
                FROM platform.users u
                LEFT JOIN platform.teams t ON t.team_id=u.team_id
                LEFT JOIN platform.roles r ON r.role_id=u.role_id
                LEFT JOIN platform.orgs o ON o.org_id=u.org_id'''


def now():
    return datetime.now(timezone.utc)


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600000).hex()
    return f'pbkdf2_sha256$600000${salt}${digest}'


def verify_password(password, encoded):
    try:
        algorithm, iterations, salt, expected = encoded.split('$')
        rounds = int(iterations)
        if algorithm != 'pbkdf2_sha256' or not 100000 <= rounds <= 2000000:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), rounds).hex()
        return hmac.compare_digest(actual, expected)
    except (AttributeError, TypeError, ValueError):
        return False


DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def public_user(row):
    return {field: row[field] for field in PUBLIC_FIELDS}


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def find_session_user(db, token, *, lock=False):
    if not token or len(token) > 256:
        return None
    return db.execute(USER_QUERY + ''' JOIN platform.sessions s ON s.user_id=u.user_id
        WHERE s.token_hash=%s AND s.expires_at>%s AND u.is_active=TRUE''' + (' FOR UPDATE OF u' if lock else ''),
        (token_hash(token), time.time())).fetchone()


def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if token:
        with database() as db:
            row = find_session_user(db, token)
            if row:
                return public_user(row)
    raise HTTPException(401, '로그인이 필요합니다.')


def ready_user(user=Depends(current_user)):
    if user['must_change_password']:
        raise HTTPException(403, '초기 비밀번호를 먼저 변경해 주세요.')
    return user


def set_session(db, response, user_id, old_token=None):
    if old_token:
        db.execute('DELETE FROM platform.sessions WHERE token_hash=%s', (token_hash(old_token),))
    token = secrets.token_urlsafe(32)
    db.execute('DELETE FROM platform.sessions WHERE expires_at<=%s', (time.time(),))
    db.execute('INSERT INTO platform.sessions VALUES (%s,%s,%s,%s)',
               (token_hash(token), user_id, now(), time.time() + SESSION_SECONDS))
    response.delete_cookie(COOKIE, path='/api', httponly=True, secure=True, samesite='strict')
    response.set_cookie(COOKIE, token, httponly=True, secure=True, samesite='strict',
                        max_age=SESSION_SECONDS, path='/')
    response.headers['Cache-Control'] = 'no-store'


class RegistrationOptions(BaseModel):
    organizations: list[str]
    teams: list[str]
    roles: list[str]


@router.get('/registration-options', response_model=RegistrationOptions)
def registration_options(response: Response):
    """Public signup suggestions: only organization, team and role labels."""
    response.headers['Cache-Control'] = 'no-store'
    with database() as db:
        organizations = db.execute("""SELECT DISTINCT btrim(name) AS label
            FROM platform.orgs WHERE btrim(name) NOT IN ('', '미지정') ORDER BY label""").fetchall()
        teams = db.execute("""SELECT DISTINCT btrim(name) AS label
            FROM platform.teams WHERE btrim(name) NOT IN ('', '미지정') ORDER BY label""").fetchall()
        roles = db.execute("""SELECT DISTINCT btrim(name) AS label
            FROM platform.roles WHERE btrim(name) NOT IN ('', '미지정') ORDER BY label""").fetchall()
    return RegistrationOptions(
        organizations=[row['label'] for row in organizations],
        teams=[row['label'] for row in teams],
        roles=[row['label'] for row in roles],
    )


class LoginBody(BaseModel):
    employee_id: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class PasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def strong_password(cls, value):
        if not (re.search('[A-Za-z]', value) and re.search('[0-9]', value) and re.search(r'[^\w\s]', value)):
            raise ValueError('영문, 숫자, 특수문자를 포함해 8자 이상 입력해 주세요.')
        if value in ('wia1234!', 'admin123'):
            raise ValueError('초기 비밀번호는 새 비밀번호로 사용할 수 없습니다.')
        return value


@router.post('/login')
def login(body: LoginBody, request: Request, response: Response):
    employee = body.employee_id.strip().lower()
    ip = request.client.host if request.client else 'unknown'
    keys = [('employee:' + employee, 10), ('ip:' + ip, 40)]
    timestamp = time.time()
    with database() as db:
        # Serialize attempts across all workers, including rows not yet inserted.
        for key, _ in sorted(keys):
            db.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (key,))
        db.execute('DELETE FROM platform.login_attempts WHERE expires_at<=%s', (timestamp,))
        for key, limit in keys:
            attempt = db.execute('SELECT count FROM platform.login_attempts WHERE attempt_key=%s', (key,)).fetchone()
            if attempt and attempt['count'] >= limit:
                raise HTTPException(429, '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.')
        row = db.execute(USER_QUERY + ' WHERE lower(u.employee_id)=%s FOR UPDATE OF u', (employee,)).fetchone()
        valid = verify_password(body.password, row['password_hash'] if row else DUMMY_HASH)
        if not valid or not row or not row['is_active']:
            for key, _ in keys:
                db.execute('''INSERT INTO platform.login_attempts VALUES (%s,1,%s)
                    ON CONFLICT(attempt_key) DO UPDATE SET count=platform.login_attempts.count+1''', (key, timestamp + 900))
            db.commit()  # Failed logins must persist even though the API raises 401.
            raise HTTPException(401, '사번 또는 비밀번호를 확인해 주세요.')
        db.execute('DELETE FROM platform.login_attempts WHERE attempt_key=%s', (keys[0][0],))
        db.execute('UPDATE platform.users SET last_login_at=%s WHERE user_id=%s', (now(), row['user_id']))
        set_session(db, response, row['user_id'], request.cookies.get(COOKIE))
        return public_user(db.execute(USER_QUERY + ' WHERE u.user_id=%s', (row['user_id'],)).fetchone())


@router.get('/me')
def me(request: Request, response: Response, user=Depends(current_user)):
    # Upgrade existing portal-only cookies to the shared service path.
    response.delete_cookie(COOKIE, path='/api', httponly=True, secure=True, samesite='strict')
    response.set_cookie(COOKIE, request.cookies[COOKIE], httponly=True, secure=True,
                        samesite='strict', max_age=SESSION_SECONDS, path='/')
    return user


@router.post('/logout')
def logout(request: Request, response: Response):
    with database() as db:
        db.execute('DELETE FROM platform.sessions WHERE token_hash=%s', (token_hash(request.cookies.get(COOKIE, '')),))
    response.delete_cookie(COOKIE, path='/', httponly=True, secure=True, samesite='strict')
    return {'ok': True}


@router.post('/password')
def change_password(body: PasswordBody, request: Request, response: Response, user=Depends(current_user)):
    with database() as db:
        row = find_session_user(db, request.cookies.get(COOKIE), lock=True)
        if not row:
            raise HTTPException(401, '로그인이 필요합니다.')
        if not verify_password(body.current_password, row['password_hash']):
            raise HTTPException(400, '현재 비밀번호가 일치하지 않습니다.')
        if verify_password(body.new_password, row['password_hash']):
            raise HTTPException(400, '현재 비밀번호와 다른 비밀번호를 입력해 주세요.')
        stamp = now()
        db.execute('''UPDATE platform.users SET password_hash=%s,must_change_password=FALSE,
                   password_changed_at=%s,updated_at=%s WHERE user_id=%s''',
                   (hash_password(body.new_password), stamp, stamp, user['user_id']))
        db.execute('DELETE FROM platform.sessions WHERE user_id=%s', (user['user_id'],))
        set_session(db, response, user['user_id'])
        return public_user(db.execute(USER_QUERY + ' WHERE u.user_id=%s', (user['user_id'],)).fetchone())


def normalized_name(value):
    return ' '.join(unicodedata.normalize('NFKC', value).split())


class AccountIdentity(BaseModel):
    model_config = ConfigDict(extra='forbid')
    employee_id: str = Field(min_length=1, max_length=40, pattern=r'^[A-Za-z0-9._-]+$')
    full_name: str = Field(min_length=1, max_length=80)

    @field_validator('employee_id', mode='before')
    @classmethod
    def clean_employee(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator('full_name')
    @classmethod
    def clean_full_name(cls, value):
        value = normalized_name(value)
        if not value:
            raise ValueError('이름을 입력해 주세요.')
        return value


class RegisterBody(AccountIdentity):
    password: str = Field(min_length=8, max_length=128, repr=False)
    organization: str = Field(min_length=1, max_length=80)
    team_name: str = Field(min_length=1, max_length=80)
    role_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)

    @field_validator('password')
    @classmethod
    def valid_password(cls, value):
        return PasswordBody.strong_password(value)

    @field_validator('organization', 'team_name', 'role_name')
    @classmethod
    def clean_label(cls, value):
        value = normalized_name(value)
        if not value:
            raise ValueError('조직, 팀, 직급을 입력해 주세요.')
        return value

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('이메일 주소를 확인해 주세요.')
        return value


def consume_public_attempt(request, action, employee=None):
    """Count successes and failures in a committed, concurrent-safe transaction."""
    ip = request.client.host if request.client else 'unknown'
    limits = [(action + ':ip:' + ip, 20)]
    if employee:
        limits.append((action + ':employee:' + employee, 3))
    timestamp = time.time()
    with database() as db:
        for key, _ in sorted(limits):
            db.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (key,))
        db.execute('DELETE FROM platform.login_attempts WHERE expires_at<=%s', (timestamp,))
        for key, limit in limits:
            row = db.execute('SELECT count FROM platform.login_attempts WHERE attempt_key=%s', (key,)).fetchone()
            if row and row['count'] >= limit:
                raise HTTPException(429, '요청이 많습니다. 15분 후 다시 시도해 주세요.')
        for key, _ in limits:
            db.execute('''INSERT INTO platform.login_attempts VALUES (%s,1,%s)
                ON CONFLICT(attempt_key) DO UPDATE SET count=platform.login_attempts.count+1''', (key, timestamp + 900))


@router.post('/reset-password')
def reset_password(body: AccountIdentity, request: Request):
    consume_public_attempt(request, 'reset', body.employee_id)
    encoded = hash_password('wia1234!')
    with database() as db:
        row = db.execute('''SELECT user_id,full_name FROM platform.users
            WHERE lower(employee_id)=%s AND is_active=TRUE FOR UPDATE''', (body.employee_id,)).fetchone()
        if not row or normalized_name(row['full_name']) != body.full_name:
            raise HTTPException(404, '사번과 이름이 일치하는 계정을 찾을 수 없습니다.')
        stamp = now()
        db.execute('''UPDATE platform.users SET password_hash=%s,must_change_password=TRUE,
            password_changed_at=%s,updated_at=%s WHERE user_id=%s''', (encoded, stamp, stamp, row['user_id']))
        db.execute('DELETE FROM platform.sessions WHERE user_id=%s', (row['user_id'],))
        db.execute('DELETE FROM platform.login_attempts WHERE attempt_key=%s', ('employee:' + body.employee_id,))
    return {'ok': True, 'message': '패스워드가 wia1234!로 초기화되었습니다. 로그인 후 새 비밀번호로 변경해 주세요.'}


@router.post('/register', status_code=201)
def register(body: RegisterBody, request: Request):
    consume_public_attempt(request, 'register')
    encoded = hash_password(body.password)
    try:
        with database() as db:
            # Shared with the service account administrators: resolve names atomically.
            db.execute('SELECT pg_advisory_xact_lock(741902630)')
            if db.execute('SELECT 1 FROM platform.users WHERE lower(employee_id)=%s', (body.employee_id,)).fetchone():
                raise HTTPException(409, '이미 등록된 사번입니다.')
            resolved = []
            stamp = now()
            for table, field, name in [('orgs', 'org_id', body.organization), ('teams', 'team_id', body.team_name), ('roles', 'role_id', body.role_name)]:
                rows = db.execute(f'SELECT {field},name FROM platform.{table}').fetchall()
                match = next((row for row in rows if normalized_name(row['name']).casefold() == name.casefold()), None)
                item_id = match[field] if match else str(uuid.uuid4())
                if not match:
                    db.execute(f'INSERT INTO platform.{table} ({field},name,created_at) VALUES (%s,%s,%s)', (item_id, name, stamp))
                resolved.append(item_id)
            db.execute('''INSERT INTO platform.users
                (user_id,employee_id,password_hash,full_name,org_id,team_id,role_id,email,
                 must_change_password,is_active,is_admin,created_at,updated_at,password_changed_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,FALSE,TRUE,FALSE,%s,%s,%s)''',
                (str(uuid.uuid4()),body.employee_id,encoded,body.full_name,
                 *resolved,body.email,stamp,stamp,stamp))
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, '이미 등록된 사번입니다.') from None
    return {'ok': True, 'message': '계정이 생성되었습니다. 설정한 비밀번호로 로그인해 주세요.'}


class CompleteProfileBody(BaseModel):
    """Only missing profile values may be supplied; identity and privileges are immutable."""
    model_config = ConfigDict(extra='forbid')
    full_name: str | None = Field(default=None, min_length=1, max_length=80)
    organization: str | None = Field(default=None, min_length=1, max_length=80)
    team_name: str | None = Field(default=None, min_length=1, max_length=80)
    role_name: str | None = Field(default=None, min_length=1, max_length=80)
    email: str | None = Field(default=None, min_length=3, max_length=254)

    @field_validator('full_name', 'organization', 'team_name', 'role_name')
    @classmethod
    def valid_label(cls, value):
        if value is None:
            return value
        value = normalized_name(value)
        if not value or value == '미지정':
            raise ValueError('누락된 정보를 입력해 주세요. 미지정은 사용할 수 없습니다.')
        return value

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        return RegisterBody.valid_email(value) if value is not None else value


def missing_profile_fields(row):
    return [field for field in ('full_name', 'organization', 'team_name', 'role_name', 'email')
            if normalized_name(str(row.get(field) or '')) in ('', '미지정')]


@router.post('/profile/complete')
def complete_profile(body: CompleteProfileBody, request: Request, user=Depends(ready_user)):
    supplied = body.model_dump(exclude_none=True)
    with database() as db:
        # Use the same directory lock as registration; lock the session's user row
        # before deciding which values are missing, to avoid concurrent overwrites.
        db.execute('SELECT pg_advisory_xact_lock(741902630)')
        row = find_session_user(db, request.cookies.get(COOKIE), lock=True)
        if not row:
            raise HTTPException(401, '로그인이 필요합니다.')
        if row['must_change_password']:
            raise HTTPException(403, '초기 비밀번호를 먼저 변경해 주세요.')
        missing = set(missing_profile_fields(row))
        if set(supplied) - missing:
            raise HTTPException(409, '이미 등록된 정보는 변경할 수 없습니다. 계정 정보를 새로 확인해 주세요.')
        if missing - set(supplied):
            raise HTTPException(422, '입력이 필요한 항목을 모두 채워 주세요.')
        if not supplied:
            return public_user(row)
        changes = {}
        stamp = now()
        for field, table, column in [('organization','orgs','org_id'), ('team_name','teams','team_id'), ('role_name','roles','role_id')]:
            if field not in supplied:
                continue
            name = supplied[field]
            entries = db.execute(f'SELECT {column},name FROM platform.{table}').fetchall()
            existing = next((entry for entry in entries if normalized_name(entry['name']).casefold() == name.casefold()), None)
            item_id = existing[column] if existing else str(uuid.uuid4())
            if not existing:
                db.execute(f'INSERT INTO platform.{table} ({column},name,created_at) VALUES (%s,%s,%s)', (item_id,name,stamp))
            changes[column] = item_id
        for field in ('full_name','email'):
            if field in supplied:
                changes[field] = supplied[field]
        changes['updated_at'] = stamp
        # Column names above are fixed server constants, never client input.
        assignments = ', '.join(f'{field}=%s' for field in changes)
        db.execute(f'UPDATE platform.users SET {assignments} WHERE user_id=%s', (*changes.values(),row['user_id']))
        return public_user(db.execute(USER_QUERY + ' WHERE u.user_id=%s', (row['user_id'],)).fetchone())
