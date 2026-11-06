# Desktop built-in update design

The user has confirmed the full flow: check the version, download and verify, quit to install and restart. The interface reuses the existing desktop cards, buttons and status prompts, and a new separate "App updates" section is added to the management area on the left.

## Flow and boundaries

Show the desktop's real version, the latest desktop version, the update notes, download progress, check time and error state. Only select the installer matching Windows x64 from this repository's official Releases, skipping plugin-only releases, drafts, pre-releases and lower versions. Checking and downloading run through the authenticated local management interface; installation and quitting are performed only by native IPC bound to the origin of the current management window, and browser access cannot install or close the desktop app.

Downloads are limited to official GitHub HTTPS sources and official asset redirects; the expected digest is read from the SHA256SUMS of the same release, the download is throttled in size and time, and after verification it is written atomically to a separate update cache. Before installation, the native code verifies the fixed cache file again and accepts no URL, path or command passed in from the front end. This follows the desktop's official GitHub Release trust model, with SHA256SUMS used for content-consistency verification; it is not claimed to be an independent digital signature, and the plugin's Ed25519 update trust chain is not changed.

After the user clicks "Quit and install", its own background service is stopped first, and then a hidden handover process waits for the old process to exit, runs the official NSIS installer and reopens the app using its restart parameters. If the native handover cannot start, the service is restored and an error is reported; a failed download or verification must not quit the app. User configuration, accounts and statistics are preserved.

The current official desktop artefact is Windows x64; other platforms show their support status and do not misuse the plugin package or another architecture. Existing desktop versions without the update section must first manually install a version containing that feature once. This task implements and verifies the feature; it does not automatically modify the already-published 2.7.2 plugin assets or publicly release a new desktop installer.

## Acceptance

Backend regression covers plugin-only Release skipping, version comparison, platform matching, verification failure, exceeding limits, redirects, repeated operations and cache recovery. The front end checks loading, no update, update found, download progress, verification failure, ready to install and browser restrictions, and captures actual screenshots reusing the existing styling. Verify the native window origin restriction, path and digest verification, service shutdown and install parameters; compile the Rust and the front end, run the applicable regressions, and do not run a real installer that would overwrite the user's existing installation.
