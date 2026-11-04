# WiaReport temporary security-review deployment

Deployment date: 2026-11-04.

## Current status: original service restored (2026-11-05)

The temporary backend and frontend have been stopped. Only their Supervisor program sections were replaced with the original WiaReport sections from the pre-cutover backup. Original `wiareport-backend` and `wiareport-frontend` reached RUNNING, and backend health and frontend readiness checks passed. Public `/wiareport/` and `/wiareport/agent` returned HTTP 200, with successful TLS certificate verification.

Use `https://axforwork.wia.co.kr/wiareport/agent` for the restored platform-integrated service. The original frontend binds to loopback, so the temporary external 31003 entry is no longer used. `/home/jongwook/wiareport_temp` and `/data/wiareport_temp` remain preserved and inactive. No temporary SQLite data was merged into the original PostgreSQL database. Other services were not restarted.

The sections below describe the preceding temporary deployment.

## Version and access

- Exact application commit: `0fd2ad0936f9b32685eb5e6de3744bfbbc3f44e5` (Require HTTPS transport and restrict backend to loopback).
- Checkout: `/home/jongwook/wiareport_temp`, detached at the requested commit. No application source changes.
- Original checkout remains `/home/jongwook/wiareport` and is unchanged.
- Public entry: `https://axforwork.wia.co.kr:31003/`.
- External port 31003 maps to internal HTTPS frontend port 1003. Backend listens only on `127.0.0.1:1013`.
- This version predates platform SSO and PostgreSQL migration; it uses the original team-account login and SQLite. Platform `/wiareport` integration has not been adapted to this standalone review version.

## Isolated data

- Runtime environment: `/data/wiareport_temp/runtime.env`, linked from the temporary checkout's `.env`.
- SQLite database: `/data/wiareport_temp/app.db`.
- Source: `/data/wiareport/app.db`, last modified 2026-10-14 UTC. Copied with SQLite backup API, not a filesystem copy of a live database.
- This is the preserved legacy dataset, **not** a clone of current PostgreSQL data. Later PostgreSQL writes are not included. Current PostgreSQL data remains untouched.
- Workspace: `/data/wiareport_temp/workspace`, independently copied from `/data/wiareport/workspace`.
- TLS material: `/data/wiareport_temp/tls/`; private key and environment permissions 0600, parent directory 0700.
- Logs: `/data/wiareport_temp/logs/`.
- Pre-start database snapshot: `/data/wiareport_temp/backups/app.before-start.db`.
- Clone provenance and original-file SHA-256: `/data/wiareport_temp/deployment.json`.
- The legacy application's own initialization and report scheduling can update only the temporary database.

## Process management

Existing Supervisor configuration: `/data/ax_for_works/supervisord.conf`.

Only the original `wiareport-backend` and `wiareport-frontend` program sections were replaced with `wiareport_temp-backend` and `wiareport_temp-frontend`. This avoids the boot script's `start all` restarting the original service on occupied ports. All other programs were left running.

Temporary launch scripts:

- `/data/wiareport_temp/bin/backend.sh`
- `/data/wiareport_temp/bin/frontend.sh`

Original Supervisor configuration snapshot: `/data/wiareport_temp/backups/supervisord.before-temp.conf`.

To restore, stop both temporary programs, restore **only the two WiaReport program sections** from that snapshot into the current Supervisor configuration, then reread/update only the old and new WiaReport program groups. Do not overwrite unrelated later Supervisor changes. Original launch scripts, checkout and PostgreSQL configuration remain available. Temporary SQLite writes are not merged back into PostgreSQL.

## Validation performed

- Exact Git commit and clean temporary worktree verified.
- Frontend production build succeeded; pinned Python dependencies installed in an independent virtual environment.
- Preflight started on loopback-only alternate ports before stopping the original service.
- Valid trusted certificate with hostname validation; TLS 1.2 and TLS 1.3 passed.
- TLS 1.0/1.1, CBC/static-RSA test suites, and plaintext HTTP requests blocked by existing transport implementation.
- Public HTTPS root and `/api/health` returned 200.
- Browser rendered the legacy login form without JavaScript errors; no employee login or impersonation performed.
- Temporary DB integrity check passed; original SQLite SHA-256 unchanged.
- Both temporary Supervisor programs reached RUNNING.

This validates deployment and transport behavior, not completion of the pending security review.
