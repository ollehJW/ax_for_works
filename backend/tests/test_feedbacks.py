"""Opt-in DB tests use only session-local temporary tables and a mocked identity.
No real account/session/feedback rows are created or modified.
Run: AX_RUN_FEEDBACK_TESTS=1 .venv/bin/python -m unittest backend.tests.test_feedbacks -v
"""
import base64
from contextlib import contextmanager
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import psycopg
from fastapi.testclient import TestClient
from PIL import Image
from backend.auth import ready_user
from backend.database import ROOT, connection_options
from backend.main import create_app


@unittest.skipUnless(os.getenv('AX_RUN_FEEDBACK_TESTS') == '1', 'Opt-in temporary-table integration test')
class FeedbackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = psycopg.connect(**connection_options())
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TEMP TABLE feedback_test_users(user_id TEXT PRIMARY KEY,full_name TEXT)')
        self.db.execute("INSERT INTO feedback_test_users VALUES ('fixture-owner','Fixture Owner'),('fixture-other','Fixture Other')")
        sql = (ROOT/'backend/sql/feedbacks.sql').read_text().replace('CREATE TABLE IF NOT EXISTS platform.feedbacks','CREATE TEMP TABLE feedback_test_records').replace('platform.feedbacks','feedback_test_records').replace('platform.users','feedback_test_users')
        self.db.execute(sql)
        connection = self.db
        class IsolatedDB:
            def execute(self, sql, args=None):
                return connection.execute(sql.replace('platform.feedbacks','feedback_test_records').replace('platform.users','feedback_test_users'), args)
        @contextmanager
        def database(): yield IsolatedDB()
        self.patch = patch('backend.feedbacks.database', database); self.patch.start();self.addCleanup(self.patch.stop)
        env = patch.dict(os.environ, {'AX_FEEDBACKS_DIR':self.temp.name});env.start();self.addCleanup(env.stop)
        self.app=create_app()
        self.user={'user_id':'fixture-owner','is_admin':False}
        self.app.dependency_overrides[ready_user]=lambda:self.user
        self.client=TestClient(self.app,raise_server_exceptions=False);self.addCleanup(self.client.close)
        self.headers={'X-AX-Request':'1','Origin':'http://testserver'}
        buffer=BytesIO();Image.new('RGB',(12,12),'navy').save(buffer,format='PNG')
        self.image={'name':'screen.png','data':base64.b64encode(buffer.getvalue()).decode()}

    def submit(self, **changes):
        body={'feedback_type':'agent_bug','agent_id':'wiameet','content':'Example feedback','images':[self.image]}
        body.update(changes)
        return self.client.post('/api/feedbacks',json=body,headers=self.headers)

    def test_image_roundtrip_and_owner_admin_access(self):
        response=self.submit();self.assertEqual(response.status_code,201,response.text)
        feedback_id=response.json()['feedback_id'];self.assertEqual(len(list((Path(self.temp.name)/feedback_id).iterdir())),1)
        history=self.client.get('/api/feedbacks').json();self.assertEqual(history['total'],1)
        item=history['feedbacks'][0];self.assertEqual(item['agent_name'],'WiaMeet');self.assertEqual(item['author_name'],'Fixture Owner')
        attachment=item['images'][0];self.assertNotIn('filename',attachment)
        image=self.client.get(attachment['url']);self.assertEqual(image.status_code,200);self.assertEqual(image.headers['content-type'],'image/png');self.assertEqual(image.headers['cache-control'],'no-store')
        self.user={'user_id':'fixture-other','is_admin':False}
        self.assertEqual(self.client.get('/api/feedbacks').json()['total'],0)
        self.assertEqual(self.client.get(attachment['url']).status_code,404)
        self.user={'user_id':'fixture-other','is_admin':True}
        self.assertEqual(self.client.get('/api/feedbacks').json()['total'],1)
        self.assertEqual(self.client.get(attachment['url']).status_code,200)

    def test_six_types_and_agent_requirements(self):
        for kind in ['agent_bug','agent_improvement','agent_usage','new_agent','platform_inquiry','other']:
            needs_agent=kind.startswith('agent_')
            self.assertEqual(self.submit(feedback_type=kind,agent_id='wiameet' if needs_agent else None,images=[]).status_code,201)
        for changes in [{'agent_id':None},{'feedback_type':'agent_usage','agent_id':None},{'feedback_type':'platform_inquiry'},{'agent_id':'unknown-agent'},{'feedback_type':'other'},{'content':'   '},{'content':'x'*10001},{'feedback_type':'unknown'},{'images':[self.image]*6}]:
            self.assertEqual(self.submit(**changes).status_code,422,changes.keys())
        self.assertEqual(self.client.get('/api/feedbacks').json()['total'],6)

    def test_attachment_validation_and_request_size(self):
        for data in ['not-base64!',base64.b64encode(b'<svg onload="alert(1)"></svg>').decode(),base64.b64encode(b'not a png').decode()]:
            self.assertEqual(self.submit(images=[{'name':'fake.png','data':data}]).status_code,422)
        with patch('backend.feedbacks.MAX_IMAGE_BYTES',1):self.assertEqual(self.submit().status_code,413)
        with patch('backend.feedbacks.MAX_REQUEST_BYTES',1):self.assertEqual(self.submit().status_code,413)
        self.assertEqual(list(Path(self.temp.name).iterdir()),[])

    def test_csrf_and_auth(self):
        self.assertEqual(self.client.post('/api/feedbacks',json={}).status_code,403)
        self.assertEqual(self.client.post('/api/feedbacks',json={},headers={'X-AX-Request':'1','Origin':'https://untrusted.example'}).status_code,403)
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/api/feedbacks').status_code,401)
        self.assertEqual(self.submit().status_code,401)

    def test_cleanup_on_database_error(self):
        @contextmanager
        def broken():raise psycopg.OperationalError('fixture failure');yield
        with patch('backend.feedbacks.database',broken):self.assertEqual(self.submit().status_code,503)
        self.assertEqual(list(Path(self.temp.name).iterdir()),[])

    def test_pagination_and_database_constraints(self):
        for i in range(11):self.assertEqual(self.submit(images=[],content=f'feedback {i}').status_code,201)
        self.assertEqual(len(self.client.get('/api/feedbacks?page=1').json()['feedbacks']),10)
        self.assertEqual(len(self.client.get('/api/feedbacks?page=2').json()['feedbacks']),1)
        self.assertEqual(self.client.get('/api/feedbacks?page=0').status_code,422)
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.db.execute("INSERT INTO feedback_test_records(feedback_id,feedback_type,content) VALUES ('invalid','agent_bug','content')")

if __name__=='__main__':unittest.main()
