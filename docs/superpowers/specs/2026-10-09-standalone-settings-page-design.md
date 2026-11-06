# Standalone service settings page migration

## Confirmed scope and baseline

The user has confirmed migrating the service settings page first. Following the proposed approach: move in the existing React components,
keep the six settings, the management API, input validation, the unsaved-changes prompt and the save feedback, and verify that background polling does not overwrite edits.
The usage statistics PR #169 has been merged, and this batch branches separately from the latest mainline `af7eaaa`.
Continue submitting PRs split across multiple commits in Chinese, with no version bump, installer build or Release publication.

## Approach and page

Use an on-demand-loaded React page, reusing the existing Card, Button, Input and navigation.
Only adjusting the old DOM/CSS would save migration cost but keep two sets of state management; adding a form library is unnecessary for six settings.
This batch adds no npm dependencies and does not change the plugin, channels, EAC or backend settings rules.

The page is divided into "Inference and models" and "Model refresh", keeping enable inference, region-limited models,
stream-break recovery, the maximum output Tokens per call, the refresh interval and automatic probing.
Numeric fields keep string drafts and may be empty while editing; before submission, integers and the server's existing ranges
512–131072 and 1–1440 are validated, field errors are shown in Chinese, and an empty string is not converted to zero.
The original notes — management stays available while inference is paused, automatic probing sends requests, and `--no-refresh` pauses automatic tasks — are retained.

## Data flow and lifecycle

The page is imported on demand on first entry; when hidden, the form is not mounted but the draft is kept, and leaving management unmounts it and resets state.
With no modifications, background settings are synced; when there is a draft or a save is in progress, polling only updates the saved baseline and does not overwrite input.
The unsaved-changes prompt comes from comparing draft against baseline, and clears when the value is changed back to the original. An "Undo changes" action restores the latest baseline.

Saving runs through the existing same-origin management request, keeping authentication, timeout and session-change checks.
During saving, the form and repeat submission are disabled; the actual values returned by `/settings` are used as the new baseline.
A failed save keeps the draft and allows a retry; a successful save and a subsequent failed status refresh are explained separately.
Switching pages or signing out invalidates old feedback, so late callbacks cannot restore a previous session's form.
Saved results can be synced after switching pages; a second save is not opened while a request is in flight, avoiding concurrent writes from this page.
A summary poll started before saving must not overwrite a confirmed save result with older settings.

## Implementation and acceptance

1. Record the design, the baseline and the pre-redesign asset sizes.
2. Fill in the settings types and the save Host interface, move in the React page and on-demand hosting, and remove the old form logic.
3. Special coverage of numeric boundaries, empty values, decimals, the field allowlist, draft syncing and save states.
4. In the browser, in an isolated directory, verify the six echoed values, editing/polling, saving, undoing, page switching and signing out,
   and verify that management is available while paused, persistence across restart, drafts kept on failure, and desktop and narrow screens.
5. Type checking, build and artefact consistency, management special tests, and contributor and release checks,
   recording the actual screenshots, sizes and unverified scope.
6. Split across multiple commits, push, and open a six-section PR in Chinese.

Real service configuration is not used for save tests; isolated test directories are not committed, and the production entry point generates no test settings.
There is no configuration or data migration. Rolling back is just reverting this batch's front-end sources and the corresponding `web/` artefacts and restarting.
