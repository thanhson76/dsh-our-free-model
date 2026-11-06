# Our Free Model · Local Service and Desktop Packaging Guide

## Product entry points

| Entry point | Purpose | Runtime dependencies for the user |
| --- | --- | --- |
| DSH plugin | Provides channels and the management panel inside DSH | DSH; install following the plugin installation instructions in the README |
| Standalone local service | Independent of DSH; managed through the browser and provides an API | Node.js 22.19+ or 24+ |
| Windows desktop shell | Starts the same standalone service, managed through a Tauri window | WebView2; the installer bundles Node, so no separate Node or Rust installation is needed |

The plugin and the standalone service each have their own entry point. The desktop shell is another way of starting the standalone service: it reuses the existing channels, management API and frontend, and does not merge the standalone service into the DSH plugin.

The current desktop code is for development and verification; building an installer is not the same as publishing a formal release.

## Standalone service

Run at the repository root:

```powershell
npm ci
npm --prefix packages/standalone ci
node scripts/build-standalone-ui.mjs
node packages/standalone/cli.mjs
```

Log in using the complete management link printed by the terminal. It tries port 18900 by default and picks another available port if that one is taken; do not hard-code the browser address. For the DSH plugin, use the installation flow in the README — copying just the three entry files is no substitute for the complete plugin package.

## Windows desktop build

The build machine needs:

- Windows with Node.js 22.19+ or 24+ for the matching architecture.
- The Rust Windows MSVC toolchain, plus the Visual Studio Build Tools C++ build tools and the Windows SDK. Use a toolchain that supports the current Cargo.lock; the rust-version in Cargo.toml is only this package's own declaration and does not represent the minimum version across all locked dependencies.
- On the first build, network access to download Cargo dependencies, the NSIS/WebView2 packaging components and the complete LICENSE for the current Node version.

Run at the repository root:

```powershell
npm ci
npm --prefix packages/standalone ci
node scripts/build-standalone-ui.mjs
npm --prefix packages/desktop ci --ignore-scripts
# Specify the installed MSVC toolchain, to avoid the default GNU toolchain, which lacks the linking tools.
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
npm --prefix packages/desktop run build
```

The toolchain name must match a version installed on this machine; you can also install one with `rustup toolchain install stable-x86_64-pc-windows-msvc`. For a development preview, use `npm --prefix packages/desktop run dev`.

The build hook runs `scripts/prepare-desktop.mjs`, which copies the current Node executable together with its complete licence, the backend core, the standalone service, the frontend, the channel modules and the WASM into a fixed generated directory. After changing frontend sources, run the frontend build command above first. In an offline environment, set `OFM_DESKTOP_NODE_LICENSE` to the path of the complete official LICENSE for the same Node version; a licence cache hit needs no further download.

Tauri installs resources explicitly into `service/` and `runtime/`. Copying only `ofm-desktop.exe` will not run on another computer — distribute and install the complete NSIS package. Users need WebView2; Tauri's default installation flow can guide them through installing a missing runtime, while offline machines need it prepared in advance.

Default artifact locations:

```text
packages/desktop/src-tauri/target/release/ofm-desktop.exe
packages/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe
```

`resources/`, the Node licence cache, `target/` and `dist/` are all generated artifacts and are not committed to Git. The final distribution directory can be tidied separately into `dist/`, with no need to change Tauri's default output directory.

## Startup, login and exit

- The desktop shell receives the backend handshake over its own stdout pipe, using the actual port and a one-time login entry point; it does not determine a service's identity by probing a fixed port.
- The default data directory is `.our-free-model` under the user's home directory, overridable with `OFM_HOME`. It does not overwrite existing configuration or migrate user data.
- If a standalone service is already running with the same data directory, an occupancy error is shown; it does not take over the other service or delete its lock — stop the original service first, or choose another directory.
- Closing the panel hides it to the tray; the tray menu's "Exit" item shuts down its own service normally and releases the lock. Exiting during startup also cleans up its own child processes.
- The install and uninstall hooks do not force-kill processes by port and do not delete accounts, configuration or data. Before upgrading or uninstalling, exit the program from the tray first.
- The custom title bar is compiled into the desktop program and uses the Tauri v2 API; window-operation permissions are granted only to this service's address and the main window.

## Verification

```powershell
node scripts/desktop-test.mjs
node scripts/test-all.mjs --mode contributor
node scripts/build-standalone-ui.mjs --check
npm run typecheck
npm run typecheck:standalone
cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml
```

The desktop regression tests use a copied Node with an empty PATH in a temporary installation directory whose path contains spaces and Chinese characters, verifying resource integrity, port conflicts, login sessions, data-lock isolation, a normal exit and the closing of the parent process's pipe. External channel requests are handled by test doubles and do not consume real account quota.

These checks are no substitute for complete NSIS installation acceptance testing. Before an external release, also install on a Windows machine with no system Node and a fresh user data directory, and check WebView2, the window buttons, tray exit, restart and uninstall; keep the actual screenshots and results.

## Rollback

Exit the desktop program from the tray first, then install a verified older complete installer; the user data directory is kept. You can also go back to using the standalone service CLI. Do not delete a data lock or force-kill an unknown process to roll back — first confirm the original service has stopped.
