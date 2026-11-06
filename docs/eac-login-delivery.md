# EAC Login Claim Recovery

## Scope and evidence

Fix the claim path where Desktop still waits for login after browser authorisation succeeds. An on-site claim request returned HTTP 520 and then returned pending afterwards; there are no remote logs yet, so the source of the 520, or whether the token was lost because of it, cannot be determined. The client swallowing polling errors, and the old gateway deleting the pending-claim token before returning the response, are confirmed code behaviours.

## Decisions

- Adopt the compatible `retain=1` claim plus a `POST /auth/ack?link=...` confirmation: the new plugin first atomically writes and reads back the local token, then confirms with `x-ofm-user`. The server deletes it after verifying that the link code matches the token; after syncing the upstream update, old plugins keep claiming idempotently, and new plugins stay compatible with gateways that have no ACK.
- Merely extending the timeout cannot fix a lost response; persisting the server-side plaintext token would widen the credential storage scope. After syncing upstream's encrypted pending-claim storage, the token is kept in users.json with the existing 15-minute TTL; under the same storage path and key it can be recovered across a single-instance restart.
- The Host merges concurrent claims for the same link code and briefly keeps a success receipt for retries after a local response is lost; signing out or unloading invalidates an in-flight claim.
- The browser polls serially, waiting 2.5 seconds after each completion; errors display a safe classification and retry automatically. sessionStorage keeps only the link code, the authorisation entry point and the start time, retaining the original 10-minute window, and allows re-initiating after cancellation.
- When the status endpoint fails, an unknown mandatory policy is not displayed as a compatibility period.

## Constraints and acceptance

Do not adjust the GitHub/Star requirements, the mandatory switch, the signing trust root or user data locations. The token must not enter the frontend, logs or error bodies. The assumption is that the existing single-instance deployment and rate limiting are maintained; no distributed session storage is introduced. Tests cover the old protocol, the new protocol's re-claim and confirmation, error/revoked tokens, save failures, concurrency, sign-out races, error prompts and recovery when the page is reopened. Remote deployment is performed by the server maintainer; end-to-end acceptance requires the user to complete GitHub authorisation in person. Local tests cannot prove the remote 520 is resolved.

## Historical verification record (2026-10-06, before the update)

- `node scripts/test-all.mjs --mode contributor`: 27/27 suites pass, including the new `eac-login` and the extended `eac-auth`. The final login-button disabling adjustment again passed `eac-login-test.mjs` and `client-lint.mjs`.
- `tsc --noEmit -p tsconfig.json`: passes; covers only the existing adapter type-checking scope.
- `node --check` checked client, index, auth-github and the new eac-login; `git diff --check`: passes.
- The local Desktop had index, client and the new eac-login replaced, with the three files' SHAs matching the final sources; the old plugin was backed up first, then installed, and the real UI confirmed the hot reload and the "authorisation policy unconfirmed" wording.
- The real UI can start a login and shows a cancel button; after a client update reloaded the page, reopening the settings still showed the same pending login state, with all login buttons disabled. The user's own GitHub authorisation and final token persistence acceptance were not yet completed.
- The remote `/auth/status` was verified through the installed transport: HTTP 200, about 1844ms, configured=true, required=false, authorized=false; there is no user token on this machine yet.
- The remote gateway was not deployed, the server-log root cause of the 520 was not located, and no release signature verification was performed. Pending-claim records still cannot be recovered across a server restart or multiple instances.

### Investigation after the user authorised again

- The user reported that after authorising again they were still not logged in. An actual claim for the link code shown in the current UI: HTTP 200, 2626ms, status=pending; there was no token on this machine before or after the claim. The link code, OAuth parameters and token are not recorded in this document.
- The remote start returned 302, with a redirect_uri using the same origin and the `/eac/auth/github/callback` path as the plugin gateway, and the issued state corresponding to the requested link code; a callback with an invalid state returned the expected 400.
- An ACK for a random, non-existent link code, carrying no token: the remote returned HTTP 404, not found. The fixed version should return 401 for this, so the remote does not yet provide the confirmation protocol added this time.
- The local index/client/eac-login digests still match the fixed sources. No screenshot of this successful page or server logs have been obtained yet, so it cannot be determined whether the pending came from a mismatched link code, the old protocol consuming early, a restart, or multi-instance state loss.

## Client wrap-up

As requested by the user, the client work is complete, and remote deployment is handled by the server maintainer following the handover document:

- `retain=1` claiming, atomic saving and read-back, ACK after saving, and compatibility with old and new gateways are implemented.
- Merging concurrent claims for the same link code, protection against late responses after sign-out, failure prompts and serial retries, waiting-state recovery and cancellation are implemented.
- The three client runtime files of the final sources match the SHAs of the Desktop installed files, and the original installation backup is still retained; this round only added verification and did not replace the runtime files again.
- A complete loopback integration test was added: the real Host claim module + Node HTTP transport + a real user file in a temporary directory + the actual gateway, verifying that saving happens before ACK, ACK=200, the saved token can be authorised by the gateway, the pending-claim record is removed after confirmation, and retry after a lost local success response. GitHub uses a stub, no remote server is accessed, and no real user authorisation file is modified.
- After the new integration test, `node scripts/test-all.mjs --mode contributor` was run again: 27/27 suites pass; the adapter type check, the relevant syntax checks and `git diff --check` pass again.
- This machine has what is needed for integration testing with the fixed gateway. After remote deployment completes, a fresh login round must be started; the final real-authorisation acceptance is still pending, and a passing local integration test must not be described as the remote problem being resolved.

## PR update and current verification state (2026-10-07)

- The user has confirmed that a real GitHub login verification passed; that conclusion comes from the user's feedback, and the remote mandatory policy, module versions or the 520 root cause are not inferred from it.
- When updating PR #107, the target branch was synced to `8f4f89e`, keeping upstream `cce8e30`'s encrypted persistence of pending-claim tokens, repeated claims and expiry determination, and keeping the latest upgrade-recovery fixes.
- An optional ACK was added on top of the encrypted storage: the client confirms after saving and reading back, and the server persistently deletes the pending-claim record at the same time. Upstream's idempotent claim behaviour for old clients is retained; one-time claim semantics are not restored.
- Both the Host and the real client hook handle the server's `expired`, ending the wait and prompting to re-initiate; the merged tests cover retained claims across restarts, confirmation-deletion across restarts, and expiry-wait cleanup.
- When GitHub login and Star must be mandatory, the maintainer sets the actually effective `REQUIRE_USER_TOKEN=1`, syncs the process manager environment and restarts; the status should return `required:true`. Authorised calls succeed, and EAC requests with no user token but a valid signature are rejected. The anonymous free lane keeps its original behaviour.
- The remote mandatory policy was not re-checked, and the production release manifest was not re-signed. For the final integrated code, `node scripts/test-all.mjs --mode contributor`: 28/28 suites pass; the adapter type check, relevant syntax checks, document module SHAs and bash example checks, and `git diff --check` pass. Historical local tests are no substitute for this integration verification.
