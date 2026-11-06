# Windows Desktop Investigation, Fixes, and Verification

Date: 2026-10-17. Source code: `dsh-our-free-model`. Version installed on this machine: 2.5.0. Original installation location: `D:\Our Free Modeldesktop`.

The reproducible defects in this round have been fixed, with offline regression, real Windows window operations, installer upgrades, and real upstream inference verification completed. Limited testing cannot prove that all environments, all accounts, and all future upstream responses will always be defect-free; the text below clearly distinguishes what was actually completed from steps not yet covered.

## Fixes

| Issue | Root cause and fix | Verification |
| --- | --- | --- |
| Clicking the desktop Star external link produced no response | Tauri only allowed local navigation and did not take over new windows; HTTP(S) external navigation and new windows are handed to the system default browser | Clicked Star in the real desktop app, and Edge opened `Ebony-Vinyl/dsh-our-free-model` |
| GitHub login did not automatically open the browser | The standalone EAC `start()` always returned `opened:false` and did not launch the browser | The session is registered first and then the system browser is called; the real desktop app opened the GitHub login page, and waiting and cancellation were both verified |
| The authorization waiting link was only text | The waiting panel was changed to a clickable link, so the user can still continue manually if the browser fails to open | EAC hook regression and the native waiting panel |
| Channel details were centered and shrunk, with uneven blank space | The light-theme vertical flex and `.page` automatic left/right margins overlapped, without constraining the full width | `.page` explicitly sets `width:100%` and `min-width:0`; screenshots of the installed app in light and dark themes |
| The page header was cut off after entering details | Auto-focusing the title caused scrolling, and the old scroll position from the bottom of the list was retained | Focus uses `preventScroll`; switching pages and entering details returns to the top; the real Qoder page |
| The details sidebar touched the edge, the title had an orange frame, and there was redundant spacing | Card and shared styles overwrote each other, and programmatic title focus was modified by the generic focus rule | Fixed the sidebar padding, title focus style, channel page spacing, and narrow-window layout |
| Switching pages lost settings drafts and model filters | The parent unmounted the entire page area with `page` as the key | Only visited settings/models/statistics pages are cached; inactive pages pause tasks, the cache is cleared on exit, and the connection secret page still unmounts |
| Quickly switching between account channels/EAC could leave stale content | Nested React roots reused the same container, and unmounting the old root raced with rendering the new root | Channel components use an independent key per type; lifecycle regression and real window switching |
| A 401 from an old request interfered with re-login | The 401 did not check the session generation, and an old loadData promise could also be reused/clear a new task | Session generation check, clearing old loading references, releasing only its own pending items, and prohibiting dispatching late events after a channel is cancelled |
| Account channels' `/v1/messages` could not be called | The Worker only read OpenAI/Responses request bodies and ignored the Anthropic-projected messages/tools/limits | The existing conversion functions were used to complete the harness request body; real adapter stub regression covers the system prompt, tools, output limits, and temperature |
| A streaming request error returned only a truncated HTTP 200 | After the stream headers had been sent, a dispatch exception could only take the top-level ending branch | Chat sends error + DONE, Responses sends response.failed; regression covers an unknown model |
| JSON `null`/arrays/scalars triggered an internal 500 | Fields were read directly after parsing | Non-objects return 400; Anthropic retains its own error structure |
| The Anthropic non-streaming error structure was incompatible | dispatch and body-reading errors used the OpenAI top-level format | Errors are returned in the Anthropic error format at the Messages entry point |
| `::1` local listening was rejected | Authority parsing required IPv6 brackets, inconsistent with the bare IPv6 supported by the listener | Bare `::1` is accepted, the loopback restriction is retained; trust/service regression |
| Windows test child process forced-exit assertion | After the local gateway shut down, forced exit raced with underlying handle cleanup | The gateway shutdown cleans up the sampler, and the test child process exits normally; the full test suite passed |

The new `open-external.mjs` has been added to the desktop and standalone service packaging manifests; external links only accept HTTP(S) without embedded credentials, and Windows launch arguments are passed as a single literal. The repository's pre-existing uncommitted changes were retained, and nothing was committed or pushed.

## Automated Checks

- `node scripts/test-all.mjs --mode contributor`: **54/54 suites passed**, re-run and passed on the final delivered source code.
- `npm run typecheck`: Passed.
- `npm --prefix packages/standalone run typecheck`: Passed.
- `node scripts/build-standalone-ui.mjs --check`: Passed, 10 local resources.
- `node scripts/build-standalone-channels.mjs --check`: Passed.
- `cargo test --offline --manifest-path packages/desktop/src-tauri/Cargo.toml`: 4 Rust unit tests passed.
- `node scripts/desktop-test.mjs`: 10/10, covering the built-in Node, paths with Chinese characters and spaces, port selection, one-time login, the data directory lock, parent process exit, crash recovery, and concurrent lock contention.
- `git diff --check`: Passed.

