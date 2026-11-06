# Standalone usage statistics page redesign

## Authorization and scope

The user has confirmed this batch's plan: redesign the usage statistics page, keep the original statistics business logic, and show request counts,
user turns, input/output Tokens, failure and recovery counts; tidy up the daily trend, per-model statistics,
empty states and refresh; verify desktop and narrow screens; and submit a PR split across multiple commits.
The model roster PR #164's local delivery is `59297b9`, and that PR has been merged into mainline at `2a1c366`.
This batch's commits have been rebased onto that mainline version, submitting the usage statistics redesign separately.
No PR is merged automatically, and no version is bumped or Release published.

## Preliminary checks

Self-check by the model-roster implementer: on-demand imports use the current snapshot, returning after a page switch keeps the filters,
signing out clears the component, cancellation uses the controller identity and active state to prevent late results from overwriting,
and management requests reuse authentication and timeouts; this round found no problem blocking the next batch.
This is not an independent Agent review, nor a guarantee of being completely defect-free.
This round's GitHub connection experienced TLS timeouts; after recovery, PR #164's merge status and the mainline version were verified.
The normal service uses the standalone product's default data directory, while the stress-test service still uses the `.verify` isolated directory;
no DSH credentials are read and no test statistics are moved into the normal service.

## Approach chosen

1. Recommended: move into the existing React and base components, split into on-demand bundles; the original statistics interface stays unchanged.
   Page structure, state cleanup and visual style stay consistent with the overview and model pages.
2. Only modify the old HTML/CSS: little work, but two sets of page state and rendering approaches remain.
3. Introduce a full charting library: more interaction capability, but this batch has only a daily-usage bar chart, so the added dependency and size are not worthwhile.

Approach one is adopted; the daily trend uses the existing CSS graphics approach, and no charting dependency is added.

## Page and data

- Six cumulative metrics at the top: user turns, physical requests, input Tokens, output Tokens,
  failed turns, recovered turns. Physical failed requests and thinking Tokens are added.
- The cumulative metrics and the per-model table use the cumulative fields of `/api/management/stats`,
  rather than recomputing historical totals from the recent daily series. A note explains that physical retries may outnumber user turns.
- Historical estimates reuse `logicalEstimated` and `requestFailuresEstimated`;
  unknown or unmeasured performance values are shown as "—" and cannot masquerade as zero.
- The daily trend defaults to the most recent 14 local calendar days and can switch between 7/14/30 days;
  missing dates are zero-filled, using the daily totals returned by the service, with no fabricated input/output split.
- Per model, the name and full ID, turns, requests, input/output, failures and recoveries,
  time-to-first-token and generation speed are shown. Name/ID search, explicit sort options and 20 rows per page are supported.
  Changing the query or sort returns to the first page, and after a refresh the page number is clamped to the valid range.
- No records globally, no records in the trend window and no search matches are each explained separately;
  an empty window is not misreported as never having been called, and no fabricated growth rates or costs are shown.

## Lifecycle and compatibility

The usage page is dynamically imported only on first entry, and hidden pages do not mount the statistics table.
The existing global refresh and 15-second status polling are kept, and refreshing sends no inference requests.
Manual refresh disables repeat clicks; success/error feedback is shown only on the currently active page,
and old callbacks cannot restore old page feedback after switching pages or signing out. Signing out resets the search, sort and pagination.
If an on-demand page import fails, a retry is offered; late imports use the latest session snapshot.
The old usage DOM and event binding are removed; other pages, the plugin and the backend statistics definitions are unchanged.

## Implementation and acceptance checklist

1. The original plugin's and the standalone side's statistics structures were checked, and this design and the baseline were recorded.
2. Add statistics types, pure functions for trend and filter pagination, and the React page; migrate the page hosting.
3. Generate the static artefacts and remove the no-longer-used old usage styles.
4. Offline special validation of cumulative vs. daily-trend separation, local-date zero filling, cross-month/cross-year boundaries,
   historical estimates, sorting, search, pagination boundaries, and input data not being modified.
5. Actually check in the browser the normal service's real zero values, and an isolated test service's non-zero data,
   empty trend, no matches, refresh, pagination, page switching/signing out, and desktop and narrow screens.
6. Type checking, build consistency, management special tests, and contributor and release checks;
   record screenshots, asset sizes, and items performed and not performed.
7. Split across multiple commits in Chinese; when the network is available, check mainline, then push and open a six-section PR in Chinese.

There is no new configuration or data migration. Rolling back is just reverting this batch's sources and the corresponding build assets and restarting.
