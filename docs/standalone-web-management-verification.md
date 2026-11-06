# Standalone Service Web Management Acceptance Record

Date: 2026-10-08.

## Delivery Scope

The standalone local service provides five pages: overview, model catalogue, usage statistics, service settings and API integration.
The web UI and management API live in `packages/standalone` and do not require DSH.
The plugin continues to use its original pages; both sides share the statistics aggregation function and the inference runtime.
No standalone installer, account channel, desktop shell or Release was provided in this change.

## Automatic Verification

| Command | Actual result |
| --- | --- |
| `npm run test:contributor` | 31/31 suites passed, including the original plugin and standalone service regressions |
| `npm run test:management` | The final management implementation passed 13/13 items |
| `npm run typecheck` | Passed; the current TypeScript configuration only covers the adapter boundary |
| `node --check packages/standalone/web/app.js` | Passed |
| `node --check packages/standalone/management.mjs` | Passed |
| `git diff --check` | Passed |
| `npm pack --dry-run --json` | Passed; the plugin package includes `src/core/stats.js`, and the standalone service is not mixed into the plugin package |
| `npm run test:release` | 0/3 suites passed; the changed plugin files' hashes do not match the existing manifest, and the new statistics file is not yet listed in the manifest |

The files failing the release check are `index.js`, `package.json` and `src/forward.js`,
and the newly added `src/core/stats.js` also needs to be added to the signed manifest. No signature record was modified or forged.
The maintainer needs to re-sign the manifest, update the catalog and re-run the release check following the existing release flow.

The management tests use a temporary data directory and a local HTTP upstream stand-in, covering one-time links, sessions,
same-origin and Host validation, settings validation, disk-write failure, resuming after paused inference, model operations,
statistics writes, key rotation, expiry logout, invalidation on restart and periodic scheduling.

## Actual Browser Operation

A separate acceptance directory and a local upstream stand-in were used; no existing user DSH data was read and no real model upstream was accessed.
The acceptance instance was `http://127.0.0.1:18888/`, and the model catalogue and answers in the screenshots come from the stand-in.

- A one-time link successfully exchanged for a session, and the address bar removed the temporary credential.
- After searching for a model, a single-model test was sent; the UI showed the stand-in's answer, and the statistics recorded a request that genuinely passed through the core.
- Inference was paused and resumed through the service settings, and the refresh interval was saved.
- Address copying, key show/hide, and rotation confirmation and cancellation were verified.
- Changing the search criteria during an 18-second model test kept the regenerated test button disabled; it recovered afterwards.
- At an actual width of 390 CSS pixels, all five pages satisfied a whole-page `scrollWidth === clientWidth`.
- The narrow screen kept the exit-management button; the default browser viewport was restored after acceptance.
- The final browser console had no errors or warnings.

Desktop overview:

![Desktop overview, local upstream stand-in acceptance](images/standalone-web-overview.png)

Overview at 390 CSS pixels narrow width:

![Narrow-screen overview, local upstream stand-in acceptance](images/standalone-web-mobile.png)

## Unverified Items

- Networked inference against the real anonymous/Kilo upstreams was not performed; this does not prove real-time model availability.
- No standalone install-artefact acceptance was performed.
- The release signature check has not passed yet, so this cannot currently be treated as a verified release version.
- No separate agent review was performed at this stage; the above is self-checking during implementation, automatic tests and browser acceptance.
