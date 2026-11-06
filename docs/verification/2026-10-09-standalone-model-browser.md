# Standalone Model List Verification

## Scope and Data Sources

Based on mainline `1ccd9e7`, this completes the first batch of the second-stage model list page: migrated into React,
with on-demand code splitting, virtual lists, combined filters, copy ID, refresh, active probing, and cancellable single-model tests.
The remaining pages continue to use the existing implementation. The DSH plugin, the thirteen channel protocols, EAC, and the inference core were not modified.
No version was bumped, no tag was created, no installer was built, and no Release was published.

**The 1,018 models in the screenshots are an isolated test list and do not represent the number actually integrated into the project.**
When `OFM_PREVIEW_MODELS=1000`, the preview script generates
`fixture/model-0:free` through `fixture/model-999:free`, plus one anonymous MiMo record,
a local stand-in; "connectable" and "probed as available" describe only that test environment. The official startup entry point does not generate this data.
No real DSH credentials were read or migrated in this round; the test directory is located at `.verify/ui-phase1-load-data`.

## Actual Verification

| Command | Result |
| --- | --- |
| `npm run typecheck:standalone` | Passed |
| `npm run build:standalone-ui` | Passed, generated five JS/CSS assets and the HTML |
| `node scripts/build-standalone-ui.mjs --check` | Passed, committed artifacts match the source |
| `node scripts/standalone-frontend-test.mjs` | Passed, code-split registration, empty statistics, and combined filtering over a thousand models |
| `node scripts/standalone-management-test.mjs` | 16/16 passed, including the upstream connection closing after a real HTTP test request was cancelled, while the management session remained valid |
| `node scripts/test-all.mjs --mode contributor` | 33/33 suites passed |
| `node scripts/test-all.mjs --mode release` | 3/3 suites passed; validation only, nothing published |
| `node scripts/measure-standalone-ui.mjs` | Passed, results saved to this batch's verification directory |
| `git diff --check` | Passed |

The build still has two warnings about lucide `use client` directives being ignored; the ordinary browser application builds successfully.
Type checking covers the TypeScript components and the hosting interface; the retained legacy JavaScript does not have `checkJs` enabled.

## Browser Verification

Using the Codex built-in browser, the preview service was restarted and reloaded after the final artifacts were rebuilt.
During verification, all requests pointed to local stand-ins.

| Scenario | Result |
| --- | --- |
| Overview startup | Model entry DOM was 0; the model JS was imported only on first entry |
| End-of-list search | Searching `fixture/model-999:free` returned 1/1,018, scroll position reset to zero |
| Combined filters | Channel, capability, status, and public scope can be combined; an empty state is shown when there are no results, and clearing restores them |
| Not-probed status | Filter results matched the test list |
| Copy ID | Browser clipboard content matched the full model ID |
| Refresh and active probing | Success feedback was explicit, search conditions were preserved |
| Single-model success | Returned the stand-in body and a duration of about three seconds |
| Single-model failure | Showed the specific simulated failure reason for the designated 998 model |
| Active cancellation | The UI showed the cancellation, the upstream connection closed, and no late result overwrote it |
| Cancellation on page switch | Filters and cancellation state were preserved after returning; hidden pages did not mount model entries |
| Re-login after logout | The test was cancelled and the model DOM was cleared; filters were reset on re-login |
| Service pause/resume | Tests and active probing were disabled while paused; available again after resuming |
| Thirteen channels and EAC | The thirteen channels were visible; the EAC unauthorized, GitHub login, and stand-in resource pool entry points were reachable |
| Narrow screen | Long IDs wrapped, controls did not overflow horizontally; the end of the list was reachable and a single-model test succeeded |
| Final browser logs | The warn/error list was empty on a fresh session check |

The first round of browser testing included deliberately failing model requests and authentication requests after logout,
so those expected HTTP failures must not be misreported as product runtime errors. The final recheck used a new browser session
and did not re-run the deliberately failing scenarios, so its empty log also does not mean that all real third-party paths are error-free.

For the final layout measurements, see [layout.json](standalone-model-browser/layout.json).
Host scaling and the browser scrollbar affect the viewport tool dimensions; the recorded actual `innerWidth` and document
`scrollWidth` were: 1662/1642 on desktop and 332/312 on the narrow screen, with 0 model controls overflowing in both cases.
The top of the narrow-screen screenshot did not show the full list content, so a complete mobile screenshot including the model entries is also attached.
The default viewport was restored at the end of verification.

Screenshots:

- [Final desktop list](standalone-model-browser/models-desktop.png)
- [Mobile list](standalone-model-browser/models-mobile.png)
- [Final narrow-screen top](standalone-model-browser/models-narrow.png)
- [Test success](standalone-model-browser/test-success.png)
- [Test failure](standalone-model-browser/test-error.png)
- [Mobile test](standalone-model-browser/test-mobile.png)

The success, failure, and mobile interaction screenshots were taken from the build before the final cleanup of obsolete CSS;
that cleanup only removed styles for the old model DOM that had already been removed, and the final desktop and narrow-screen screenshots were retaken.

## Size and Speed

The comparison is between the mainline before this batch and this batch's final static HTML/JS/CSS,
excluding the backend, development dependencies, API JSON, and installers.

| Metric | Before this batch (bytes) | After this batch (bytes) |
| --- | ---: | ---: |
| Total raw size of all static assets | 571471 | 610365 |
| Theoretical gzip of all static assets | 198884 | 211105 |
| Raw size of first-screen static assets | 334670 | 334418 |
| Theoretical gzip of first-screen static assets | 106067 | 105065 |

The total raw size increased by 38,894 bytes, about 38.0 KiB; the first-screen raw size was essentially flat.
The model JS split chunk is 37,388 bytes, with a theoretical gzip of 12,266 bytes; the shared vendor list has a separate split chunk.
The model CSS is merged into the entry CSS, so on-demand loading does not mean all model-related bytes are deferred.
Theoretical gzip does not represent actual HTTP transfer volume, and installer size cannot be inferred from it.
For the final measurements, see [sizes.json](standalone-model-browser/sizes.json).

In the final recheck, the time from the first click until the component became visible was 284 ms; in the first round it was 289 ms. Both include tool round trips and waiting,
and are neither pure React rendering time nor a sustained-load benchmark. This round only proves that a thousand-entry test list does not mount
the full model DOM; low-spec devices, long-term memory usage, and real upstream response speeds were not measured.

## Boundaries and Rollback

- Single-model cancellation was verified over a real local HTTP connection; refresh/probing are shared tasks,
  and cancelling the wait in the frontend does not guarantee that the entire backend task stops.
- Real channel authorization, real model answers, and formal EAC authorization were not verified provider by provider.
- Browser and native terminal verification were not re-run on macOS/Linux.
- The "Not public" section is covered by a dedicated offline filtering test; in this preview all models were connectable,
  and real account-state changes for the not-public model button were not tested in the browser.
- This round was the implementer's self-check and actual verification; no independent Agent review is claimed.
- Runtime configuration and data formats did not change, so no migration is needed; rolling back this batch's source and the corresponding `web/` artifacts
  and restarting the service restores the old model page, while preserving the existing standalone data directory.
