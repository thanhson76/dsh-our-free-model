# PR #97 Review Fix Decisions

## Confirmed Scope

- Remove the OpenCode account card from "Free channels", avoiding calls to an inapplicable browser account-creation RPC.
- When OFM mounts the channel pack, disable its OpenCode provider, automatic slot creation and dedicated RPCs; existing accounts and credentials are retained.
- OFM's original anonymous free models continue through `src/adapter.js` and `src/upstream.js`.
- The channel gateway relay and the channel pack use the same home resolution order.
- Upgrade backup, install clean-up and restore include the published channel-pack runtime files.
- When a successful refresh returns an empty Kilo free pool, clear the catalogue and the persistent cache; when a refresh fails, keep the original cache.
- The changes stay on a separate branch; with the user's authorization, install the fixed build on this machine's Desktop for a real smoke test.

## Assumptions and Maintenance Boundaries

The existing user scale, request concurrency and other channels' behaviour are unchanged. Disabling the OpenCode account integration adds no network requests and does not migrate, delete or output credentials. A rollback must restore the pack and WASM to their original bytes. The development source and repository scaffolding remain protected. Release signing is still done by the maintainer.

## Decisions

1. Disable OpenCode via an appended optional mount configuration; omitting the configuration preserves upstream behaviour. Merely hiding the card is not enough to stop automatic slot creation, and deleting existing data does not meet the user's requirements.
2. The relay reads `profileContext` on every request and resolves in the order `DSH_CHANNEL_PACK_STATE_DIR`, `profileContext.home`, `DSH_HOME`, default home; OFM's own data locations are unchanged.
3. Precisely include the four vendor files of the current release, avoiding removal of the scaffolding protection over the whole vendor tree.
4. Package directly from the version-controlled TypeScript source, avoiding dependence on an old lib that is not checked in; record the local adaptation differences and verify the generated package.
5. A valid Kilo listing is authoritative for the current complete free pool, including `data: []` and an all-paid listing. A network, HTTP, JSON or listing-structure failure does not mean an empty pool, so the old cache is kept; the existing persistence and catalogue refresh mechanisms are reused, with no new requests, accounts or data migrations.

## Verification Results

- Previous round of `npm run test:contributor`: 26/26 suites passed.
- `node scripts/channel-pack-test.mjs`: the actually generated package mounts 13 account providers, with OpenCode not registered/pre-warmed, historical accounts retained and the creation RPC rejected; the actual integration page renders 13 cards; OFM's anonymous models can be listed and stream back from local HTTP.
- `node scripts/chan-relay-test.mjs`: 25 items passed, including key isolation across different homes, environment overrides and the authentication fence.
- `node scripts/updater-test.mjs`: passed, including restoration of the pack/WASM original bytes, clean-up of new vendor files on a failed 1.x upgrade, and preservation of the development source.
- `tsc --noEmit -p tsconfig.json`: passed; the repository's existing configuration only checks the adapter seams and does not mean the whole vendored TypeScript has been type-checked.
- `node --check index.js`, `node --check client.js`, `node --check vendor/channel-pack/pack.js` and `git diff --check`: passed.
- The pack has been rebuilt from the real source; the build dependencies live in an isolated temporary directory, and the temporary dependencies inside the repository have been cleaned up.

### This Round's Kilo Empty-Pool Fix

- Before the change, the new regression actually failed: after refreshing with an all-paid listing, the discovery catalogue, the settings catalogue and the model picker all still kept two old models, and the on-disk cache was not cleared.
- After the change, `node scripts/kilo-test.mjs`: 57 items passed, covering an all-paid listing, an explicit empty listing, cache persistence to disk, local rejection of expired models, free-pool recovery, six kinds of refresh failure, and an empty cache after an actual re-mount.
- `node scripts/picker-test.mjs`: passed, verifying the original free-model selection and authentication behaviour under a shared catalogue refresh.
- `node scripts/channel-pack-test.mjs`: passed, confirming the OpenCode account channel is disabled, historical accounts are retained, and the original anonymous models reply by streaming.
- `node --check index.js`, `node --check scripts/kilo-test.mjs`, `git diff --check`: passed.
- Before committing, `npm run test:contributor` was run again: 26/26 suites passed; the adapter-scope `tsc --noEmit -p tsconfig.json`, the syntax checks of the three runtime entry points and `git diff --check` were run again and all passed.

### Real Desktop Smoke Test (2026-10-06)

- The install source was the current changes in the `fix/pr97-reviewed-channels` workspace, based on `699e5163683570f9c41077981d1ee17b1bfe038c`. The current plugin was backed up first, then the declared runtime files were copied; the SHA-256 of 39 files was verified after installation and after hot reload, with zero differences.
- The install location is `~/.dsh/profiles/desktop/node_modules/dsh-our-free-model`, using the real directory and the existing registration; hot reload was done through the settings page, without restarting Desktop.
- The actual integration page shows 13 account channels and does not show an OpenCode card. The original anonymous free models and Kilo models still appear in the settings page and in the conversation model picker.
- A real "test once" from the Desktop settings page: MiMo V2.6 Flash succeeded in 3342 ms; Kilo Ling 3.1 Flash succeeded in 2112 ms. Both have successful terminal states in the local statistics.
- A separate Desktop MiMo V2.6 Flash conversation replied `OK`; the UI showed it complete, taking 30 seconds. The prompt required no tool calls and no file reads or writes.
- Another separate Desktop Kilo Ling 3.1 Flash conversation (High) replied `OK`; the UI showed it complete, taking 30 seconds; the same minimal prompt was used.
- The running channel gateway's `/v1/models` returned HTTP 200. Using the installed relay code and the current home's gateway credentials, a temporary loopback relay was set up to query the same gateway and returned HTTP 200 with 39 models; the temporary relay was closed after the test, and no persistent LAN forwarding was enabled.
- The local backup, install summary and screenshots are stored in `~/.dsh/plugin-dev-artifacts/ofm-pr97-reviewed-20261006-203907/`; these local assets are not committed.

Logging in to each of the thirteen channels one by one, a formally signed upgrade, and a real upstream empty pool were not tested. The empty-pool and refresh-failure semantics are covered by the local regressions above. The fix is submitted as a separate PR to #97's feature branch; the changed release files need the maintainer to re-sign the manifest before #97's readiness to merge into main can be verified. This branch has no AOCI assets, and the current MCP is bound to the original 91db workspace, so its state cannot be used to claim this branch's index is aligned.
