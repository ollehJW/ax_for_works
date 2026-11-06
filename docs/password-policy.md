# Password policy (2026-11-06)

New account passwords and password changes require 9–128 characters, including ASCII uppercase, lowercase, digits and punctuation. The substring 'wia' is prohibited case-insensitively.

Existing password hashes and must-change flags are not migrated or updated. Login continues to validate the existing password, independent of the new-password policy.

The login-page reset action generates a 16-character temporary password using Python secrets, satisfying the same policy. Only its salted hash is stored. Successful reset revokes the account's sessions and requires a password change on the next login. The temporary password is returned in a no-store response and shown in the result dialog; it is not placed in browser storage and disappears when the dialog is closed. Identity matching and rate limits remain in place.

Validation:
- Six database-mocked unit tests cover policy, registration, legacy-password acceptance, random generation, reset hashing/session revocation and mismatched identity.
- Browser checks with mocked APIs cover reset guidance, result display, no browser persistence, clearing on close and registration guidance.
- The disposable PostgreSQL integration reset test now uses the generated password. It was not run against production.
