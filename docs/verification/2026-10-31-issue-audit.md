# 2026-10-31 Full Issue Audit and Fix Verification

Baseline: `origin/main` @ `5fcb5fa` (v2.7.3). This round's working branch was `audit/issues-20261031`, finally pushed to `main` @ `9b3f341`.
**Released**: see `docs/releases/v2.7.4.md` (2.7.4, `feed/manifest.json` has been re-signed).

## 1. Merged community fix PRs (19, each verified locally before merging)

| PR | Issue fixed | Verification suite |
|---|---|---|
| #538 | #682 Aggregate channel missing modelsUrl | aggregate |
| #675 | #701 / #213 TRAE cache hit rate 0% | channel-pack |
| #622 | #621 Streaming tool_calls frame id/name and index | channel-pack |
| #673 | #452 Bare index frames | forward |
| #661 | #548 Responses stream missing sequence_number | forward |
| #631 | React hooks order (announcement portal) | client-lint |
| #650 | #587 Network failure without a code → no retry | channel-pack |
| #658 | #549 Upstream 5xx with an empty response body does not say which layer failed | free-lane-wire |
| #674 | #460 keepalive comment frames keep the idle deadline alive | free-lane-wire |
| #630 | combo silent candidates block the whole chain | combo |
| #620 | EAC login and the Windows system proxy | eac-abort / eac-login |
| #671 | #670 Model refresh endpoint returns the result from each source | standalone-management |
| #575 | #532 Turns without a sessionId share the global session | aggregate-wiring |
| #644 | Session picker does not refresh after channel models are hidden | standalone-channels |
| #610 | Tool result messages across old and new DSH kernels | gateway-source / standalone-channels |
| #685 | #681 Channel account "Test" always fails | channel-pack (#681 section) |
| #343 | #335 pnpm-managed installs reject in-app upgrades | updater |
| #638 | #474 Separate invalid JSON in tool arguments from truncation | forward / stream-failure |
| #637 | #456 Windows 0600 takes effect via icacls | private-file-permissions |

## 2. New local fixes in this round (8 items)

1. **`src/magpie-policy.js` redaction of third-party copy** (newly discovered regression)
   - After 2026-10-30 the upstream marketplace listed `@magpie-community/page-agent-office`, whose description mentions "WorkBuddy/CodeBuddy", causing the `magpie-policy` suite to fail.
   - Fix: redact names when routing third-party content at the management boundary (harmless plugins are preserved); id-bearing surfaces such as `/api/providers`, `/api/upstream`, and `/api/importapps` are exempted.
   - Verification: `magpie-policy: 16 checks passed` (new regression case added).
2. **`src/magpie-engine.js` fallback when a port is occupied** (#688)
   - Windows reserved port ranges (winnat/Hyper-V/WSL) drift across restarts, and `EACCES` was misjudged as "already has an owner" → the workbench constantly showed "startup failed".
   - Fix: `ownerLease` distinguishes `EACCES`/`EPERM` from `EADDRINUSE` (for the former, discard the stale record and reacquire it); when the saved gateway port cannot be bound, take a new port and persist it.
   - Verification: `magpie-engine: all fixture and built-binary checks passed`; the real engine showed `state: ready`.
3. **`src/catalog.js` `-vl` segment visual marker** (#458)
   - The family rule `vision:false` marked `nemotron-*-vl` variants as text-only. Fix: treat the `-vl` segment as a visual marker (also hits in the `-free` suffix scenario).
   - Verification: 4 new assertions added to the sniff suite passed.
4. **`src/gemini.js` removal of empty-string enum members** (#251)
   - Gemini's strict validation rejects empty strings in `enum` (400 `cannot be empty`). Fix: strip empty-string members during conversion; if all members are empty, remove the enum constraint entirely.
   - Verification: `gemini-gateway-test: 25 passed`.
5. **`client.js` workbench expansion does not lose the collapse button + Esc inside an iframe** (#700)
   - At the moment of expansion, when the `portal` had not yet been created, it rendered `null` and the entire toolbar (holding the only collapse button) disappeared; Escape was only listened for on the parent window, so it failed when focus was inside the iframe.
   - Verification: `client-lint: OK`, `workbench: 17 checks passed`.
6. **`src/eac.js` lazy loading of undici** (blocking regression)
   - `undici` is only a devDep, and the top-level import made the real host and offline copy trees crash outright (the `eac-login` suite could not run at all on main).
   - Fix: `import('undici')` on demand on the proxy path; when undici is missing, throw a `TRANSPORT` error (do not silently connect directly, to avoid leaking the proxy user's IP).
   - Verification: `eac-abort` and `eac-login` passed; after a real install, `index.js` loads.
7. **`src/open-external.js` resolving execFile at runtime**
   - `promisify(execFile)` was fixed at module load time, breaking the offline stub (`syncBuiltinESMExports`). Fix: resolve it at call time.
   - Verification: `eac-login-test: all checks passed`.
8. **Packaging integrity fix (the most important finding of this round)**
   - `src/private-file.js`, newly added by #637, was not listed in the `files` field of `package.json`, so **the published package would be missing that module, and `src/store.js` would crash on load after a user installed it**.
   - Fix: merge `restrictPermissions` into `src/open-external.js` (keeping the 80-file limit), and update 11 references, the packaging manifest, and the tests in sync.
   - Verification: `legacy-upgrade: 8/8 passed` (old versions 1.3.1 and 2.5.9 can both install and load the new code, within the 80-file budget).

## 3. Test results

| Item | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test` (full run, 109 suites) | 104/109; the 4 failures were release-signature drift (`manifest`/`release`/`legacy-upgrade --production`/`catalog`), expected before a release; `gateway-disconnect` had a flaky exit code (9/9 passed in 10/10 reruns) |
| `legacy-upgrade` (System32 bsdtar) | 8/8 passed |
| Real install (isolated `DSH_HOME`) | `pnpm add file:*.tgz` succeeded, `index.js` loads |
| Real DSH Web startup | Succeeded, `/api/our-free-model/summary` 200, `channels: {state:"ready"}`, 26 models |
| Workbench engine real-machine startup | `state: ready`, `engine/ui/` 200 |
| `npm run selftest` (real network) | Local chain all 200; free lane 502 = upstream OpenCode quota limit (#690/#695/#708 external blockers); without Bun, returns clear install guidance |

## 4. Leftovers and items needing a maintainer decision

- **Free lane forces Bun** (introduced in 2.7.3): without Bun on the local machine the free lane is unavailable; `OUR_FREE_MODEL_BUN` or `OUR_FREE_MODEL_FREE_TRANSPORT=node` is required. Upstream is also doing client fingerprint validation (#708), and the node fallback is rejected too.
- **Release signature**: `feed/manifest.json` has drifted from the source by 57 bytes; the `manifest`/`release`/`catalog` checks are red and need re-signing with the private key and a release.
- **Beyond scope / needs a rewrite**: #341, #530 (routing/combination across adapters), #512 (direct connections within China), #507 (refusal classification), #525 (duplicate of #605).
- **Needs real-testing annotations**: #264 (cline step-5-preview multimodal), #542 (long tool sessions), #639 (empty-content issue), #469/#161 (subagent keeplist).