Vite outputs an ignore warning for lucide-react's `use client` directive, which does not affect the build. The Windows environment cannot create symbolic links, so the environment-related check in the release-preparation suite is skipped according to the original logic.

## Real Interaction With the Installed Program

The `ofm-desktop.exe` in the installation directory was operated via Windows UI Automation, using a standalone data directory, completing **40/40** checks:

- Overview, model manifest, usage statistics, account channels, EAC, API access, and service settings.
- 30-day statistics, empty model search, clearing filters, and retaining filters when switching pages.
- Editing settings, leaving/returning while retaining the draft, saving, and actual server-side settings persistence.
- Switching back and forth between light and dark themes.
- Switching through all 13 provider details one by one, channel usage, the request log, and the provider and backup subpages.
- API Key show/hide.
- Minimize/restore, hide to tray/restore.

There was also dedicated real-machine verification: Star opened the correct GitHub repository; GitHub login launched and reached the login page; cancelling the waiting panel restored the login button; after exiting the test program, the child Node exited and `service.lock` was cleaned up. Window attempts covered the normal size and the minimum supported size; the Windows display scaling was 125%, so the pixel size and CSS size were not the same.

Screenshots and machine records are saved in `.verify/desktop-20261017/`: `final-qoder-light.png`, `final-qoder-dark.png`, `installed-native-regression-results.json`, `contributor-tests.log`, `native-rust-tests.log`, `desktop-build.log`. The light and dark theme screenshots are the Qoder page of the actually installed version. The screenshot of the minimum window was affected by a parallel desktop session stealing focus, so that screenshot is not used as visual verification evidence; the minimum-window operation checks and UI element records are still usable.

## Real Upstream Inference

`mimo-v2.6-flash-free` was called from the installed service, using only the fixed public test sentence “Reply only with OK.”, without sending any user files or account content:

| Interface | Status | Answer | Time |
| --- | --- | --- | --- |
| `/v1/chat/completions` non-streaming | 200 | OK | 2908ms |
| `/v1/responses` streaming | 200, including a completion event | OK | 3455ms |
| `/v1/messages` non-streaming | 200 | OK | 9325ms |

Full results: `.verify/desktop-20261017/installed-live-api-results.json`.

## Build, Installation, and Data

The final `npm --prefix packages/desktop run build` successfully generated a Windows x64 NSIS installer, approximately 24.86 MiB:

`packages/desktop/src-tauri/target/release/bundle/nsis/Our Free Model_2.5.0_x64-setup.exe`

Installer SHA-256: `e4c0fddc20bf678f077d860710391021c734eff3f0082bfaad3508971bb0f38d`.

It was installed to the original directory `D:\Our Free Modeldesktop`, and the registry version is 2.5.0. 6 key program/resource items match this build. The Tauri installer changes the EXE's `TAURI_BUNDLE_TYPE_VAR_UNK` to `TAURI_BUNDLE_TYPE_VAR_NSS`; the verification explicitly allows only that 3-byte difference, and all other bytes are exactly identical.

Backup before the upgrade: `.verify/desktop-20261017/installed-2.4.0-backup/`. Before and after installation, SHA-256 comparisons were made for 3 existing JSON files in the real data directory, and all remained unchanged; the upgrade did not reset the user's API Key, accounts, or configuration. Test writes occurred only in the isolated data directory. After verification ended, the isolated instance was closed, and the app was restarted from the installation directory with the normal user data; the original workspace overview and v2.5.0 status displayed normally.

## Verification Boundaries

1. GitHub was verified up to the real login page, waiting, and cancellation; the user's password was not entered on their behalf, two-factor verification was not completed, and no real authorization was newly created. Full GitHub identity authorization/Star determination still requires the user to log in and confirm in person.
2. The pages, adapters, and local protocols of the 13 channels were covered by offline stubs and real-machine UI, but real accounts were not used vendor by vendor to complete SMS/scan-code/package quota/renewal/real charge verification.
3. The wording “kiro 上游自建池” in the user's first partial image could not be located in this repository's desktop frontend, 9router, or free-claude-code source code, so it cannot be claimed on that basis that that specific label issue has been fixed. What was actually fixed and verified in this round were the shrinking, scroll clipping, sidebar edge-touching, and cross-page state issues on the standalone desktop channel page.
4. No release signing, GitHub release, commit, or push was performed. The signature metadata for `test:release` belongs to the release process; this round used the contributor full code regression and standalone Windows installer verification.
