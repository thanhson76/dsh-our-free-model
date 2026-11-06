# Desktop Built-in Update Verification

## Delivery Scope

An "App Update" section was added to the management area on the left, reusing the existing sidebar, Card, Badge, Button, settings cards, and light/dark themes. It shows the native desktop version, the latest desktop version, the check time, the release notes, download progress, and verification and installation status. Checking and downloading are performed in the local management service; the installation handover is performed only by the Tauri IPC bound to the current management window.

In this round, the product version was not bumped, no desktop package was publicly released, and the user's existing installation was not replaced. Desktop versions from before the built-in update section existed must first install a new version with this feature once, after which they can update within the app.

## Verification Performed

- `node scripts/test-all.mjs --mode contributor`: 99/99 suites passed.
- `node scripts/desktop-update-test.mjs`: 9/9 passed. Covers version selection, exclusion of plugin-only Releases, architecture matching, fixed sources, redirect limits, SHA256SUMS, corrupted and oversized downloads, cache re-verification, concurrency, recovery, and real management API permissions.
- `cargo +1.96.1-x86_64-pc-windows-msvc test --manifest-path packages/desktop/src-tauri/Cargo.toml --release --lib`: 6/6 native tests passed. Includes installation record limits, fixed paths, digest re-checking, downgrade prevention, rejection of argument injection, handover wait ordering, and Windows path quoting.
- Playwright Chromium rendering the current real build assets: 7/7 page interaction checks passed, with no page errors. Covers the new section, version and notes, download progress, verification failure, light and dark themes, the fixed native install command, and installation being disabled in the browser.
- `npm run typecheck`, `npm run typecheck:standalone`: passed.
- `node scripts/build-standalone-ui.mjs --check`, `node scripts/build-manifest.mjs --check`, `git diff --check`: passed. The published plugin's 79 runtime contents and signed manifest remain consistent.
- A read-only check against the official GitHub Releases: with the running desktop version at 2.7.1, the latest desktop was still identified as 2.7.1, and the plugin-only 2.7.2 was not mistaken for a desktop update; no installer was downloaded or executed.

When the native build was first compiled with the machine's default GNU toolchain, the environment was missing the dlltool PATH configuration. The existing MSVC 1.96.1 toolchain on the machine was used instead, and compilation and tests passed; the first failure is not counted as a pass.

## Visual Evidence

The following use the real frontend and styles; version 2.7.3 and the release notes are test fixtures, clearly marked as test mode at the top of the page; this does not claim that desktop version has been released. The installation IPC uses a stand-in that only records the fixed command and does not exit the real app.

![Desktop update found, light theme](images/desktop-update-available.png)

![Waiting to install, dark theme](images/desktop-update-ready-dark.png)

## Installation and Trust Boundaries

Downloads are limited to the matching Windows x64 installer from this repository's official GitHub Releases and the SHA256SUMS for the same version; HTTPS redirects are allowed only to GitHub's asset domains. The SHA is used for consistency checking and is not claimed to be an independent digital signature. The plugin's Ed25519 upgrade mechanism is unaffected.

The frontend cannot pass an installation URL, path, or arguments. After the native side verifies the private cache credentials, a newer stable version, the length, the directory, and the SHA, it stops its own background process and starts the hidden handover process; only after the handover confirms it is ready does it exit the app. The handover process waits for the old PID to exit, checks the SHA again, and installs and restarts using the `/S /R /UPDATE` arguments supported by Tauri NSIS. If starting the handover fails, it attempts to restore the background process; if installation fails, it records the error and attempts to reopen the original program.

The NSIS installer, which would overwrite the user's installation, was not actually executed, and no completed real-installer end-to-end verification is claimed. This item needs to be performed in an isolated installation environment for a subsequent desktop release.
