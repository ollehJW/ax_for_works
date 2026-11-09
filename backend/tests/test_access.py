"""Unit coverage: no production identities, sessions or database writes."""
from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import MagicMock,patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import access_log,access_admin
from backend.auth import ready_user

class AccessTests(TestCase):
    def test_korea_date_boundaries(self):
        before=access_admin.period_bounds(7,datetime(2026,11,9,14,59,tzinfo=timezone.utc))
        after=access_admin.period_bounds(7,datetime(2026,11,9,15,0,tzinfo=timezone.utc))
        self.assertEqual(str(before[1]),'2026-11-09')
        self.assertEqual(str(after[1]),'2026-11-10')
        self.assertEqual((after[3]-after[2]).days,7)

    def test_insert_is_atomic_and_deduplicates_session_service(self):
        db=MagicMock()
        access_log.record_event(db,{'user_id':'fixture','employee_id':'E','full_name':'Test'},'hashed-session','wiameet','service_entry')
        sql,params=db.execute.call_args.args
        self.assertIn('ON CONFLICT(session_key,service_id) DO NOTHING',sql)
        self.assertEqual(params[-3:],('wiameet','service_entry','hashed-session'))

    def test_unauthenticated_service_entry_not_recorded(self):
        request=MagicMock();request.cookies={}
        with patch.object(access_log,'database') as db:
            access_log.record_service_entry(request,'wiameet')
            db.assert_not_called()

    def test_initial_password_user_not_counted_as_service_entry(self):
        from backend import auth
        request=MagicMock();request.cookies={auth.COOKIE:'fixture'}
        with patch.object(access_log,'database'),patch.object(auth,'find_session_user',return_value={'must_change_password':True}),patch.object(access_log,'record_event') as record:
            access_log.record_service_entry(request,'wiameet');record.assert_not_called()

    def test_non_admin_forbidden(self):
        app=FastAPI();app.include_router(access_admin.router)
        app.dependency_overrides[ready_user]=lambda:{'is_admin':False}
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/admin/access').status_code,403)

    def test_invalid_period_and_service(self):
        app=FastAPI();app.include_router(access_admin.router);app.state.agent_registry={}
        app.dependency_overrides[ready_user]=lambda:{'is_admin':True}
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/admin/access?days=8').status_code,422)
            self.assertEqual(client.get('/api/admin/access?service=unknown').status_code,422)

    def test_successful_login_records_event_but_failure_does_not(self):
        from backend import auth
        from fastapi import Request, Response, HTTPException
        user={key:None for key in auth.PUBLIC_FIELDS}
        user.update(user_id='fixture',employee_id='E',full_name='Test',is_active=True,password_hash='fixture')
        db=MagicMock()
        def execute(sql,params=None):
            result=MagicMock()
            result.fetchone.return_value=None if 'SELECT count FROM platform.login_attempts' in sql else user
            return result
        db.execute.side_effect=execute
        request=Request({'type':'http','headers':[],'client':('127.0.0.1',1)})
        with patch.object(auth,'database') as context,patch.object(auth,'verify_password',return_value=True) as verify,patch.object(auth,'set_session',return_value='fixture-session'),patch.object(auth,'record_event') as record:
            context.return_value.__enter__.return_value=db
            auth.login(auth.LoginBody(employee_id='E',password='fixture'),request,Response())
            record.assert_called_once_with(db,user,'fixture-session','platform','login')
            record.reset_mock();verify.return_value=False
            with self.assertRaises(HTTPException):
                auth.login(auth.LoginBody(employee_id='E',password='fixture'),request,Response())
            record.assert_not_called()

    def test_gateway_records_only_successful_service_document(self):
        import tempfile
        from pathlib import Path
        import httpx
        from backend.gateway import register_gateway
        with tempfile.TemporaryDirectory() as folder:
            config=Path(folder)/'config.yaml'
            config.write_text('version: 1\ngateways:\n  - prefix: /wiameet\n    upstream: http://upstream.test\n')
            app=FastAPI();register_gateway(app,config)
            status=[200]
            async def respond(request):
                return httpx.Response(status[0],stream=httpx.ByteStream(b'ok'))
            app.state.gateway_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))
            with patch.object(access_log,'record_service_entry') as record,TestClient(app) as client:
                client.get('/wiameet/agent');self.assertEqual(record.call_count,1)
                client.get('/wiameet/');client.get('/wiameet/assets/a.js');client.get('/wiameet/api/health')
                self.assertEqual(record.call_count,1)
                status[0]=500;client.get('/wiameet/agent')
                self.assertEqual(record.call_count,1)
