# Standalone Usage Dashboard Verification

## Scope and Data Sources

Based on mainline `2a1c366` after the model list PR #164 was merged, the standalone usage dashboard was migrated into
React, loaded on demand, reusing existing components and adding no npm dependencies. It shows six cumulative metrics,
physical failed requests and thinking Tokens, 7/14/30-day trends, search and sorting by model, and pagination at 20 entries per page,
with empty states, refresh feedback, and narrow-screen layout completed.

The DSH plugin, the thirteen channel protocols, EAC, anonymous and Kilo business logic, and the backend statistics definitions were not modified.
No real DSH credentials were read or migrated; no version was bumped, no tag was created, no installer was built, and no Release was published.

**The 47 statistical models in the non-zero screenshots are isolated test records and do not represent actual model integrations or actual usage.**
The preview script generates statistics for the isolated directory on first use only when `OFM_PREVIEW_USAGE=1`;
the default test directory is `.verify/ui-usage-data`, and the historical-window scenario uses
`.verify/ui-usage-history-data` and `OFM_PREVIEW_USAGE_DAYS_AGO=60`.
This generated data is Git-ignored and was not committed. What was committed is the test generation script, documentation, and screenshots;
the official CLI does not load the test script and does not generate test statistics.

The final delivered preview was restored to a normal service at `http://127.0.0.1:18900/`,
using the standalone product's default data directory and showing actual zero usage. The two isolated statistics test services have been stopped.

## Actual Verification

| Command | Result |
| --- | --- |
| `npm run typecheck:standalone` | Passed |
| `npm run build:standalone-ui` | Passed, generated eight JS/CSS assets and the HTML |
| `node scripts/build-standalone-ui.mjs --check` | Passed, source matches the committed artifacts |
| `node scripts/standalone-frontend-test.mjs` | Passed, including three-page code-split registration, separation of cumulative figures and trends, search sorting, and pagination |
| `node scripts/test-all.mjs --mode contributor` | 33/33 suites passed, including the management suite 16/16 and the channel suite 11/11 |
| `node scripts/test-all.mjs --mode release` | 3/3 suites passed; validation only, nothing published |
| `git diff --check` | Passed |
| `git ls-files .verify` | Output was empty; no test data is tracked |
| `git check-ignore .verify/ui-usage-data/stats.json .verify/ui-usage-history-data/stats.json` | Both files are ignored |

The contributor and release validations were completed before the final tweaks to date width, scroll hints, and the Chinese connection error;
after those tweaks, type checking, the build, artifact consistency, and the frontend suite were passed again. The release validation was run once more while the documentation was being finished.
The frontend suite includes cross-month and cross-year boundaries, daylight-saving boundaries in Shanghai and New York, zero-filling of missing dates, pagination of 47 models
as 20/20/7, page-number clamping, input immutability, and a scenario where the historical cumulative figure is non-zero while the current trend is zero.

The build still has two warnings about lucide `use client` directives being ignored; the browser application builds successfully.
Type checking covers the TypeScript components and the hosting interface; the retained legacy JavaScript does not have `checkJs` enabled.

## Browser Verification

The Codex built-in browser was used to verify the normal service and a local isolated test service. The normal service does not generate simulated usage.

| Scenario | Result |
| --- | --- |
| First entry and on-demand mounting | Loaded normally on first entry; the statistics model DOM was 0 on the overview and after switching pages |
| Normal service | All six cumulative values were 0, showing the no-records note |
| 47-model statistics | 20 rows on the first page, 7 rows on the last page, next page disabled on the last page |
| Search and sorting | Supports ID, name, case, and whitespace handling; clearing restores, and no match has its own note |
| 7/14/30-day trends | The test-window totals were 126000/203000/231000 Tokens respectively; cumulative values did not change with the window |
| Refresh | Success feedback was explicit, search was preserved, and repeated clicks were disabled during the operation |
| Performance values | The test model `fixture/usage-20` showed TTFT 500 ms and TPS 60; unknown values showed "—" |
| Page switching and logout | Search was preserved on return; logout cleared the statistics DOM, and re-login reset the search |
| Historical cumulative | Cumulative was non-zero but the current window was 0, showing the no-records-in-window note |
| Connection failure | After stopping the isolated service and refreshing, it showed "Unable to connect to the local service. Please confirm the service is running and try again." |
| Desktop and narrow screens | Controls did not overflow horizontally; charts and tables scrolled within their own areas, with hints |
| Existing channel entry points | On the final normal service, the thirteen channels and the EAC GitHub login entry point were checked as visible |

In the final check, both the actual mobile viewport and the document width were 405 CSS px, and both were 332 CSS px on the narrow screen,
with 0 controls overflowing in both cases. On mobile, the chart content width was 498 and the container 333,
and the table content width was 1000 and the container 333. For details, see
the [layout record](standalone-usage-dashboard/layout.json). The default viewport was restored at the end of verification.

Screenshots:

- [Normal service, desktop](standalone-usage-dashboard/usage-live-desktop.png)
- [Normal service, empty records](standalone-usage-dashboard/usage-live-empty.png)
- [Isolated non-zero statistics](standalone-usage-dashboard/usage-fixture-desktop.png)
- [Filtering by model](standalone-usage-dashboard/usage-filtered.png)
- [405 px mobile](standalone-usage-dashboard/usage-fixture-mobile.png)
- [332 px narrow screen](standalone-usage-dashboard/usage-fixture-narrow.png)
- [Historical cumulative and empty window](standalone-usage-dashboard/usage-history-empty-window.png)
- [Refresh connection error](standalone-usage-dashboard/usage-refresh-error.png)

In the final check, the browser warn/error log list was empty; the network failure after deliberately stopping the service belongs to a test scenario,
and an empty log cannot prove that real third-party paths are error-free. The manual refresh error and the existing global polling hint may appear at the same time;
this batch did not deduplicate these two kinds of hints.

## Size

Comparing the mainline before this batch with the final static HTML/JS/CSS, excluding the backend, development dependencies, API JSON, and installers.

| Metric | Before this batch (bytes) | After this batch (bytes) |
| --- | ---: | ---: |
| Total raw size of all static assets | 610365 | 621926 |
| Theoretical gzip of all static assets | 211105 | 215219 |
| Raw size of first-screen static assets | 334418 | 335085 |
| Theoretical gzip of first-screen static assets | 105065 | 104665 |

The total raw size increased by 11561 bytes, about 11.3 KiB; the first-screen raw size increased by 667 bytes,
about 0.65 KiB. The statistics JS split chunk is 10710 bytes, with a theoretical gzip of 4245 bytes.
The statistics CSS is merged into the entry CSS, and some icons are in a shared split chunk; it cannot be assumed that all statistics assets are lazily loaded.
For the measurement records, see [before](standalone-usage-dashboard/sizes-before.json) and
[after](standalone-usage-dashboard/sizes.json). Theoretical gzip does not represent actual HTTP transfer volume
and is not used to infer installer size or running speed. No dependencies were added, and no pure React rendering performance timing was done.

## Limitations and Rollback

- Protection for late imports and refresh callbacks was checked statically by the implementer; race conditions were not fully tested with artificially delayed requests.
- Real account logins, real model inference, and formal EAC authorization were not verified provider by provider.
- Not re-verified on macOS/Linux; low-spec devices and long-term memory usage were not measured.
- This batch was the implementer's self-check and actual verification; no independent Agent review was performed.
- No configuration or statistics data format migration. Rolling back this batch's source and the corresponding `web/` artifacts
  and restarting the service restores the old statistics page, while preserving the configuration, accounts, and statistics in the standalone data directory.
