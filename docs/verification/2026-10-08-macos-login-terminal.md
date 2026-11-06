# macOS Login Token Entry Acceptance

## Actual Changes

macOS now uses a visible Terminal to read the `settings.json` in the current service's actual data directory, and passes `forwardKey` via stdin to the system pbcopy. Windows retains the PowerShell flow.
The page adjusts the button, manual retrieval command, and copy shortcut hint based on the system marked by the server.
Linux disables the auto-open button and retains the manual entry.

Source validation, empty JSON request body handling, concurrency limits, the 30-second cooldown, and management authentication remain unchanged.
Opening the window only returns `{ ok: true }`, does not return the key, and does not establish a management session.
No migration of settings or account data is required.

## Actual Verification

- `node --check packages/standalone/web/app.js`: Passed.
- `node --check scripts/standalone-login-ui-test.mjs`: Passed.
- `npm run test:standalone`: 20/20 passed.
- `npm run test:contributor`: 32/32 suites passed; management-specific tests 15/15 passed.
- `npm run test:release`: 3/3 suites passed.
  This is verification of the existing plugin's release records and does not indicate that a release install package has been produced for the standalone service.
- `npm exec --yes --package=typescript@5.9.2 -- tsc --noEmit -p tsconfig.json`:
  Passed; TypeScript from a temporary cache was used to check the original adapter boundaries, without modifying dependencies or the lockfile.
- `git diff --check`: Passed.
- Real shell argument tests cover Chinese, spaces, single/double quotes, newlines, `$HOME`, and command substitution characters;
  Windows startup arguments were verified via a stub and EncodedCommand decoding.
- Isolated-directory macOS real-machine verification: after clicking the button in the browser it returned 200, actually created a new visible Terminal,
  the clipboard matched the isolated acceptance token; the terminal showed that copying succeeded without showing the token;
  clicking again showed the cooldown notice, and unauthenticated reading of `/key` still returned 401.
- Browser checks at three viewports, 1280×900, 390×844, and 320×740: no horizontal overflow,
  all login controls are within the viewport; the manual command copy value is consistent, and the page has no JavaScript errors.
  After the real-machine test, the test window was closed and the original text clipboard was restored.

When actually running `node scripts/standalone-login-ui-test.mjs`, the locally installed Playwright, Google Chrome, and screenshot directory were specified via environment variables, and real-machine Terminal acceptance was enabled.
Personal machine paths are not committed to the repository; placeholder paths are used below to show how to reproduce:

```sh
OFM_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
OFM_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
OFM_VERIFY_MAC_TERMINAL=1 \
OFM_UI_SCREENSHOT_DIR=docs/verification/images \
node scripts/standalone-login-ui-test.mjs
```

By default, without `OFM_VERIFY_MAC_TERMINAL` set, a stub launcher is used and the local Terminal is not operated.
Windows real-machine, Linux real-machine, and the actual dialog when the system denies automation authorization were not verified.
When automation permission is denied, the manual retrieval instructions are still retained and system permissions are not bypassed.

## Screenshots

![macOS desktop login page](images/macos-login-desktop.png)

![macOS 320px login page](images/macos-login-narrow.png)
