# Image Tool Ordering and GitHub Login Race Fixes

## Problems and decisions

### Parallel image tool results (#112)

In the original Chat projection, two image tool results formed `assistant → tool → user(image) → tool → user(image)`; the image messages broke up the sequence of parallel tool results, causing upstream to reject the history and later turns to keep failing.

The Chat and Responses projections now buffer the images in consecutive tool results, and any user text attached to legacy tool wrapper messages; once all consecutive tool results have been sent, the user messages are appended together. Each image still keeps its call-ID caption and is sent only once; the original session history is unchanged. The Claude projection continues to use the existing implementation.

### Judged expired before the login link is opened manually

The Host now first registers the link code by requesting the existing `GET /auth/github/start?link=...`, and only then opens the system browser or returns a manual link. It uses the Node transport, does not follow OAuth's 302 redirect, and uses a 15-second registration timeout; the frontend's start request timeout is 20 seconds.

When the gateway's start is visited repeatedly, it keeps the existing waiting or authorised result, does not overwrite a completed token claim, and does not extend the TTL of an existing waiting record. No new remote endpoint was added; when deploying the gateway, sync the idempotent handling in `worker/auth-github.mjs`.

### Still logged in by a late response after login is cancelled

A new local `POST /api/our-free-model/eac/login/cancel?link=...` was added. The Host marks the cancellation by link code and aborts the request; the claim path checks the cancellation state again before saving, preventing a late response from writing the user file or sending an ACK. Cancellation records are kept for 15 minutes and do not affect login with a new link code.

Atomic saving is the commit point: if the credential has already been saved when the cancellation arrives, the completed login is returned and the frontend shows success; the existing authorisation is not deleted, and cancellation success is not shown. If the cancellation request fails, the frontend keeps the link code and resumes serial polling; if only the cancellation confirmation response is lost, later polling can end the wait based on the Host's cancellation state. Signing out keeps the original credential-clearing flow and invalidates any in-flight claim.

## Verification

- `node scripts/test-all.mjs --mode contributor`: 28/28 suites pass, including client lint, image projection, EAC login and gateway authorisation tests.
- `node scripts/eac-login-test.mjs`: passes; the actual `index.js.apply` route registration, the actual login hook and the claim module are all covered. A temporary home, browser-launch stand-ins and network stand-ins are isolated from real user data.
- `node scripts/eac-auth-test.mjs`: passes; the actual Node transport connects to a local gateway and verifies that the state is pending before the browser opens, and that a repeated start keeps the authorised result and the original TTL.
- `node scripts/projection-test.mjs`: passes; covers V3, V4, multiple results in a single message, later turns, image deduplication, wrapper text and history immutability.
- `/tmp/ofm-pr97-build-20261006/node_modules/.bin/tsc --noEmit -p tsconfig.json`: passes; scope is the adapter only.
- All modified JS/MJS files pass `node --check`; `git diff --check` passes.

Controlled local tests are not equivalent to remote or Desktop acceptance. This round did not install Desktop, call real GitHub OAuth or a real model upstream, or change the server's mandatory authentication configuration. The anonymous free lane, the user file format and the existing signing trust root are unchanged.

## Release and rollback

The release digests of the runtime files changed; before release, the maintainer re-signs the manifest following the repository process. This round did not modify signature records or the trust root.

A rollback can restore the source and test files involved in this round; there is no user data migration. The gateway's idempotent start is compatible with the old Host. The updated Host and client should use the same plugin bytes, to avoid a new client calling a cancellation endpoint that an old Host does not have.
