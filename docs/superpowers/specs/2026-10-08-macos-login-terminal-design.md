# macOS local token retrieval design

## Scope and assumptions

Add macOS support to the standalone service's local token retrieval entry point.
Reuse the Windows local recovery flow: open a visible terminal, read
`settings.json` from the current service's data directory, copy the `forwardKey`,
and have the user paste it back into the web page to sign in.
Assume the service runs on a local macOS machine with a graphical session, and that the Node used to install the service is still executable.
This applies to a single-user local service; the click requires no network access, and it does not change account data, management sessions or inference interfaces.
If automatic opening is unsupported on the system, the system automation authorization fails, or reading the configuration fails, the manual entry point is retained.

## Decisions

- Reuse the fixed local launcher; do not add a new unauthenticated API that returns the key.
- On macOS, use the system osascript to open Terminal, use the current Node executable to read the JSON,
  and pass the key to pbcopy via standard input; the key is never included in process arguments, terminal output or HTTP responses.
- The configuration path comes only from the server side; POSIX arguments are quoted one by one and then passed in via AppleScript argv.
  No browser-specified path, program or command is accepted.
- The server-side static page marks the system actually running, and the button and manual command switch accordingly,
  rather than relying on the browser User-Agent to guess the server-side system; Linux keeps manual retrieval.
- Keep the same-origin source restrictions, the concurrency limit and the 30-second cooldown after a successful open.
  Do not adopt alternatives such as "the backend copies directly with no visible window" or "let the page read the configuration file".

## Validation

Cover the original Windows flow, macOS launch arguments, escaping of special paths, empty/incorrect tokens and launch failure;
re-run the existing management-interface security tests and the standalone service suite.
Verify the desktop/narrow-screen sign-in page in the browser, and verify the actual macOS terminal and clipboard using an isolated acceptance directory.
The test suite never touches the user's clipboard or third-party accounts; on-device acceptance explicitly isolates and restores the clipboard.
