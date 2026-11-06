# Contributor Checks and Release Signing

## Goal and constraints

- Ordinary contributors can verify code, protocols, recovery, the frontend and adapter isolation without a release private key.
- main is the auto-update source for existing clients, so signing and digest alignment must be completed before release sources are merged.
- Keep the existing Ed25519 public key, the client update source, the manifest format and the LF release-byte convention.
- Do not provide Secrets to fork PRs, and do not execute a candidate commit's code or npm lifecycle in the signing job.
- The signing artifact is only a patch awaiting review; it does not automatically commit, push, merge, tag or release.
- Assume a low release frequency, prefer standard Node/Git, add no new runtime dependencies; approvals and the private key are managed by the maintainer.

## Decision record

| Decision | Alternatives considered | Reason for the choice |
| --- | --- | --- |
| Separate code checks from release readiness | Run the signing digest check on all PRs; delete the release check outright | The former mixes the maintainer's signing to-do into code failures; the latter would let a broken update source through |
| The default `npm test` remains the full verification | Skip the release suite by default | Avoids the old command silently losing release protection |
| Trusted main scripts read candidate Git objects | Check out the PR with the private key and run its build scripts | Candidate scripts and `src/updater.js` can both be changed by a contributor and must not be imported in a Secrets job |
| A protected manual flow generates the patch | Re-sign automatically after merging; write to main automatically | main is the update source, so drift between merging and re-signing would affect old clients; a patch can be reviewed before merging |
| Keep the release-readiness merge gate | Merge as soon as ordinary code checks pass | Passing code and being safe to upgrade to are two independent acceptance facts |

Do not switch to a new release branch or a tag update source: changing only new clients' default URL cannot migrate old clients.

## Contributors

```bash
npm run test:contributor
npm install
npm run typecheck
git diff --check
```

The project has no build step. Type checking covers the adapter only; do not claim it covers the whole plugin.

Contributor mode still runs the catalog's structure, provenance and adapter isolation checks; only the alignment of release bytes and
the most recent content revision is left to the maintainer. Consistency between the manifest and the catalog integrity records is still checked.
Do not make checks green with a placeholder signature or a new public key, and do not copy an existing signature onto a modified manifest.

GitHub's `offline` and `typecheck` are code checks. `release-readiness` runs
`npm run test:release`; a failure means release preparation is not yet complete and is handled by the key-holding maintainer.
The default `npm test` runs all suites; `npm run test:release` specifically checks the real manifest, the upgrade chain and the catalog.

## Maintainer configuration (one-time)

This code change does not create Secrets, approvers or branch protection for you. Repository administration rights are required to complete:

1. Create the Environment `release-signing`, configure Required reviewers, and forbid the run initiator from approving their own run;
   allow Deployment branches only from `main`, and disable administrator bypass (where the platform supports it).
2. After confirming the protection rules are in effect, store the PEM content of the **existing** release private key in that Environment's
   `RELEASE_MANIFEST_PRIVATE_KEY`. Do not use an ordinary repository Secret, and do not generate a replacement trust root.
3. main's merge gate requires `offline`, `typecheck` and `release-readiness` all to succeed,
   and requires branches to be up to date with main. Merely adding workflow files does not configure these protections.
4. Use an ordinary merge that preserves the candidate commit history. Squash or rebase changes the content commit SHA and
   breaks the catalog revision convention; do not change the merge method after signing is complete.

When this flow is first introduced, the workflow is not yet in main, so the maintainer first completes the current PR's manifest and catalog records using the local signing method in `RELEASING.md`
and runs the full tests; only then can the new flow be started from main.

## Preparing a signature for a reviewed candidate

1. Merge the latest main into the candidate branch, complete the review and code checks; record the full 40-character candidate commit SHA.
2. Manually run `prepare-release` from **main**, filling in `candidate_sha`.
   The Environment approver verifies the input SHA, the diff and the code check results before approving.
3. The workflow pins this main's scripts, only fetches the candidate Git objects, and does not check out the candidate.
   A main that has moved ahead, a candidate that is not a descendant of main, a wrong key, a downgrade, a path escape, a linked file,
   or exceeding the client manifest limits all fail, and produce no usable signature patch.
4. Download the `signed-release-<SHA>` Artifact (retained for 7 days), unpack it and review
   `receipt.json` and `release.patch`. The receipt records the trusted main, the candidate commit,
   the most recent content commit, the release version and the patch's SHA-256.

Apply the patch in a local candidate workspace without the private key; in the example below, `ARTIFACT` is the downloaded, unpacked directory:

```bash
test -z "$(git status --porcelain)"
ARTIFACT=/absolute/path/to/signed-release-artifact
node --input-type=module - "$ARTIFACT" "$(git rev-parse HEAD)" <<'NODE'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const [dir, head] = process.argv.slice(2)
const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json')))
const patch = fs.readFileSync(path.join(dir, 'release.patch'))
assert.equal(receipt.candidate, head, 'The candidate has changed; please prepare again')
assert.equal(receipt.patchSha256, crypto.createHash('sha256').update(patch).digest('hex'))
NODE
git apply --check "$ARTIFACT/release.patch"
git apply "$ARTIFACT/release.patch"
git diff --check
git diff --stat
npm test
npm run typecheck
# Commit only these four release records; do not modify release sources at the same time
git add feed/manifest.json catalog/integrity.json catalog/dsh-plugin.json catalog/provenance.json
git commit -m "Prepare the release signature and catalog records for the reviewed candidate"
```

The patch also refreshes both catalog revisions to the most recent commit in the candidate that touched `package.json` / `files`;
this metadata commit does not change release bytes, so the revision does not need to be changed again. The patch format and the client's parse/signature-verification contract
are validated by the real updater. The signature only vouches for the candidate bytes; it does not mean tests or code review have passed.

The maintainer sends the signature commit back to the original PR branch, or creates an integration branch/PR containing the original contribution commits and the signature commit;
contributors still need no private key. Once GitHub's three checks are all green, merge into main with an ordinary merge.
If the candidate sources, the version or main change again, prepare anew; do not reuse an old patch. Continue with tagging, CDN purge and a live audit from an installed user's perspective as described in `RELEASING.md`.

## Security boundaries and acceptance limitations

- `prepare-release` has only `contents: read`, and the private key exists only in the signing step's environment variables;
  Node removes that environment variable before starting Git child processes, and the Artifact contains no private key.
- It only reads ordinary release files and the four JSON records from Git blobs; candidate scripts, Git hooks,
  checkout filters, npm install and candidate modules are not executed. The signature API's test-key injection entry point
  is not exposed as a CLI parameter; the production CLI always verifies against the built-in public key of the trusted main.
- Tests use one-time fixture keys and isolated Git repositories; they do not modify the production manifest, nor verify a real GitHub
  Environment approval, Secrets configuration or a production release; those must be configured by the maintainer and then accepted.
- The release-readiness check may still fail due to old-manifest drift on the current main. This flow does not describe an unsigned main
  as releasable, and does not change the signature verification and rollback mechanisms of installed clients.

## Rollback

Disable the `prepare-release` workflow and delete the Environment Secret (performed by the maintainer);
continue using the local existing private key and the full `npm test` gate. When rolling back the code-check layering, restore the old workflow
and test runner. Already-signed manifests are still verified against the original public key, and no user data migration is needed.
