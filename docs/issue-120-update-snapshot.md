# Issue #120: Upgrade Distribution Cache and Pinned-Commit Fetching

## Goal and boundaries

Fix the problem where the manifest and files fetched via a mutable branch may come from different commits, and handle the current CDN's
redirect for `vendor/channel-pack/NOTICE.md`. Keep the existing public key, manifest fields, signature algorithm,
file sizes and SHA-256 verification; keep the behaviour that an old installation is unchanged when staging fails.

Reuse the existing mirrors and the atomic upgrade flow, with no new runtime dependencies. Assume a low release frequency, with each check and application allowing
one GitHub API branch resolution; resolution and manifest reading complete within each source's 15-second budget.
When the GitHub API is unreachable or rate-limiting, mutable-branch downloading is refused and the failure is displayed; no user Token requirement is added.

## Verified results (2026-10-07)

- The 40 manifest entries of main `fbc3b9b55686fe169bd1fd26bb9211b9d3008d9e` all match Git's
  release bytes and SHA-256; the most recent re-signing commit is `967a596`.
- The CDN initially returned the old manifest from 05:14 and four old code files, while Git/raw returned the new manifest from 07:34.
  A minute-level `?ofm=` does not change this difference. The issue's claim that four files were not re-signed cannot, on this basis, be regarded as a fact about the current main.
- Whole-tree and per-path purges returned finished. One network path then confirmed the current manifest and all 40 files
  match Git, but the local Node old upgrader still reproduced
  `package.json: size 2354 != manifest 2328; vendor/channel-pack/NOTICE.md: fetch failed`.
- After re-purging package/NOTICE, Node obtained the correct 2328-byte package, but NOTICE still returned
  a 301 pointing to raw; a pinned SHA receives that redirect too. That file on raw timed out in this Node request.
- The gcore NOTICE for the same pinned SHA returned 200, 3542 bytes.
- The new upgrader actually downloaded all 40 files of 2.0.0 via the CDN, 4008049 bytes, and completed signature verification, digest verification and read-back.
  That verification was done in a temporary directory and did not replace the Desktop installation or deploy a new version.

## Decision record

| Decision | Alternatives considered | Reason |
| --- | --- | --- |
| Resolve the SHA first, then download the manifest and files | Only add a query parameter; only purge | Measurements show the query parameter is ineffective, and purging cannot eliminate differences between paths and access edges |
| Use GitHub's official commits API | jsDelivr's branch resolution interface | Both measured jsDelivr resolution interfaces returned version=null and cannot provide a full SHA |
| Do not change the signature fields | Add a mandatory signed revision field | Keeps compatibility with the existing manifest and old clients' signature-verification format |
| Reuse the SHA across mirrors within one check; apply re-resolves | Resolve independently per mirror; reuse an old check result | Avoids version mixing caused by switching mirrors or the branch moving during download |
| For a pinned-SHA file, fall back to gcore on connection, redirect, 404/429/5xx | Follow an arbitrary Location; remove the NOTICE check | A legitimate file can be fetched at the same SHA/path; every byte must still conform to the signed manifest |
| No fallback on size, hash or authentication refusals | Switch mirrors on any error | Keeps the existing semantics of integrity failures and authorisation refusals |

## Verification and handover

`npm run test:contributor` covers version resolution, signatures, pinned commits, mirror switching, resolution refusal/timeout,
apply re-resolution, the gcore fallback, bad-file refusal, installation and rollback. `node --check src/updater.js`,
`node --check scripts/live-audit.mjs` and `git diff --check` have passed.
Type checking was run with the TypeScript 5.9.3 installed in the adjacent main workspace,
`tsc --noEmit -p tsconfig.json`, with scope limited to the adapter.

The real verification command:

```bash
node scripts/live-audit.mjs --source https://cdn.jsdelivr.net/gh/Ebony-Vinyl/dsh-our-free-model@main/feed/manifest.json
```

