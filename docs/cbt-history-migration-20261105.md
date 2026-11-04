# CBT history reconciliation to H200 — 2026-11-05

## Scope and result

Imported a consistent SQLite backup snapshot from the CBT services on the previous server into the existing H200 `wia_platform` database (`wiameet` and `wiareport` schemas). Existing H200 data, platform identities, service settings, and current authentication remain authoritative. The CBT services were not stopped; subsequent CBT writes are not automatically synchronized.

Sources:

- `meeting_write_agent/backend/app.db`, `jobs/`, `backend/workspace/`
- `weekly_report/app.db`, `backend/workspace/`

Target backup/provenance directory (private, mode 0700):
`/data/ax_for_works/backups/cbt-history-20261105/`

No database dumps, credentials, employee records, meeting content, or media are stored in Git.

## Reconciliation rules

- Compare the CBT snapshot, the original H200 SQLite migration baseline, and current PostgreSQL records. Update a field only when the target still matches its baseline; preserve divergent target edits.
- Map teams only by existing IDs or an exact, unique platform team match. Map new report members only through an exact, unique name within the matched platform team. Never assign legacy team activity to a guessed individual employee.
- Do not recreate members previously deleted from H200. Unmapped records and dependent history remain in the private source snapshot and skip manifests.
- Reconcile report IDs by team, part, start date, and end date; then reconcile entries by report and member. Remap image paths to these target IDs. An untouched auto-created pending entry may adopt a completed source entry; preserve authored target content/status.
- Numeric WiaMeet usage/stage IDs are independently allocated by each server. Compare full event content excluding the numeric ID, including multiplicity, and allocate new target IDs to avoid collisions.
- Copy only new asset destinations; do not overwrite existing live files. Preserve final report text and metadata; encrypt imported final audio with the existing H200 audio encryption key and validate authenticated decryption/digests.
- Legacy credentials, login sessions, login events, Confluence tokens/settings, templates and attendee configuration are not imported into live account/configuration tables. Original snapshots are retained privately.

## Applied changes

WiaMeet:

- 98 meeting reports, 42 Confluence publication-history records.
- 183 job records, 100 recording records, 74 terminal processing-job records.
- 1,385 LLM usage events and 2,182 processing-stage duration events.
- 10 retained recording drafts, 30 categories, one team workspace and mapping.
- One existing job-history record updated using the three-way comparison.
- 98 final audio files encrypted and verified.

WiaReport:

- 15 projects added; 16 existing projects updated using the three-way comparison.
- 41 new report periods; matching periods merged into existing report IDs.
- 157 report entries added and 21 existing entries updated.
- 562 project-entry records added and 12 updated.
- 244 progress items, 31 issues, 109 plans, 12 milestones, 38 epics, 91 team events added.
- Related member assignments, event memberships and schedule-history links reconciled.

131 asset paths (job directories, recording-draft directories and report image files) installed without overwriting existing files.

## Exceptions preserved for review

- Two source Confluence publication records reference missing meeting reports; not inserted as orphan records.
- 44 previously deleted legacy members were not recreated.
- Five new report members lack a unique platform-account match; their dependent records were not attached to an arbitrary employee.
- An unmapped legacy test team and its dependent records were not imported into a new active platform team.
- Six report-entry status conflicts retain H200's status. No report-body conflicts were found.
- Detailed per-record reasons, ID mappings and source values are in private `wiameet-plan.json` and `wiareport-plan.json`. Skip counts include dependent records, not just distinct people.

## Execution and verification

- Created SQLite snapshots with the backup API; retained PostgreSQL schema backups before preparation and immediately before applying (`final-before-merge.dump`).
- Executed the full plan in a transaction and rolled it back for a constraint/count rehearsal. Audit identity sequences can acquire harmless gaps from this rehearsal; no business rows persisted from it.
- Stopped only WiaMeet and WiaReport backends for final backup, asset installation and a single transaction across both schemas. Restarted both successfully.
- Applied 4,107 WiaMeet and 1,539 WiaReport row operations. Re-read every affected record and compared all planned values after restart: no mismatches.
- Checked attachment existence, installed destinations, validated constraints and final encrypted audio. Both internal health endpoints returned 200; platform routes and TLS remained available.
- Private scripts and evidence: `plan.py`, `apply.py`, `files.py`, `cutover.py`, `verify.py`, `verification.json`, `file-plan.json`, `installed-files.json`, `commit-result.json`.

## Recovery and follow-up

Do not rerun `cutover.py`; it refuses a second committed execution. A later incremental sync requires a new source snapshot and a fresh reviewed plan.

Backups include both schema snapshots and immutable source snapshots. After users make new H200 writes, do not restore the schema dump wholesale: compare subsequent writes and use targeted reversal/reconciliation. The installed-file manifest identifies paths introduced by this migration; do not remove them while imported records reference them.
