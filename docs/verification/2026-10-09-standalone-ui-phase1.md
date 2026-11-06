# Standalone UI Phase 1 Acceptance

## Scope Delivered

Completed Overview, Channel Management, shared navigation, and narrow-screen layout. The frontend uses React, TypeScript, Vite, Tailwind, and base components maintained within the project; it does not directly install a full set of shadcn business pages.
The model list, usage, settings, API access, and login continue to use the existing control logic.
Phase 1 stops here in a reviewable state and does not automatically proceed to Phase 2.

- Overview shows the actual model count, user turns, Tokens, resumed turns, seven-day usage, and running status.
- The thirteen account channels support search, Connected / Not connected filtering, details, and channel switching.
- Details reuse the original channel login, account pool, renewal, check-in, model toggles, and credits business logic.
- Channel usage, request log, provider enable/disable, nickname, account priority, credits lock, and backup entry are retained.
- EAC continues to reuse the original authorization and resource pool logic; Anonymous and Kilo can be reached from the model source entry into the list.
- React is shared as a single copy, and channel JS is imported on demand; the old standalone channel bundles and duplicate source entries were removed.
- The service only exposes JS/CSS registered in the build manifest and does not read files by request path.
- Exiting management clears the React page and interrupts channel RPC; late imports do not mount stale pages.
- Model cards and usage tables are rendered only on their corresponding pages and do not generate thousands of hidden cards in the background on Overview.

The plugin `client.js`, channel protocols, inference core, and real user data were not modified. The version was not bumped, no tag was created, and no Release was published. At the end of the first round of acceptance it had not yet been pushed; a PR was later submitted as requested by the user.

## Actual Verification

| Command | Result |
| --- | --- |
| `npm run build:standalone-ui` | Passed, generated HTML, an asset manifest, and three static assets |
| `npm run typecheck:standalone` | Passed, checked the new TypeScript components and hosting interface |
| `node scripts/build-standalone-ui.mjs --check` | Passed, source and committed assets are consistent |
| `node scripts/standalone-frontend-test.mjs` | Passed, asset registration, dynamic dependencies, on-demand chunking, and empty statistics |
| `node scripts/standalone-management-test.mjs` | 15/15 passed after syncing the latest mainline, including the cross-platform launcher and GET/HEAD, method restrictions, and non-public paths for all chunks |
| `node scripts/standalone-channels-test.mjs` | 11/11 passed, using real adapters and a local stub upstream |
| `node scripts/test-all.mjs --mode contributor` | 33/33 suites passed after syncing mainline, log located at `.verify/ui-phase1-pr-contributor.log` |
| `node scripts/test-all.mjs --mode release` | 0/3 passed: the signed manifest and directory records have not yet been regenerated with the source changes; log located at `.verify/ui-phase1-pr-release.log` |
| `node scripts/measure-standalone-ui.mjs --record` | Passed, recorded raw and theoretical gzip sizes |
| `git diff --check` | Passed |

The build produces two warnings that the `use client` directive from lucide is ignored. This is an ordinary browser application rather than React Server Components; the build succeeded, and browser acceptance showed no runtime errors.
The original plugin's shared JavaScript and the retained controllers do not have `checkJs` enabled, so the type checking of the new components should not be taken to mean that this old code is also strictly typed.

## Browser Acceptance

The Codex built-in browser was used to actually click through and take screenshots, with the data directory isolated at `.verify/ui-phase1-data`, and the page always showing the stub notice.

| Scenario | Result |
| --- | --- |
| Overview with real zero values and empty usage | Passed, no fabricated growth rates or call records |
| All thirteen channels displayed | Passed |
| Search `qoder` | Shows the two corresponding channels |
| Non-existent name | Shows the empty state, and resetting restores all channels |
| Account details and list | Passed, original account operations and model entry are reachable |
| Provider and backup | Enable/disable, credits lock, account selection, and import/export entries are reachable |
| Channel usage and log | Passed, empty ledger and request records display normally |
| EAC | Unauthorized state, GitHub login entry, and stub resource pool display normally |
| Exit and re-login | After exit, channel and sidebar text are cleared, and re-login restores management |
| Desktop | Approximately 1123 CSS px wide by default, icons and images loaded successfully, no text overflow found |
| Narrow screen | Actually 389 × 844 CSS px, buttons and headings have no text overflow; measurement has a 1px subpixel rounding difference |
| Browser error log | No error records in this check |

The browser inherited the host scaling, so the viewport tool's input value is not equal to CSS pixels.
The narrow screen is recorded based on the DOM-measured width; the 390 tool pixels set the first time must not be misreported as 390 CSS px; the actual layout measurements are saved in `standalone-ui-phase1/layout.json`.

