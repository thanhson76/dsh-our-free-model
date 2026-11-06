# Desktop Defect Investigation and Fix Plan

Goal: Fix the GitHub authorization, Star external link, and layout issues reported by the user; scan all pages and local interfaces of the standalone app; verify using isolated data; and preserve existing workspace changes and real accounts.

Architecture: Retain Tauri + the local Node service + the React management page. External HTTP(S) links are handed by the desktop native layer to the system browser; the management page remains a local origin. EAC uses the existing authorization and polling protocol. Layout fixes are implemented in the source code and the resources are rebuilt.

## Work Sequence

1. Run `node scripts/test-all.mjs --mode contributor` to establish a baseline; check the existing UI, desktop, and service startup test cases.
2. Reproduce the channel details auto-scrolling, content width shrinking, and external link failure, and record the causes.
3. Add targeted tests for external link handover, authorization initiation/cancellation/failure, data save failure, and page loading errors; verify the failures first, then implement the fixes.
4. Fix `packages/desktop/src-tauri/src/lib.rs` and the necessary native external-link units; fix `packages/standalone/frontend/components/channel-browser.tsx`, `frontend/app.tsx`, `frontend/app.css`, `frontend/channels.mjs`, and directly related server-side defects.
5. Run the standalone type check, build resource consistency, all offline tests, and Rust tests; actually launch the built desktop program, check the title bar, tray, and lifecycle, and use the same build resources to verify interaction page by page.
6. Build the Windows installer, and produce the verification record, evidence, and the boundaries for third-party real-account verification that is not covered.

## Verification Matrix

- The seven main pages and the four channel subpages; search/filter/switching; 13 channel details.
- Light and dark themes, 960×600 minimum window, 1280×800, and 1600×1000; no horizontal overflow, titles being covered, or abnormal auto-scrolling.
- GitHub authorization link and Star external link; authorization waiting, cancellation, errors, and re-initiation; account credentials remain on the server side.
- Settings validation, save/undo/persistence, pause/resume; secret show/hide/copy/rotation, login/exit boundaries.
- OpenAI Chat/Responses, streaming/non-streaming, model testing/cancellation, usage, channel RPC, backup interfaces, and local authentication.
- Desktop cold start, duplicate instances, hide/restore, window controls, exit cleanup, and the data directory lock.

Real GitHub identity authorization and each provider's verification codes/packages/quotas are affected by the external environment and accounts; steps for which real identity confirmation has not been completed must be recorded truthfully, and stub tests on this machine must not be used to claim that real authorization succeeded.
