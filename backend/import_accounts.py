"""Transactional, repeatable WiaNews account import. Existing platform rows are kept."""
from contextlib import closing
import argparse
from pathlib import Path
import sqlite3

from psycopg import sql
from backend.database import ROOT, database, initialize_schema

TABLES = {
    'teams': ('team_id', 'name', 'created_at'),
    'roles': ('role_id', 'name', 'created_at'),
    'users': ('user_id', 'employee_id', 'password_hash', 'full_name', 'team_id', 'role_id',
              'email', 'must_change_password', 'is_active', 'is_admin', 'created_at',
              'updated_at', 'last_login_at', 'password_changed_at'),
}
FLAGS = {'must_change_password', 'is_active', 'is_admin'}


def import_accounts(source: Path):
    # A read-only snapshot ensures accounts and referenced teams/roles agree.
    with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as original:
        original.row_factory = sqlite3.Row
        original.execute('BEGIN')
        rows = {table: [dict(row) for row in original.execute('SELECT ' + ','.join(columns) + ' FROM ' + table)]
                for table, columns in TABLES.items()}
    counts = {}
    with database() as target:
        target.execute("SELECT pg_advisory_xact_lock(hashtextextended('ax-platform-account-import', 0))")
        initialize_schema(target)
        for table, columns in TABLES.items():
            query = sql.SQL('INSERT INTO platform.{} ({}) VALUES ({}) ON CONFLICT ({}) DO NOTHING').format(
                sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)),
                sql.SQL(',').join(sql.Placeholder() for _ in columns), sql.Identifier(columns[0]))
            inserted = 0
            for row in rows[table]:
                values = [bool(row[key]) if key in FLAGS else row[key] for key in columns]
                inserted += target.execute(query, values).rowcount
            counts[table] = {'source': len(rows[table]), 'inserted': inserted, 'kept': len(rows[table]) - inserted}
        # Sessions belong to the source app and are intentionally not reused.
        # No automatic admin seed, password reset or changes to existing portal accounts.
    return counts


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Copy WiaNews account data into PostgreSQL platform schema')
    parser.add_argument('--source', type=Path, default=ROOT.parent / 'wianews/backend/app.db')
    args = parser.parse_args()
    for table, counts in import_accounts(args.source).items():
        print(table, counts)