Screenshots:

- [Old overview](standalone-ui-phase1/overview-before.png)
- [New overview](standalone-ui-phase1/overview-desktop.png)
- [Channel list](standalone-ui-phase1/channels-desktop.png)
- [Account details](standalone-ui-phase1/detail-desktop.png)
- [Narrow-screen overview](standalone-ui-phase1/overview-mobile.png)
- [Narrow-screen channels](standalone-ui-phase1/channels-mobile.png)
- [Narrow-screen details](standalone-ui-phase1/detail-mobile.png)
- [Windows login page after syncing mainline](standalone-ui-phase1/login-windows.png)

Before submitting the PR, mainline `befe365` was synced, and the newly added macOS/Windows system detection, terminal button, and manual command were migrated into `frontend/legacy.js` and `frontend/index.html`, and the assets were regenerated.
In this round, the login page, overview, and thirteen channels were re-checked in the Windows browser, and the browser error log was empty.
The real-machine results for the macOS native window follow the mainline record; they were not re-run on macOS in this round.

## Size and Speed

The comparison scope is the pages' static HTML/JS/CSS, not including management API JSON responses, development dependencies, backend files, or install packages. The old version loaded all five assets on the first screen;
the new version's first screen only references HTML, entry JS, and CSS, and channel JS is imported when that page is first entered.

| Metric | Before | After |
| --- | ---: | ---: |
| Total static assets, raw size | 507.8 KiB | 558.1 KiB |
| Total static assets, theoretical gzip | 168.2 KiB | 194.2 KiB |
| First-screen static assets, raw size | 507.8 KiB | 326.8 KiB |
| First-screen static assets, theoretical gzip | 168.2 KiB | 103.6 KiB |

The after sizes above include the cross-platform login logic synced from mainline.
The first-screen raw size decreased by **35.6%**, but the overall raw size increased by **9.9%**,
and the theoretical gzip overall increased by about **15.5%**. It cannot be claimed that the whole package became smaller.
The total growth mainly comes from the new overview, navigation, filtering details, icons and base component dependencies,
and unified styles; the old shared channel components are still retained to maintain business compatibility.
The current HTTP assets do not have gzip enabled; this is only a theoretical comparison using the same compression method.
The standalone install package has not yet been built, so there is no ZIP size conclusion.

The first round of acceptance, before syncing the macOS login changes, used the same browser "refresh/click until target visible" automation method:

| Item | Measured |
| --- | --- |
| Old overview refreshed three times | 119 / 86 / 83 ms, average 96 ms |
| Final new overview refreshed three times | 138 / 137 / 112 ms, average 129 ms |
| New channel, first entry | 306 ms |
| New channel, subsequent entry | 274 ms |
| 1018 model list entry | 462 ms |
| Search a single model | 111 ms, results converged from 1018 to 1 |

Timing includes tool round-trips, browser scheduling, and local service response; it is not pure rendering time,
nor is it cold-start FCP/LCP. The old version's average was lower by about 33 ms; a small sample cannot be used to derive
a stable performance ratio, nor to claim that the new page loads faster. This round did not expand the scope of the revision.
The thousand-model acceptance confirmed: at overview startup the number of hidden model cards is 0, and after entering the list it is 1018;
no virtual list was implemented, which remains an optimization boundary for the model page in the next phase.

The raw data is saved in this directory under `standalone-ui-phase1/`:
`sizes-before.json`, `sizes.json`, `performance-before.json`,
`performance.json`, `long-list.json`.

## Unverified Scope

- Third-party real account authorization, SMS verification, or QR-code scanning was not completed for each provider; user action is required.
- Backup import, account deletion, and external authorization in the browser were not executed in a real user directory;
  the corresponding backend chain is covered by stub-specific tests and does not impersonate real account acceptance.
- Windows/macOS/Linux install packages for all platforms were not tested; the Linux CI configuration has been added,
  but GitHub Actions was not executed locally.
- The Release check was run but did not pass; the signature and version were not updated, and the release flow,
  install artifacts, and cold-start performance analysis were not run. Before merging into the shipping mainline, the maintainer still needs to complete signing preparation and make this gate pass.
- Phase 1 does not include a model list redesign, virtual scrolling, or a full split of the old shared business components.

## Preview and Rollback

Run `node scripts/standalone-ui-preview.mjs` to start an isolated stub preview,
with default port `18901`, and the management link saved in `.verify/ui-phase1-url.txt`.
This preview cannot complete real authorization. For formal use, continue to start the service as described in the standalone README.

When rolling back this phase, the frontend source, build output, asset manifest, and management asset mapping should be restored as a whole,
rather than only restoring `app.js`; this phase does not migrate or rewrite user data.
