# H200 shared LLM configuration

The WiaMeet, WiaReport, WiaNews and WiaCoding backends load their LLM connection settings from `/data/shared/llm.env`. The file is private (mode 600) and must never be committed.

Common keys:
- `OPENAI_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_API_VERSION`

An optional service prefix overrides a common value, for example `WIAREPORT_OPENAI_MODEL` or `WIACODING_OPENAI_API_KEY`. All values, including overrides, are managed in this one file. Removing an override opts that service into the common value. The initial migration preserves existing model and credential differences; it does not rotate keys or switch deployments.

Supervisor invokes `ops/shared-llm.py <service> -- <existing command>` using the platform virtualenv. The loader validates all four required settings before starting the service and passes them as environment variables without logging their values. The corresponding keys have been removed from service-local runtime files. Do not reintroduce them: existing launchers may overwrite inherited environment variables.

After editing the private file, restart only the affected backends, one at a time:

```sh
/home/jongwook/ax_for_works/.venv/bin/supervisorctl   -c /data/ax_for_works/supervisord.conf restart wianews-backend
```

Available backend names: `wiameet-backend`, `wiareport-backend`, `wianews-backend`, `wiacoding-backend`. Common key changes require restarting all four. File edits are not hot-reloaded.

DB, mail, STT/TTS settings, and service-specific timeout/retry parameters remain in their current service files. WiaVoice uses its existing WiaTTS environment and is not an Azure OpenAI client in this migration. The platform itself has no shared LLM consumer.

Private rollback backups are under `/data/shared/backups/` and contain the previous per-service environment files and Supervisor configuration. They contain secrets and must not be committed. To roll back, restore those files to their original locations and restore the saved Supervisor configuration, then reread/update the four backend groups. Do not run the legacy `h200-runtime.py configure` command over the deployed multi-service Supervisor configuration.
