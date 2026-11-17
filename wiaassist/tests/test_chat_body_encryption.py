"""Raw messages and nested excerpts must be encrypted at the SQL boundary."""
import json
from contextlib import contextmanager
from unittest.mock import Mock
import pytest
from cryptography.fernet import Fernet, InvalidToken
from backend import store, chat_store, area_store, briefing_store

BODY = '암호화 검증용 대화 본문 — 실제 사용자 데이터 아님'
STAMP = '2026-11-17T00:00:00+00:00'

@pytest.fixture
def capture(monkeypatch):
    box = Fernet(Fernet.generate_key())
    monkeypatch.setattr(store, 'cipher', lambda: box)
    writes = []
    class Database:
        def execute(self, sql, params=()):
            result = Mock()
            result.fetchone.return_value = None
            result.fetchall.return_value = []
            if 'SELECT graph_user_id,is_active' in sql:
                result.fetchone.return_value = {'graph_user_id': 'account', 'is_active': True}
            if 'SELECT selected FROM' in sql:
                result.fetchone.return_value = {'selected': True}
            if 'INSERT INTO' in sql:
                writes.append((sql, params))
            return result
    @contextmanager
    def database():
        yield Database()
    monkeypatch.setattr(store, 'database', database)
    return box, writes


def assert_encrypted(box, token):
    assert BODY not in token
    assert BODY in json.dumps(json.loads(box.decrypt(token.encode())), ensure_ascii=False)
    with pytest.raises(InvalidToken):
        Fernet(Fernet.generate_key()).decrypt(token.encode())


def test_message_and_highlight_body_encrypted_before_sql(capture):
    box, writes = capture
    message = dict(id='m', text=BODY, sender='테스트', created_at=STAMP,
                   modified_at=STAMP, deleted=False, fingerprint='fixture')
    highlight = dict(category='task', importance=3, source_ids=['m'], event_at=STAMP,
                     evidence=BODY, sources=[dict(id='m', text=BODY)])
    assert chat_store.commit_room('user', 'account', 'room', STAMP, [message], [highlight])
    assert len(writes) == 2
    for _, params in writes:
        assert BODY not in repr(params)
        assert_encrypted(box, params[-1])


def test_area_history_nested_source_body_encrypted(capture):
    box, writes = capture
    item = dict(event_at=STAMP, category='task', evidence=BODY,
                sources=[dict(chat_id='room', id='m', text=BODY)])
    assert area_store.commit('user', 'account', {'id': 'area'},
                             {'job_id': 'job', 'cutoff': STAMP}, [item])
    assert len(writes) == 1
    assert BODY not in repr(writes[0][1])
    assert_encrypted(box, writes[0][1][-1])


def test_briefing_reference_body_encrypted(capture):
    box, writes = capture
    group = dict(source_ids=['chat:h'], existing_ids=[], event_at=STAMP,
                 title='테스트', events=[], references=[dict(kind='chat', id='h',
                 evidence=BODY, sources=[dict(id='m', text=BODY)])])
    briefing_store.commit('user', 'account', [group])
    assert len(writes) == 1
    assert BODY not in repr(writes[0][1])
    assert_encrypted(box, writes[0][1][5])


def test_plaintext_and_tampered_content_are_not_accepted(capture):
    plaintext = {'text': BODY}
    first, second = chat_store.encode(plaintext), chat_store.encode(plaintext)
    assert first != second
    assert chat_store.decode(first) == plaintext
    for invalid in [json.dumps(plaintext), first[:30] + ('A' if first[30] != 'A' else 'B') + first[31:]]:
        with pytest.raises(InvalidToken):
            chat_store.decode(invalid)
