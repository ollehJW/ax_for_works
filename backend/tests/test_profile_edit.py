"""Profile editing tests: mocked database only, no real account mutations."""
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth

class ProfileEditTests(unittest.TestCase):
    def setUp(self):
        self.row=dict(user_id='fixture', password_hash='encoded', is_active=True,
                      must_change_password=False, organization='Org',team_name='Team',role_name='Role',
                      updated_at=datetime(2026,11,10,tzinfo=timezone.utc))
        self.db=MagicMock()
        self.db.execute.return_value.fetchone.side_effect=lambda:self.row
        self.db.execute.return_value.fetchall.return_value=[{'team_id':'new-team','name':'New Team'}]
        self.payload=dict(employee_id='fixture',password='existing-password')
        app=FastAPI();app.include_router(auth.router);self.client=TestClient(app)
        for name, value in [('database',None),('consume_public_attempt',None),('verify_password',True)]:
            p=patch.object(auth,name);m=p.start();self.addCleanup(p.stop)
            if name=='database':m.return_value.__enter__.return_value=self.db
            elif name=='verify_password':m.return_value=value;self.verify=m
    def post(self,path,**extra):
        return self.client.post('/api/auth/profile/'+path,json={**self.payload,**extra})
    def changes(self):
        return [c.args for c in self.db.execute.call_args_list if 'UPDATE platform.users' in c.args[0]]
    def test_verify_returns_only_profile_no_session(self):
        r=self.post('verify');self.assertEqual(r.status_code,200)
        self.assertEqual(set(r.json()),{'organization','team_name','role_name','revision'})
        self.assertEqual(r.headers['cache-control'],'no-store');self.assertNotIn('set-cookie',r.headers)
        self.assertFalse(self.changes())
    def test_wrong_password_and_missing_account_same_error(self):
        self.verify.return_value=False
        a=self.post('verify');self.row=None;b=self.post('verify')
        self.assertEqual(a.status_code,400);self.assertEqual(a.json(),b.json());self.assertFalse(self.changes())
    def test_update_rechecks_credentials(self):
        self.verify.return_value=False
        self.assertEqual(self.post('update',revision='',team_name='New Team').status_code,400)
        self.assertFalse(self.changes())
    def test_partial_edit_updates_own_team_revokes_sessions(self):
        r=self.post('update',revision=self.row['updated_at'].isoformat(),team_name='New Team')
        self.assertEqual(r.status_code,200)
        sql,params=self.changes()[0]
        self.assertIn('team_id=%s',sql);self.assertNotIn('org_id=',sql);self.assertNotIn('role_id=',sql)
        self.assertEqual(params[0],'new-team');self.assertEqual(params[-1],'fixture')
        self.assertTrue(any('DELETE FROM platform.sessions WHERE user_id=' in c.args[0] for c in self.db.execute.call_args_list))
    def test_stale_revision_does_not_update(self):
        self.assertEqual(self.post('update',revision='stale',team_name='New Team').status_code,409)
        self.assertFalse(self.changes())
    def test_disallowed_fields_and_invalid_labels(self):
        for data in [dict(is_admin=True),dict(full_name='Other'),dict(team_name='미지정'),dict(team_name='   ')]:
            self.assertEqual(self.post('update',revision='',**data).status_code,422)
        self.assertFalse(self.changes())
    def test_inactive_or_initial_password_rejected(self):
        self.row['is_active']=False;self.assertEqual(self.post('verify').status_code,400)
        self.row['is_active']=True;self.row['must_change_password']=True
        self.assertEqual(self.post('verify').status_code,403)
    def test_noop_preserves_sessions(self):
        r=self.post('update',revision=self.row['updated_at'].isoformat(),team_name='Team')
        self.assertEqual(r.status_code,200);self.assertFalse(self.changes())
        self.assertFalse(any('DELETE FROM platform.sessions' in c.args[0] for c in self.db.execute.call_args_list))
