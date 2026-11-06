# 2026-10-17 Full Issue Audit and Local Acceptance

Audit baseline: `f73da6b`, version `2.5.1`. A snapshot of all 272 GitHub issues was read, and each was judged against the current code, targeted reproductions and tests; GitHub's open/closed status was not used as a substitute for verification.

**Conclusion: this round fixed several groups of local defects that were still reproducible, but it cannot be claimed that all issues are resolved or that all real upstreams are usable. Nothing was pushed, released, version-bumped, nor was any public key replaced or release manifest re-signed.**

## Audit counts

| Judgment | Count |
| --- | ---: |
| Blocked by upstream or environment | 68 |
| Fixed in this round | 25 |
| Awaiting release or distribution handling | 10 |
| Awaiting reproduction or verification | 62 |
| Unimplemented feature requests | 17 |
| Already fixed in the current version | 52 |
| Partially resolved | 36 |
| No valid issue | 2 |

Duplicate reports keep their own numbers; these counts are numbers of issues, not numbers of distinct root causes. “Already fixed in the current version” covers only the corresponding code path and does not mean the reporter's production environment has been verified.

## Fixed in this round

- Announcement reappearing repeatedly after a mirror fallback (#406), including de-duplication across restarts and detection of later arrivals when the feed is empty.
- Cordis injection declarations for hot-reload callback/namespace identity, hidden caches, consecutive reloads and failure rollback (#348).
- Target version in upgrade rate-limit diagnostics, duplicate parse requests and failure history (#384 partial, #148).
- Purely Chinese lane names being silently dropped (#379), wrong outbound IDs for aggregate models (#323), RTK treating source code as a clean git state (#322/#389).
- Blank-response judgment in five adapters and protocol integrity of mixed tool/thinking streams (#397), blank-history serialization (#308), and parallel image and tool results (#112).
- Account rotation after Raccoon/Loomy credits are exhausted, accurate renewal attribution and credit error messages (#382/#166); covering HTTP 402, SSE business errors and HTTP 200 JSON business errors.
- Re-entry of stale idle events in auto-resume, user stop, lifecycle teardown and the real host inbox structure (#282).
- Hiding individual models and groups, restore entry points and persistence across restarts (#409/#319/#317/#276/#182/#116); ambiguity in account state/actions and toggle background colour (#212/#115/#218).
- Probing no longer locks the whole settings page (#194), the user's desired port is kept after a port conflict (#305), and the lane editor shows member capacity and the live intersection (#372).
- Missing runtime dependencies and frontend resource chunking in the standalone package; an isolated-install resource test was added. The default test entry now includes previously omitted regression suites, and channel source protocol verification was added.

## Verification results

| Verification | Result and scope |
| --- | --- |
| Final code check | `npm run test:contributor`: 66/66 suites passed |
| Default full check | `npm test`: 65/68; the only failures were the manifest, release and catalog release-consistency gates |
| Type check | Root adapter and standalone frontend passed; vendor compared with the original HEAD: diagnostics 25 → 21, 0 new; vendor as a whole still does not pass |
| Node compatibility | Reload regressions passed on Node 22.19.0 and 24.11.1 |
| Channel source compatibility | Channel source, real host streaming protocol and inbox regressions passed on Node 22.19.0 |
| Clean dependency install | The final source was copied in isolation, with no existing node_modules or root lock file; `npm install --ignore-scripts` and the real host/channel source tests passed, and CI gained the corresponding install step |
| Rust | 4/4 passed, including a real Node process and Windows paths containing spaces/Chinese characters |
| Browser | The final React and login suites passed, covering desktop, 390px, 320px, navigation, drafts, saving, keys, sessions and sign-out |
| Real DSH | The full web profile of installed CLI 0.2.0-rc.2, with an isolated home, updated from 2.1.0 to 2.5.1 from a local tarball; the real API, plugin resources, restart and data retention passed; inference used a local stand-in |
| Windows native | NSIS install, 2.5.0 → 2.5.1 in-place update, startup, 39 UI operations, authentication, model list, settings and API Key retention, normal exit, data-lock release and uninstall all passed |
| Original environment restoration | The tests used a separate OFM_HOME/WebView data set; the original installation's executable hash, registration information and shortcuts were restored; no exit signal was sent to the original DSH process |
| Generated artifacts | The channel pack, standalone business package and frontend were all regenerated uniformly; the frontend and standalone channel checks passed |
| Real anonymous upstream | Two requests failed with connection reset / Socket failure respectively; cannot be marked as restored and usable |

The local Windows installer package was used for acceptance only and was not released. The signed manifest still describes the original release bytes; after code changes, it is correct behaviour for the three release gates to refuse to pass — an old signature must not be copied, a public key must not be swapped, and validation must not be skipped. Before any future release, the consistency preparation must also be completed using the existing authorized signing process.

## Boundaries not yet resolved

- npm latest was still measured as 2.1.0. Online package-manager rollback/distribution issues such as #407/#408/#335/#378/#404 require the release channels to be synchronized; a successful local tarball update is no substitute for an npm release.
- The real active AgentLoop tool/skill context issue in #315 and the macOS Electron/undici QoS path in #263 still need reproduction under the corresponding host/operating system. The current Windows results do not cover real macOS/Linux/phone devices.
- New providers, full English for the standalone app, standalone LAN/container deployment, cross-account routing capability and other unimplemented product requirements remain in the table below; “no product decision made” was not written up as “fixed”.

The original snapshot, the full evidence for each area, the final test logs, installation records and screenshots are stored in this repository's `.verify/issue-audit-20261017/`; that directory is ignored and is not distributed with the plugin or release packages. The machine-readable ledger is `audit-ledger.json` in the same directory.

## Per-issue judgments
