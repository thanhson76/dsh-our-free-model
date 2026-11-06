# Acceptance of the Local Token-Retrieval Entry on the Standalone Service Login Page

## Requirement and implementation

An “Open PowerShell to get the token” button was added to the login page. The Windows local service opens a visible window,
reads `settings.json` in the current service's actual data directory, copies `forwardKey` to the clipboard,
and the user returns to the web page and pastes it to log in. Custom data directories and paths containing spaces, Chinese characters and single quotes are supported.

The page also provides the configuration file location, a button to copy the PowerShell command for the default directory, and manual instructions for macOS / Linux.
Automatic launching is supported on Windows only; other systems use the instructions or the one-time administration link shown at startup.

## Boundaries

- Before login, only a local page may POST with a same-origin Origin and `Sec-Fetch-Site: same-origin`.
- The request body must be an empty JSON object; it cannot specify a command, program or file path.
- The original administration data and inference interfaces still require credentials; opening the window does not create an administration session.
- After a successful request, only `{ ok: true }` is returned; no key is returned to a web page that is not logged in.
- Concurrent opens, and repeated clicks within 30 seconds of a successful open, are both rejected; a failed launch can be retried.
- The hidden launcher process only opens the user-visible PowerShell; the token operations are performed inside that window.

## Actual verification

- `node --check packages/standalone/login-terminal.mjs`: passed.
- `node --check packages/standalone/web/app.js`: passed.
- `npm run test:management`: 14/14 passed.
  New dedicated coverage for cross-site/no-origin calls, arbitrary command or path parameters, launch failure, concurrent opens,
  the cooldown period, same-origin localhost aliases, return values containing no key, and opening the window not granting an administration session.
- `npm run test:contributor`: 32/32 suites passed, including 11/11 channel-specific tests.
- `npm run test:release`: 3/3 suites passed.
- In the browser, clicking the real launch button on the acceptance service in an isolated directory detected a visible window
  `Our Free Model - 获取登录令牌`, and the clipboard matched the isolated acceptance token.
  That directory contained Chinese characters, spaces and a single quote, and the read actually succeeded.
- After clicking the fallback copy-command button, the system clipboard matched the page command exactly.
- `git diff --check`: passed.

The isolated acceptance used no user account or third-party authorization. No real macOS / Linux machine was accepted,
and automatically opening PowerShell on those systems is outside the scope of support in this round.

![Automatic retrieval and manual instructions on the login page](images/standalone-login-terminal.png)
