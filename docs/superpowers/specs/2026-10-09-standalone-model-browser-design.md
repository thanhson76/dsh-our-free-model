# Standalone model roster redesign

## Confirmed scope

The user has approved the phase-two plan and asked to start, beginning with the first batch, the model roster.
Following phase one's shared navigation, colours and basic components, the model page is migrated into React.
Name and ID search, channel filtering, model capabilities and availability status, copying IDs,
roster refresh, active probing and single-model testing are retained; capability and status filters and cancelling a test are added.
The usage, log, settings, channel-detail, EAC and sign-in redesigns in later batches proceed separately.

## Page and interaction

The page uses an easily scanned model list showing the model name and ID, channel, vision and thinking capabilities,
context and output caps, availability status and actions. On narrow screens the same entry uses a compact layout.
Long names wrap; the full ID can be copied; unknown capacities and unprobed states are shown explicitly.
Being included in the roster and having been probed as available are shown separately; models from channels that are not connected are not marked as callable.

Search and filters operate in combination, and show the number of matches and the roster total; when there are no matches, the filters can be cleared.
A refresh state does not clear the filters; returning after switching pages keeps the filters, and signing out of the session clears the page state.
Roster refresh and active probing keep their existing interfaces, and active probing is still explicitly labelled as generating inference requests.
Only one single-model test runs at a time; it can be cancelled, and it is interrupted when switching pages, signing out or cleaning up the component.
The test-result area shows the model, elapsed time, the body text or the specific error; an old request cannot overwrite a new result.

## Implementation boundaries

- The model page is loaded on demand and shares the existing React; the overview does not render hidden model entries at startup.
- TanStack Virtual maintains the visible entries, supporting dynamic height, scrolling and keyboard focus,
  without hand-writing a virtual-list engine; changing the filters returns to the top of the list.
- The existing management session, authentication, timeout and generation checks are used. The front-end Host interface is extended to pass a cancellation signal,
  and the backend reuses its existing mechanism of cancelling inference after the request closes.
- The old model DOM rendering and event binding are removed, while the other pages' control logic is kept.
- The DSH plugin, channel protocols, account data and inference core are not modified, and user credentials are not migrated.
- Split across multiple Chinese commits; no version bump, tag creation, installer build or Release publication.

## Acceptance

1. Type checking, the production build, generation consistency and the management-authentication special tests pass.
2. With thousand-model data, only visible entries are mounted; the list can be scrolled to the end, and filtering does not leave it sitting at a blank position.
3. Searching names and IDs, combined channel/capability/status filtering, no-result and reset cases all behave normally.
4. Copying an ID, roster refresh, active probing, and test success/failure/cancellation all give clear feedback;
   late requests after switching pages or signing out do not restore old content.
5. Actual clicking on desktop and narrow screens, screenshots, and checks for overflow and browser errors.
6. The thirteen channels and the EAC page remain reachable, the contributor regression is run, and static asset sizes are recorded.
7. Timing notes state the measurement method and samples, and do not treat tool round-trip time as pure rendering time.

## Implementation tasks

1. Sync mainline, record the design and baseline, install the virtual-list dependency.
2. Migrate the model page and its hosting interface, completing cancellation and asynchronous lifecycle handling.
3. Implement the list layout, virtual scrolling, filters and test state.
4. Build, run the special tests and browser acceptance, and fix the problems actually found.
5. Record evidence and limitations, and commit code, tests and documentation in batches.
