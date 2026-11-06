# Verification of Windows Permissions for Private Files

## Implementation

Node ignores the permission bits of `mode` on Windows, so the 0600 on-disk guarantee promised by the README stops working. A new `src/private-file.js` was added: on Windows it uses `icacls /inheritance:r /grant:r` to remove inherited ACEs and keep only the current user (the account name is taken from `process.env.USERNAME`, read via the UTF-16 API, avoiding `whoami`'s OEM code page decoding a non-ASCII machine name into mojibake); on other platforms chmod is kept. If icacls fails, it throws and abandons the write — a file that cannot meet the promise is not written to disk.

The integration points are all credential and private-data writes in hand-written source that carry a 0600/0600 semantic promise: `src/eac-user.js`, `src/egress.js`, `src/picks.js`, `src/store.js` (including the corruption backup), `src/updater.js`, `src/magpie-engine.js` (two places), `packages/standalone/channels/credentials.mjs`, `packages/standalone/workbench.mjs` (privateWrite), `packages/standalone/client-terminal.mjs` (privateFile); the local implementation in `src/subscriptions.js` was changed to reuse the shared module, incidentally fixing the whoami encoding defect. All `mode: 0o600` entries are retained; workbench's `chmodSync` is retained as a test injection seam.

The standalone service packaging manifest (`scripts/pack-standalone.mjs`) registers `private-file`; a new `private-file` regression suite was connected to the unified runner, asserting the actual ACL from icacls (ASCII ACE markers are stable across locales) and the POSIX permission bits, and verifying JsonStore and eac-user write/read-back end to end.

## Executed

- `node scripts/test-all.mjs --mode contributor --only private-file`: 4/4 passed (on a Windows local machine, with real icacls ACL assertions).
- `subscriptions` suite: 38/38 passed. Previously only 1/38 passed on this machine, all reporting `Cannot read private subscription storage`; the root cause was precisely the whoami OEM encoding, cured together with this shared-module fix.
- The `updater`, `picks`, `magpie-engine`, `chan-relay`, `forward`, `workbench`, `workbench-library`, `workbench-management`, `client-terminal`, `standalone-package` and `gemini-gateway` suites: passed.
- `node scripts/standalone-channels-test.mjs`: 14/14 passed (direct test of the credentials store).
- `npm run test:contributor`: 94/94 suites passed (during the run, `forward` failed once intermittently; it passed when run alone and on re-runs, and was judged to be concurrency jitter unrelated to this change).
- `node --check` on all changed source files, `git diff --check`: passed.

## Boundaries

- The coverage is file-level 0600 writes in hand-written source; `service.mjs`'s lock file and `error.json` (neither containing sensitive content) and the 0700 directory mkdir calls in various places were not integrated, and directory-level restriction still exists only on subscriptions' own directory.
- It was not run on a real POSIX platform (the new suite's POSIX branch asserts the permission bits, and the logic matches the original chmod); CI on Linux will cover it.
- No real DSH host hot-reload acceptance was done and `test:release` was not run (aligning the signed manifest belongs to the official release process, which this branch does not touch), and the desktop installer was not rebuilt.
- icacls resolution of a bare user name under Microsoft accounts/domain accounts was not measured case by case; the local machine (local account, non-ASCII machine name) verified successfully.
