# Current-Channel Model Bulk Management Verification

## Goal and Scope

Resolves issue #182: when a channel has many models, enabling or disabling them one by one is cumbersome.
"Enable all", "Disable all", and the count of enabled models were added to the model expansion area of the shared `ChannelCard`.
The DSH plugin uses `client.js`; the standalone service generates its channel pages from that component, so both products share this change.
The original single-model button labels "Enabled/Disabled" were changed to the action wording "Enable/Disable", to avoid confusion with the count status.
Both the Chinese and English entries were completed; no dependencies, public interfaces, or data structures were added.

## Behaviour and Boundaries

- Each bulk operation sends only one existing `model.setAllDisabled` RPC, carrying the current channel's provider.
- Disabling all adds the models in the current channel's catalog to the disabled list; enabling all clears that channel's disabled list, including stale records for models taken offline in the past. This is the existing backend semantics.
- On success, the models are reloaded and the parent page is notified to refresh; write buttons are disabled while the request is in flight, and repeated clicks do not resend the bulk request.
- Failures reuse the existing error feedback, do not fabricate a success state, and the buttons become operable again.
- The bulk buttons are not shown while the catalog is loading or when there are no models.
- Accounts, credit locks, login methods, and the toggles of other channels are not modified; the EAC and free channel integration logic was not changed.

## Actual Verification

| Command | Result |
| --- | --- |
| `node scripts/channel-pack-test.mjs` | Passed; re-run after the final wording adjustment, including actual mounting verification of the shared component |
| `node scripts/standalone-channels-test.mjs` | 12/12 passed; including bulk state persisted to disk, catalog removal and restoration, isolation from other channels, and credit lock preservation |
| `node scripts/client-lint.mjs` | Passed; 414 text keys and 140 style rules, re-run after the final wording adjustment |
| `npm run typecheck:standalone` | Passed |
| `node scripts/build-standalone-ui.mjs --check` | Passed after the final wording adjustment and rebuild; 10 local assets match the source |
| `node scripts/test-all.mjs --mode contributor` | 33/33 suites passed; run before the final single-model button wording adjustment, after which the shared component test and frontend lint were re-run |
| `node scripts/test-all.mjs --mode release` | 0/3 suites passed; manifest, release, and catalog all failed because the signed manifest or the source revision was not in sync |
| `git diff --check` | Passed |

The specific reason for the release gate failure: `client.js` has changed, while the signed manifest still records the old size and digest;
the catalog's source revision still points to the old commit. A maintainer needs to update these through the repository's signing process.
In this round, no public key was changed, no signature was forged, no version was bumped, no tag was created, and no Release was published.
The build has two pre-existing warnings about lucide `use client` directives being ignored; the build succeeded.

## Browser Verification and Data Isolation

Using the local isolated preview at `http://127.0.0.1:18901/`, with the data directory `.verify/ui-phase1-data`,
and upstream refresh for the preview stopped via `OFM_PREVIEW_NO_REFRESH=1`. The page clearly labels the accounts, models, and quotas as test data.
No real accounts were used, and no preview data, logs, management links, or login tokens were submitted.

1. Initially it showed 9/9 enabled, both bulk buttons were visible, and the single-model button read "Disable".
2. After clicking "Disable all" it showed 0/9, and the single-model button read "Enable".
3. After refreshing the page and re-expanding the list, it still showed 0/9.
4. After clicking "Enable all" it was restored to 9/9, the single-model button read "Disable", restoring the model settings from before the test.

Screenshots:

- [All disabled state](images/issue182-models-all-off-dark.png)
- [All enabled state](images/issue182-models-all-on-dark.png)

No end-to-end verification was done against a real DSH host, real logins, or upstream inference.
The shared component tests cover the code used by the plugin; the standalone service RPC and browser path have the actual verification above,
and this does not claim that all hosts or upstreams have been verified.

## Repository Knowledge Maintenance

The repository's AGENTS.md requires using AOCI; tool discovery in this round returned 0 matching tools,
so `aoci_rules`, `aoci_overview`, or `aoci_maintain` could not be executed.
This delivery was checked against the actual source, diff, tests, and browser evidence; the formal knowledge index was not modified and is not claimed to have been updated.
