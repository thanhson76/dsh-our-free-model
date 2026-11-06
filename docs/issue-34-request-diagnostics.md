# Issue #34 Request-Stage Diagnostics

## Scope and decisions

- Record stages for Chat Completions / Responses POST requests on the local forwarding and LAN relay paths.
- Serve users and maintainers troubleshooting a slow path, helping them distinguish request-body upload, hand-off and waiting for the model call.
- Use the host info logger; each request records only a fixed number of events, does not record per token, and adds no storage.
- Output only the server-generated request ID, a restricted parent request ID, a fixed endpoint, times and the outcome.
- Do not output the request body, model input or output, request headers, secrets, IPs or user-provided model names.
- Do not adjust timeouts, retries, heartbeats or usage billing, and do not claim to be able to fix transport delays outside the plugin.

Adopt request-stage logging rather than only adding a completion log: the latter still cannot observe an unfinished upload.
No UI or persistent request database is added for now, to avoid widening the scope of configuration, migration and maintenance.
An exception in a log callback must not affect the request, and all listeners are cleaned up when the request ends.

## Events

The host log prefix is `our-free-model request:`, followed by JSON.
`requestId` identifies the current hop; the LAN relay provides the local forwarding with a `parentId`,
which links the two hops. The parent ID is for diagnostics only and is not an authentication basis. A client-provided
`x-ofm-request-id` is replaced at the LAN entry; the local entry always generates its own new ID.

`at` is a Unix millisecond time; `elapsedMs` is the time relative to the entry, computed with a monotonic clock.

| stage | Meaning |
| --- | --- |
| received | Node has parsed the HTTP request headers but has not yet read the full request body |
| body_received | The request body has been fully read; at the local entry, JSON parsing is also complete |
| relay_dispatch | The LAN relay starts creating the HTTP request to the local forwarding |
| relay_connected | The TCP connection from the relay to the local forwarding is established |
| dispatch | The local forwarding starts calling the completion callback |
| first_delta | The streaming callback produces its first non-empty text, thinking or tool-argument delta |
| generation_finished | The completion callback has returned |
| finished | The HTTP response has been handed to Node for output, with the HTTP status and execution outcome attached |
| aborted | The HTTP request or response disconnected before completion |

`dispatch` includes adapter preparation and requesting upstream; it does not prove upstream received the request.
`first_delta` does not include HTTP response headers, SSE heartbeats or empty deltas; nor does it guarantee the client
has displayed body text. Non-streaming calls do not report this event.
`finished` does not prove the remote client received all bytes; a streaming HTTP 200 can still
carry a generation failure, so the local forwarding's `outcome` must be checked at the same time. The LAN relay's
`outcome: relayed` only means the hand-off completed; the generation result should be looked up in the associated local events.

## Usage and limitations

While the request body is still uploading, there should only be `received`; if a long time passes after `body_received`
without `generation_finished`, the wait has entered the plugin's processing stage.
For a LAN request, the relay's `requestId` can be found via the `parentId` of the local events.
Each hop's terminal state is recorded only once, and a late generation result after cancellation adds no further events.

No usage record does not mean the request never arrived; no entry log also requires ruling out log filtering,
process restarts or log loss first. DNS, TCP, TLS and proxy queueing before HTTP request-header parsing
still need to be located in the caller's and proxy's logs. SSE comment heartbeats only keep the connection alive; they cannot reset
the pi-ai idle watchdog, which only consumes deltas with valid content.

## Verification record

- `node scripts/forward-test.mjs` passes, adding 14 diagnostic scenario checks, including
  unfinished uploads, interrupted uploads, streaming and JSON for both endpoint kinds, authentication and JSON rejections,
  heartbeats, streaming failures, cancellation, LAN correlation, logger exceptions, malformed URLs and unrelated polling.
- `node scripts/tui-test.mjs` passes, adding 4 host logger integration checks,
  covering the local lifecycle, the two-hop LAN correlation, and that the two forwarding keys never enter the logs.
- After merging `origin/main` (`77a5998`), `npm test` returned 19/22;
  the three failures were `manifest`, `release` and `catalog`, because the release sources
  did not match the old signed manifest and catalog digests. The current main also contains already-merged, not-yet-re-signed
  release file changes; this change additionally modified `index.js` and `src/forward.js`.
  The other suites pass, including the two affected suites above and the merged heatmap regression.
- Using the TypeScript installed in the original workspace to run
  `tsc --noEmit -p tsconfig.json` gave exit code 0; this check's scope is the adapter only.
- `node --check src/forward.js`, `node --check index.js` and
  `git diff --check` pass.
- The user's external transport environment at the time was not reproduced, and no real DSH desktop acceptance or release upgrade was performed.

## Release

After modifying release sources, the maintainer must re-sign the manifest with the existing release private key, sync the catalog integrity
records, and refresh the revision as described in `RELEASING.md`. Contributors do not replace the signing public key.
