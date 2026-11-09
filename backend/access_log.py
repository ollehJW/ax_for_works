"""Append-only login/first-entry history. Never expose session identifiers."""
from backend.database import database

def record_event(db, user, session_key, service_id, kind):
    db.execute("""INSERT INTO platform.access_events
        (user_id,employee_id,full_name,team_name,service_id,event_kind,session_key)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT(session_key,service_id) DO NOTHING""",
        (user['user_id'],user['employee_id'],user['full_name'],user.get('team_name') or '',
         service_id,kind,session_key))

def record_service_entry(request, service_id):
    from backend.auth import COOKIE, find_session_user, token_hash
    token=request.cookies.get(COOKIE)
    if not token:
        return
    with database() as db:
        user=find_session_user(db,token)
        if not user or user['must_change_password']:
            return
        record_event(db,user,token_hash(token),service_id,'service_entry')
