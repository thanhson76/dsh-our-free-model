# Standalone Service Settings Page Migration Acceptance

## Scope

Based on mainline `af7eaaa` after the usage statistics PR #169 was merged, the existing service settings page was migrated into React, reusing the existing base components and loading on demand, with no new npm dependencies. The old settings DOM, events, and dedicated styles were removed, while the six public settings and the original management API were retained. The DSH plugin, thirteen channels, EAC, Anonymous, and Kilo business logic were not changed.

Added an unsaved-changes notice, undo changes, field validation, and save success/failure feedback; polling and page switching retain the draft, it is cleared after exit, and repeated operations are disabled during saving. The hosting layer uses a save revision number to prevent an old summary from overwriting a confirmed write.
There was no configuration or data migration, no version bump, no tag creation, no install package built, and no Release published.

## Data Isolation

Save, pause/resume, restart, and failure scenarios used a local stub started with `OFM_PREVIEW_SETTINGS=1` at
`http://127.0.0.1:18905/`, with data directory `.verify/ui-settings-data`;
`OFM_PREVIEW_NO_REFRESH=1` was used to verify the description for paused automatic tasks. That test process has been stopped.
Test accounts, configuration, logs, and management links were not committed; the formal CLI does not load the preview script or generate test accounts.
What was committed is test code, documentation, and screenshots.

The final normal service was restored at `http://127.0.0.1:18900/`, using the standalone product's original data directory.
It was only restarted to load the new assets, and the six settings were compared item by item and were consistent before and after the restart; no save test was performed using the formal configuration.
No DSH credentials were read or migrated in this round.

## Actual Commands

| Command | Result |
| --- | --- |
| `npm run typecheck:standalone` | Passed |
| `npm run build:standalone-ui` | Passed, generated 11 JS/CSS assets and HTML |
| `node scripts/build-standalone-ui.mjs --check` | Passed, artifacts are consistent with source |
| `node scripts/standalone-frontend-test.mjs` | Passed, four-page chunking, six-field validation, draft sync, and hosting-layer interleaved requests |
| `node scripts/standalone-management-test.mjs` | 16/16, including immediate persistence, pause/resume, write failure, restart persistence, and periodic scheduling |
| `node scripts/test-all.mjs --mode contributor` | Final version 33/33 suites passed |
| `node scripts/test-all.mjs --mode release` | 3/3 suites passed; check only, not published |
| `node scripts/measure-standalone-ui.mjs` | Passed, recorded static asset sizes |
| `git diff --check` | Passed |
| `git ls-files .verify` | Empty, no tracked test data |
| `git check-ignore .verify/ui-settings-data/settings.json .verify/settings-preview.log` | Both files are ignored |

The frontend-specific tests cover empty values, whitespace, decimals, non-numeric values, both-end boundaries, out-of-bounds values, the field whitelist, draft and latest baseline sync, and changing a value back to its original after modification. The hosting-layer test executes the actual `legacy.js`, using a DOM stub and controllable asynchronous requests to verify that a late-arriving old poll, a server save failure not committing optimistic state, and a late save result after exit cannot restore the page; no test interface is added to the product.

The build still has two warnings that the lucide `use client` directive is ignored, and the application build succeeded.
Type checking covers the TypeScript pages and interfaces; the retained old JavaScript does not have `checkJs` enabled.

## Browser Acceptance

The following scenarios were completed using the Codex built-in browser:

| Scenario | Actual result |
| --- | --- |
| First entry | On Overview the settings DOM is 0; first entry to Settings loads normally |
| Six items echoed and saved | Four toggles and two numbers are correctly echoed, after saving success is shown and disk values are checked item by item |
| Validation | Empty output Token and out-of-bounds refresh interval show Chinese field errors, and the input is still retained |
| Draft and refresh | Waited across a polling period, switched to Overview, actively refreshed, then returned; the six drafts were retained |
| Hide and return | When hidden the settings input DOM is 0, and returning restores the draft |
| Pause and resume | After saving with inference disabled the management page remains usable and the status shows paused; re-enabling succeeded |
| Restart | 8192 Token, 12 minutes, and the four toggles are consistent with the saved values |
| Automatic tasks disabled | Restarted with the preview's `refresh: false` option, correctly shows the `--no-refresh` equivalent description |
| Undo | Undid from 16384 to the saved 8192 |
| Exit and re-login | After exit the settings input DOM is 0, re-login shows the saved 8192 and does not restore the 16384 draft |
| Service disconnected | After stopping the isolated service, saving shows a Chinese error, the 16384 draft is retained, and the save button can be retried |
| Desktop and narrow screen | Numeric fields wrap on narrow screen, buttons are visible, and the number of controls out of bounds is 0 |
| Shared chunk re-check | The normal service's model page, usage page, thirteen channels, and EAC GitHub login entry are still visible |

