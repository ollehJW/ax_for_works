# Repository workflow

- Remote: https://github.com/ollehJW/ax_for_works.git
- The user has requested ongoing commits and pushes after changes are implemented and verified. Commit completed changes and push to the configured upstream without asking for permission again.
- Check the diff and staged files for secrets before committing. Never commit .env, credentials, certificates, database files, dependencies, or build outputs.
- Do not force-push or overwrite unrelated remote changes. Integrate remote changes safely when necessary.
