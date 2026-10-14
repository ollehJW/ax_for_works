# WiaVoice shared platform login

WiaVoice uses the same ax_platform_session cookie and platform.sessions table
as AX for Works, WiaNews and WiaMeet. No additional session is issued.
The frontend login destination allowlist includes /wiavoice and its child paths.
The runtime gateway at /data/ax_for_works/config/config.yaml sets require_login
for /wiavoice. Its upstream remains http://127.0.0.1:1005 (FastAPI: 1015).

WiaVoice validates the session for content APIs, including audio, independently
of the gateway. Expired/revoked sessions and inactive users are rejected.
Logout removes the shared session; all services using that session lose access.
Generated jobs and custom uploads are private to their creating platform user.
Anonymous historical files are preserved without assigning an arbitrary owner.

The wia_platform database now has a wiavoice schema for future service tables.
Accounts and sessions remain exclusively in platform. Service data still uses
JSON and WAV files; retention was not changed in this authentication update.
Database secrets are stored outside source in /data/wiavoice/auth.env (0600).

Validated: return-path unit tests, 18 WiaVoice backend tests, actual browser
platform login/return, shared WiaNews identity, preview audio, logout and revoked
cookie replay, direct service API rejection, database expiry/inactive-account/
required-password handling. Temporary test account and sessions were removed.