The automatic tasks' "do not send requests" and scheduling behavior are covered by the management-specific tests; the browser verifies the description, saving, and echoing.
Disabling during saving was checked from the page code; a real browser save request was not deliberately delayed to measure repeated clicks.
Old summary and exit interleaving are covered by controllable asynchronous specific tests; this does not claim to fully measure all browser network race conditions.

See [layout.json](standalone-settings-page/layout.json) for the layout record.
Affected by host scaling and scrollbars, the desktop actual `innerWidth` / document `scrollWidth` was 1054/1035,
mobile was 506/487, and the narrowest re-check was 332/312; controls out of bounds were 0 in all cases.
At the end of acceptance the default viewport was restored, and the browser remained on the 18900 normal service settings page.

Screenshots:

- [Normal service settings page](standalone-settings-page/settings-live-desktop.png)
- [Isolated settings page](standalone-settings-page/settings-fixture-desktop.png)
- [Field error](standalone-settings-page/settings-validation.png)
- [Save succeeded and inference paused](standalone-settings-page/settings-saved-paused.png)
- [Restart and automatic tasks paused](standalone-settings-page/settings-restart-no-refresh.png)
- [Mobile](standalone-settings-page/settings-fixture-mobile.png)
- [Actual 332 px narrow screen](standalone-settings-page/settings-fixture-narrow.png)
- [Save connection failure and draft retained](standalone-settings-page/settings-save-error.png)

After stopping the test service, the existing global polling `Failed to fetch` notice may also appear at the same time;
the settings page save error is in Chinese, and this batch did not extend to global notice translation or deduplication. The final normal service check had an empty browser warn/error list, which does not mean that the deliberately disconnected scenario or real third-party chains have no errors.

## Size

Compares static HTML/JS/CSS before and after this batch, not including the backend, API data, development dependencies, or install packages.

| Metric | Before this batch (bytes) | After this batch (bytes) |
| --- | ---: | ---: |
| Total static assets, raw size | 621926 | 628763 |
| Total static assets, theoretical gzip | 215219 | 218029 |
| First-screen static assets, raw size | 335085 | 335122 |
| First-screen static assets, theoretical gzip | 104665 | 104221 |

The total raw size increased by 6837 bytes, about 6.7 KiB; the first screen increased by 37 bytes.
The settings JS chunk is 6564 bytes, with a theoretical gzip of 2976 bytes.
The settings CSS was merged into the entry CSS, and shared icons produce a shared chunk, so other chunk file names changed.
See [before](standalone-settings-page/sizes-before.json) and
[after](standalone-settings-page/sizes.json) for the measurement records.
Theoretical gzip is not the actual HTTP transfer amount; install package size and pure React performance were not measured, so running speed cannot be inferred from this.

## Unverified Scope and Rollback

- This batch is the implementer's self-check and actual acceptance; no independent Agent review was performed.
- Real channel login, inference, or EAC formal authorization was not actually tested for each provider, and it was not re-verified on macOS/Linux.
- Low-spec devices, long-term memory use, multiple management sessions editing simultaneously, and all permutations of late requests were not tested.
- Configuration still follows the original management API's save rules, with no new multi-session conflict merge mechanism added.
- Rolling back this batch's source and the corresponding `web/` artifacts and restarting is sufficient; retain the standalone data directory and do not delete configuration, accounts, or statistics. Values already saved on the server will not automatically be restored due to a frontend rollback.
