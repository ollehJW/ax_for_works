import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


@contextmanager
def database():
    with psycopg.connect(host=os.environ["AX_DB_HOST"], port=os.getenv("AX_DB_PORT", "5432"),
                         dbname=os.environ["AX_DB_NAME"], user=os.environ["AX_DB_USER"],
                         password=os.environ["AX_DB_PASSWORD"], connect_timeout=5,
                         options="-c timezone=UTC -c statement_timeout=10000",
                         application_name="confluence_studio", row_factory=dict_row) as db:
        yield db
