# Native-program validation of the four fixes (2026-10-20)

> The test counts and native acceptance in this document are the historical record of the original PR candidate. This update has removed the UI downgrade feature as the user requested; the validation after the change is in the appended record below.

## Native program re-check

As the user requested, Windows Computer Use (@oai/sky) was used to actually click windows on this machine; no browser stand-in result was passed off as native-program acceptance.

- **DSH plugin:** the same executable as the locally installed DeepSeek Harness 0.2.0-rc.2, loading the candidate plugin from a separate profile on the D drive. index.js, client.js, the speed-test module, the adapters and the channel bundle match the workspace item by item by hash. The everyday profile's OFM 2.1.0 is left untouched.
- **OFM native desktop:** the current Rust sources were built as a Windows x64 release with `cargo build --release --offline --locked`, using the real Tauri/WebView2, the local service and the bundled Node; no dependencies were downloaded. The desktop shell and the current service assets are delivered in the same directory, and in the end the contents of 96 same-path source files matched; the generated root package.json is verified separately.
- The separate test directories, build output and large files are all on the D drive. No real account configuration, sign-in tokens, native binaries or screenshots were committed into the repository.

## Automatic validation and independent review

## Re-verification commands

```powershell
node scripts/test-all.mjs --mode contributor
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/standalone/tsconfig.json
node scripts/build-standalone-ui.mjs --check
node scripts/build-standalone-channels.mjs --check
```

The optional browser validation requires an existing Playwright and browser, and is not among contributor's default dependencies:

```powershell
# If your local modules are not on this repository's resolution path, set this to the location of your existing modules.
$env:OFM_PLAYWRIGHT_MODULE = '<path to the Playwright module>'
$env:OFM_BROWSER_PATH = '<path to the Chromium or Edge executable>'
$env:OFM_UI_SCREENSHOT_DIR = '<local evidence output directory>'
node --test scripts/standalone-model-row-test.mjs
node scripts/managed-upgrade-ui-test.mjs
```

## Scope limitations

The detailed local evidence is kept at D:/ofm-audits/20261020-computer-use: native-observations.json, evidence/, live-measurements.json, native-source-final.json, contributor-after-native-fix.log, model-row-after-native-fix.log, browser-after-native-fix/results.json. That directory contains private runtime data and should not be uploaded as a whole.

## Validation after removing the UI downgrade feature (2026-10-20)
