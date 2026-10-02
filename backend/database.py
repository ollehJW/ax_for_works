"""PostgreSQL connections; credentials are loaded from environment, never source."""
import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env', override=False)


def connection_options():
    return {
        'host': os.getenv('AX_DB_HOST', '127.0.0.1'),
        'port': int(os.getenv('AX_DB_PORT', '5432')),
        'dbname': os.getenv('AX_DB_NAME', 'wia_platform'),
        'user': os.getenv('AX_DB_USER', 'wia_platform_admin'),
        'password': os.getenv('AX_DB_PASSWORD', ''),
        'connect_timeout': 5,
        'application_name': 'ax-for-works',
        'options': '-c timezone=UTC -c statement_timeout=15000',
        'row_factory': dict_row,
    }


@contextmanager
def database():
    with psycopg.connect(**connection_options()) as connection:
        yield connection


def initialize_schema(connection):
    connection.execute((ROOT / 'backend/sql/platform.sql').read_text())
