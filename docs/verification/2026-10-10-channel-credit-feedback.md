# Issue #178: Channel Balance Feedback Acceptance

Date: 2026-10-10. Scope: the shared channels page, the plugin RPC, and the generated standalone service artifacts.

## Locating the problem

The ZCode comment quoted by issue #178 describes a historical credential fallback problem. The current version already reads the account pool first, and the balance RPC also resolves credentials by the account's `credentialRef`. A substitute test using account-pool-only credentials confirmed that seven channels can query their balance, and that ZCode's `current()` and `status()` can read the account pool.

The shared-page problems confirmed and fixed in this round:

- The balance-capability list omitted TRAE, Cline, Raccoon, ZCode, and Gemini.
- Query errors and single-account failures were not displayed; the check-in status was unwrapped twice, breaking the "claimed today" badge.
- Gemini caches failed results, so a manual refresh must carry the optional `force: true` to actually retry.

No real accounts or upstreams were verified, so this does not claim to have solved the login and balance protocol problems of every vendor.

## Capability and data boundaries

The standalone check-in status query only uses channels that the existing backend genuinely supports. All channels keep their original login, renewal, and claim protocols.

A zero balance is displayed normally. A failure displays an unknown balance and the backend reason; a partial failure keeps the balances of the successful accounts and displays the failure count. Gemini's different quota windows are displayed separately, and the card summary only shows the number of accounts queried.

Manual refreshes and queries after an account write carry `force: true`; only Gemini consumes that option, and automatic reads keep the original cache. Balance requests are isolated by generation, so a late result from before a write, or a result arriving after unmounting, cannot overwrite the new state. Repeated clicks on claim do not send the request repeatedly.

## Actual verification

The final source and generated artifacts were run:

Merged mainline `0b7ec68` before committing (including the UI animation from PR #190), and resolved the generated-file conflict by rebuilding. After the merge, ran the contributor regression suite again, 33/33, the page-generation check, the copy check, and the standalone type check, and refreshed the partial-success page screenshot.

| Command | Result |
| --- | --- |
| `node scripts/build-channel-pack.mjs` | Succeeded, pack about 2.74 MiB |
| `node scripts/build-standalone-channels.mjs` | Succeeded |
| `node scripts/channel-pack-test.mjs` | Passed, including the shared page and actual RPC regression |
| `node scripts/standalone-channels-test.mjs` | 12/12 passed |
| `node scripts/test-all.mjs --mode contributor` | 33/33 passed |
| `node scripts/client-lint.mjs` | 424 copy keys and 141 style rules passed |
| `node --check scripts/standalone-ui-preview.mjs` | Passed |
| `node scripts/build-standalone-ui.mjs --check` | 10 local resources consistent; two pre-existing lucide `use client` ignore warnings |
| `npm run typecheck:standalone` | Passed |
| `git diff --check` | Passed |
| `node scripts/test-all.mjs --mode release` | 0/3; the manifest digest, sizes, and catalog revision were not updated |

The channel pack build uses esbuild 0.24.2, jose 6.2.8, and undici 8.11.2, matching the dependency code of the original artifacts. The generated pack only changes the Gemini call parameters; the standalone channels additionally update the original package SHA256. No generated files were edited by hand and no dependency upgrades were introduced.

The failing release checks require the maintainer to update the manifest, catalog, and signature following the repository's existing `release-sign` flow; this round did not modify the trust public key, forge a signature, or publish a release.

Not run: a real DSH desktop host, real vendor accounts, or real check-in claims. The shared components and the actual plugin bundle use substitute tests, and the standalone side uses an isolated preview service.

## Browser acceptance

Preview address: `http://127.0.0.1:18906/?issue=178`. It uses the dedicated ignored directory `.verify/ui-credits-data`, with automatic check-in and automatic model refresh turned off. All accounts, tokens, and balances are substitute data. The production CLI does not load the preview script.

2. The substitute upstream returns 502 for everything: two failed accounts are displayed, the summary is `—`, and no zero balance is fabricated.
3. After the upstream recovers, clicking "Refresh balance": the normal account recovers to 123, while the other account keeps its failed state.
4. ZCode: the card and the account row show 123K tokens, keeping the refresh and claim entry points.
5. Gemini: shows 80% for the 5-hour window and 40% for the weekly window, summarised as "1 account queried", with no claim button.

### Partial success

![Normal balance and failed accounts displayed side by side](channel-credit-feedback/partial-success.png)

### Query failure

![Unknown balance and a failure notice displayed when everything fails](channel-credit-feedback/query-failed.png)

### Retry recovery

![Normal account balance recovered after refreshing](channel-credit-feedback/retry-recovered.png)

### ZCode

![ZCode token balance and actions](channel-credit-feedback/zcode-controls.png)

### Gemini

![Gemini quota for each window](channel-credit-feedback/gemini-quota.png)

## Configuration and rollback

No account data is migrated and the credential storage location is unchanged. The new RPC fields are optional, and the original calls remain compatible. Rolling back this PR's code and rebuilding the shared page and standalone channel artifacts is sufficient; there is no need to delete accounts or data directories.

Git only includes source code, generated resources, tests, acceptance documentation, and actual screenshots; substitute credentials, management tokens, logs, and test data directories were not included in the commit.
