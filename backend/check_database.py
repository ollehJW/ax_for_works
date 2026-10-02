"""Deployment preflight: verify PostgreSQL and imported active accounts."""
from backend.database import database


def check_database():
    with database() as db:
        row = db.execute('SELECT count(*) AS users, count(*) FILTER (WHERE is_active) AS active FROM platform.users').fetchone()
        if not row['active']:
            raise RuntimeError('No active platform accounts; import accounts before deployment')
        for table in ('teams', 'roles', 'sessions', 'login_attempts'):
            db.execute('SELECT 1 FROM platform.' + table + ' LIMIT 1')
    print(f"Platform database ready: {row['users']} users, {row['active']} active")


if __name__ == '__main__':
    check_database()
