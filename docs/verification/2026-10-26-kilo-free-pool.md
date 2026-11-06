# Kilo Free Pool and Water-Level Statistics Verification

The free page, tab counts, five-cell status statistics, and water level all use anonymous free and Kilo models uniformly, excluding EAC, aggregate, subscription, and combo routes. The water-level statistics count unrestricted, publicly listed candidate models; Kilo models that are listed but not yet probed still show as unprobed and are not counted as measured-available. Rate limiting, unavailability, regional restrictions, hidden, and paused states do not raise the water level.

## Regression scenario

Of 26 models, all 9 anonymous free models are rate-limited, and of the 17 Kilo models, 6 are measured-available and 11 are unprobed. The water level is 17/26, rounded to 65%; the five-cell status is 6, 0, 0, 9, 11.

![65% water level displayed with 26 models and 9 rate-limited](images/2026-10-26-kilo-free-pool.png)

The screenshot uses the current `FreePage`, real React server-side rendering, and the current CSS, rendered and captured via Playwright Chromium. The input is the offline fixture described above, and all browser network requests were intercepted; this screenshot does not represent real upstream availability or user desktop acceptance.

## Verification commands

- `node --check client.js`: passed.
- `node scripts/free-pool-test.mjs`: 12/12 passed, covering source scope, status counts, rate limiting and recovery, hidden, paused, region settings, the empty pool, and the screenshot scenario.
- `node scripts/stat-bucket-ui-test.mjs`: 6 items passed.
- `npm run typecheck`: passed.
- `node scripts/build-standalone-ui.mjs`: generated the current standalone resources.
- `git diff --check`: passed.

For the full contributor test and CI results, see the PR verification record. No real Kilo or anonymous model upstream was called; real desktop availability is accepted by the user.
