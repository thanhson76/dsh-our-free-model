# Standalone Application Channel Completion Verification

## Scope and Environment

2026-10-08, Windows, Node.js 24.18.1. The original thirteen channels' business logic and EAC authorization flow were reused, with standalone accounts, configuration, and ledgers written to an explicit data directory; the original plugin channel package, pages, and host determination were retained.
This is a full-repository source-code running version; no standalone installer has been made yet and no Release has been published.

## Automated Verification

| Command | Actual result |
| --- | --- |
| `npm run test:contributor` | 32/32 suites passed, including standalone service 20/20, management 13/13, channels 11/11, and the original plugin regression |
| `npm run test:standalone-channels` | 11/11 passed, running real adapters; the network only requested a local HTTP stub |
| `npm run typecheck` | Passed; the scope is the original adapter seam, not all newly added JavaScript |
| `node --check <file>` | 15 standalone entry, channel, web page, and generator files passed |
| `node scripts/build-standalone-channels.mjs --check` | Passed; the generated business logic is consistent with the original package and the conversion rules |
| `node scripts/build-standalone-ui.mjs --check` | Passed; the shared page conversion is consistent with the generation script |
| `git diff --check` | Passed |
| `npm run test:release` | Not passed: the modified release files are inconsistent with the existing signed manifest; the maintainer needs to prepare and sign a new manifest |

The channel-specific coverage includes real registration of the thirteen adapters, model capacity and thinking levels, Chat/Responses,
streaming and tool calls, inline images, account management and backup, multi-instance isolation, restart persistence,
model/provider disabling, permanent credits locking, two-layer usage, network cancellation, and prohibiting late credential writes after stopping.
The EAC coverage includes the original GitHub prepare/poll/ACK, signatures, standalone user tokens, the model manifest,
the resource pool, exit, late state isolation, and cancellation. The tests did not access any external real inference or login upstream.

## Actual Web Page Operations

Using the built-in browser to visit `http://127.0.0.1:18888/`, with data located in the ignored directory
`.verify/channels-preview-data` and only local stub accounts. The following were observed and verified:

- Provider and backup page: saved a nickname, checked permanent credits locking, disabled and then re-enabled a provider, and the page showed that saving succeeded.
- After a restart, the nickname, credits locking, and account were retained; the model manifest showed Chinese provider names and the actual capacity, and unknown capacity was not shown as zero.
- The request log recorded that call as successful, with input 11, output 7, and 18 Tokens in total; the channel usage and log pages loaded normally.
- The EAC page showed unauthorized status, a GitHub login entry, and a local stub resource pool (concurrency 3, 24-hour active 5, capacity 100).
  No third-party authorization was clicked and no login was performed on behalf of the user.
- A temporary browser viewport of 390×844 was set, and the channel cards switched to a single column. The CSS viewport width reported by this browser tool was 506,
  and the document clientWidth/scrollWidth were both 487, with no document horizontal overflow; this is not equivalent to real phone testing.
  The viewport was restored after verification ended.
- The console error/warn records for the current verification tab were empty.

### Screenshots

The following use local stub data and do not represent a provider's real-time quota or availability.

![Thirteen account channels](images/standalone-channels-desktop.png)

![Provider and backup operations](images/standalone-channel-tools.png)

![EAC authorization and stub resource pool](images/standalone-eac-desktop.png)

![Narrow viewport channel cards](images/standalone-channels-mobile.png)

## Unverified Items and Release Restrictions

Real external accounts were not used vendor by vendor to complete login, verification codes, OAuth, check-in, renewal, or quota calls;
upstream changes and current availability still require verification with the user's actual accounts. A local stub passing does not guarantee that all providers are online.
No standalone installation artifact was created, no actual DSH desktop visual verification was performed, and no Release was published.
The original plugin regression and data isolation were checked, and the user's DSH credentials were not read or migrated.
Release manifest signing belongs to the maintainer's release process; this round does not replace the trust root or forge a signature.

## Locating and Fixing the Login Failure Feedback

The MiniMax device code response could not be parsed. The actual listening process on 18888 was checked and confirmed to still be
`.verify/channels-preview.mjs`. That process loads a test preload that redirects all external HTTPS requests
to a local stub; the stub returns a generic object for these authorization paths, producing the field errors in the feedback.
This was an error in delivering the preview without distinguishing test from real running.

The 18888 stub was stopped and replaced with a real service using the default standalone directory `~/.our-free-model`.
Test accounts, credentials, model answers, and simulated quotas were not migrated into the real directory.
The management summary adds `networkMode`, marks `fixture` when a channel stub is loaded,
and the web page shows a prominent test notice; the normal standalone entry is marked `live`.

### Real Upstream Verification

A real Worker was run in a diagnostic directory isolated from the user's installation, without importing any test preload.
Only four `account.create` authorization initializations were executed; no third-party page was opened, no authorization was completed, and no user credentials were read.
All of the following returned `ok: true`, a valid accountId, and an HTTPS login address:

| Channel | Domain of the returned authorization page |
| --- | --- |
| Cline | `authkit.cline.bot` |
| MiniMax Code | `account.minimax.cn` |

At the end of the diagnosis, the Worker was closed and the background polling for these incomplete logins was stopped.
This proves that the current real authorization initialization is usable; it is not equivalent to completing a real account login or verifying inference after login.
Management 13/13, channels 11/11, and the full contributor regression 32/32 were run again, and all passed.
After synchronizing the signed manifest from the latest mainline, `npm run test:release` was run and 3/3 suites passed.

The browser has re-logged in to the real service on 18888, and the page shows 0/13 accounts connected.
In addition, the test notice was confirmed visible on a temporary stub on 18889, and the temporary tab was closed after a screenshot.

![Channel page of the real standalone service](images/standalone-live-channels.png)

![Stub test mode notice](images/standalone-fixture-warning.png)
