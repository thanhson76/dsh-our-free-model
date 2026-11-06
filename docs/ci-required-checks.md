# Required PR Checks and Release Preparation

## Why the checks wait forever to be reported

Ruleset `24626699` requires the following two full check names to be reported by GitHub Actions:

- `test / offline (pull_request)`
- `test / release-readiness (pull_request)`

The GitHub page displays a combination of the workflow, job and event names, but by default the jobs actually only report
`offline` and `release-readiness`. When the names in the rules do not match the names actually reported, the page
shows both the run results and two `Expected — Waiting for status to be reported` entries.
Deleting a workflow job does not delete the required checks from the repository rules either.

`test.yml` explicitly sets `name` on these two real test jobs to match the existing rules, so that
the check results can be recognised by the rules. `typecheck` and `standalone-frontend` continue to run separately.
The jobs do not return success unconditionally; a real test failure still blocks merging.

## Release preparation for a source PR

After the plugin's release files are modified, the release manifest and file digests may temporarily be out of sync. That is
a real `release-readiness` failure that requires preparing a signature record; it will not disappear by re-running.

1. Merge the latest `main` into the candidate branch and complete the source review and contributor tests.
2. Record the candidate's full commit SHA, and start the existing `prepare-release`
   workflow from a trusted `main`, filling `candidate_sha` with that SHA.
3. A reviewer designated by the `release-signing` environment approves the release preparation. The signing private key stays only in
   GitHub Actions; the workflow reads the candidate files from Git objects and does not execute candidate code.
4. Download the `signed-release-<candidate SHA>` artifact and confirm that `candidate` in `receipt.json`
   matches the candidate branch's current HEAD, and that `patchSha256` matches the patch digest.
   Confirm that the patch only modifies `feed/manifest.json` and the three `catalog` record files.
5. Check `release.patch` with `git apply --check`, then apply it, run
   `npm run test:release`, commit the signature record separately and push the candidate branch.
6. Confirm that the two required checks actually pass in the new run. If release files are modified again afterwards, prepare
   a new signature record for the corresponding candidate; do not reuse an old patch.

For a PR that only modifies non-release files such as CI or documentation, and whose existing signature record is still in sync, no re-signing is needed.
`release-sign` retains its original verification and signing logic after merging.

## Acceptance

- The actual `name` in the checks API matches the `context` in the rules character for character.
- Both checks are reported by GitHub Actions (app ID `15368`).
- The new run includes the two required tests plus the other two type and frontend checks.
- Once the checks genuinely pass, the corresponding yellow Expected entries no longer appear.
- After the fix is merged, old PRs need to sync the latest `main` and trigger a new run; historic runs are not deleted.