The actual manifest URL in the log was `@fbc3b9b55686fe169bd1fd26bb9211b9d3008d9e`,
with 40/40 files passing. The same command with the original script still fails, so the new script's success must not be used to claim old clients are automatically fixed.

The local sources have changed and the existing signature does not yet cover this fix. In the release checks, manifest and release failed due to digest drift,
and catalog passed in the uncommitted state; after committing the fix and running `npm run test:release` again,
manifest, release and catalog all failed, with catalog's reason being that the content commit changed while the revision had not yet been refreshed.
Before release, the key-holding maintainer re-signs and updates the catalog revision, keeping the content-commit identity required for an ordinary merge;
no placeholder signature is used, and the public key is not replaced.

Old clients need to upgrade successfully first, or manually install the fixed production version, to obtain the new logic; if their network still
redirects NOTICE to an unreachable raw, merely refreshing the cache cannot guarantee the transition succeeds. The macOS Desktop host smoke test below has been completed for this change;
no Windows UI upgrade was performed, and this fix has not been released.


## macOS Desktop on-device smoke test (2026-10-07)

- Actual application: `/Applications/DeepSeek Harness.app`, the plugin installation copy inside the Desktop profile.
- The original installation was the 2.0.0 development version (including the EAC local Exo feature); the plugin and upgrade state were fully backed up first.
  This was a **2.0.0 → 2.0.0 same-version reinstallation**, not 1.4.5 → 2.0.0 or a Windows measurement.
- The new upgrader was loaded by the actual Desktop Node host. A temporary local file triggered a probe calling the real
  `PluginUpdater.apply()`, with `selfReload()` as the activation callback; no anonymous endpoint was opened,
  the host authentication was not read or changed, and no stand-in service, replaced signing public key or forged version was used.
  The same-version page has no upgrade button, so this round did not cover the user's click on "Upgrade now" in the UI operation chain.
- The first round failed after downloading 38/40: connection failures for `client.js` and `adapter/dsh-llm.d.ts`.
  The staging directory was cleaned up, installation was not entered, and there was no version inconsistency or recovery to-do. This failure record is kept in full.
- The retry passed, taking about 23.7 seconds; the actual manifest source was pinned to
  `https://cdn.jsdelivr.net/gh/Ebony-Vinyl/dsh-our-free-model@fbc3b9b55686fe169bd1fd26bb9211b9d3008d9e/feed/manifest.json`.
  After the raw manifest connection timed out, the CDN at the same SHA was used; after connection failures on the main CDN for NOTICE and others, the pinned mirror was used.
- The host completed the download, signature verification, staging, backup, installation and hot reload of 40 files, 4008049 bytes.
  Activation returned `ok:true`, `version:2.0.0`, `fibers:1`; generation 1→2.
  The transaction was `complete`, `activated:true`, with no errors, version inconsistency or recovery to-dos.
  An independent per-file check of the installed bytes followed: sizes and SHA-256 matched the production signed manifest **40/40**.
- Finally, the development plugin and upgrade state from before the test were restored, keeping only this round's `src/updater.js`.
  Of the 42 original files, the other 41 digests are unchanged, with no extra files. The restored copy hot-reloaded successfully in the real host again,
  generation 1→2, 1 fiber; the restored old development entry point does not export a running version, so its empty version
  return value is not treated as strict version-activation proof. The Desktop plugin page shows v2.0.0, **1 in total · 1 running**.
- The test probe removed itself before reloading; the final disk and running instance use a clean entry point. The automatic file hot-reload setting
  is still the off state from before the test; no user account, chat or secret data was operated on.

The local evidence and the original installation backup are kept outside the repository; no local paths, user screenshots or raw runtime data are committed.
The main evidence is `attempt1-host-result.json`, `host-result.json`, `host-activation.json`,
`installed-verification.json`, `restoration-runtime.json`, `final-verification.json` and
`desktop-restored.png`. Both the first failure and the successful retry are recorded; real network availability is not interpreted as a permanent guarantee.
This machine currently keeps the fixed development upgrader, which does not yet belong to a signed release version.
