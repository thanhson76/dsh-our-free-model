# Our Free Model standalone local service

This is the source entry point of the standalone product. It needs no DSH, Cordis, DSH profile or host credential store.
A standalone HTTP service, web management, EAC and the ten account channels are provided; standalone installation artifacts have not been released yet.
At this stage it runs from the full repository; you cannot yet copy just this directory or install it on its own as an npm package.

## Starting

You need a Node.js version satisfying the repository's `engines` requirement. From the repository root, run:

```powershell
npm run start:standalone
```

You can also specify the port and data directory:

```powershell
npm run start:standalone -- --port 18900 --data-dir F:\ofm-data
```

Startup prints the management page's one-time login link, the actual API address and the location of the key file; it does not print the API Key.
Open the management link in a browser to use the console. The link is valid for 10 minutes and can be redeemed only once.
The default port is `18900`;
when the port is taken, the shared listener's automatic port-selection logic applies. Later starts prefer the port this product saved last time;
`--port` can override it, and `0` means the system assigns one.

## Data and authentication

- Default directory: `~/.our-free-model`; the `OFM_HOME` environment variable or `--data-dir` can override it.
- It does not read `DSH_HOME` and does not import DSH configuration or credentials.
- Account credentials are stored in `channel-credentials.json`; the account pool, credits and ledger live in `channel-pack/`;
  the EAC authorization is stored in `eac-user.json`. All of these belong to the current standalone data directory.
- The first start does not automatically migrate plugin accounts. To migrate, export an account backup in the plugin, then import it manually in the standalone web UI under
  "Free account channels → Providers and backup". The backup contains plaintext credentials; keep it safe.
- The API Key is generated separately for this product and stored in the `forwardKey` field of that directory's `settings.json`.
- `GET /health` provides product status without credentials; the inference endpoints and the model list require `Authorization: Bearer <API Key>`.
- Only one local service instance can run per data directory. A normal exit removes `service.lock`.
- If the lock is still present after an abnormal exit, first check the PID recorded in the lock file, confirm the old process has stopped, and only then remove the lock file.
- The management page and management API listen on loopback addresses only; LAN inference requires explicitly enabling the separate relay.

The plugin still uses `DSH_HOME/our-free-model` or `~/.dsh/our-free-model`; the two do not affect each other by default.
Do not deliberately point the standalone service's `OFM_HOME` at the plugin's data directory.

## LAN inference

It is off by default on first start. Set it in the local management API, or enable and save it explicitly through the CLI:

```powershell
npm run start:standalone -- --lan --lan-port 18901
npm run start:standalone -- --no-lan
```

Using `--lan-port` on its own only saves the port and does not enable the relay. When the flags are omitted, the saved settings are kept.
The relay listens on `0.0.0.0` and forwards only the model list and the Chat Completions, Responses, Messages and
Messages count_tokens inference paths (in both `/v1`-prefixed and unprefixed forms).
Streaming responses and cancellation reuse the local inference implementation. `/`, `/health`, page assets and all management paths are not forwarded;
OPTIONS returns only a CORS preflight response and no management data.

LAN clients use a LAN Key generated separately by the local management API; they cannot use or request the local `forwardKey`.
The LAN Key is stored in the `standaloneLanKey` field of the current standalone directory's `settings.json`;
disabling the relay, a normal exit and restarts all keep that key. Rotating the LAN Key invalidates the old LAN Key immediately,
while the local API Key and management sessions stay usable. After rotating the local API Key, the relay automatically uses the new local key.
Give the LAN Key only to trusted clients, and restrict access sources through a firewall when needed.

The local management API uses an existing session or the local Bearer Key. Its contract is:

| Endpoint | Request or response |
| --- | --- |
| `POST /api/management/settings` | Accepts `standaloneLanEnabled` (boolean) and `standaloneLanPort` (integer from 0 to 65535); returns `settings` and `lan` |
| `GET /api/management/summary` | `settings` contains the settings above; `lan` contains the running state, without keys |
| `GET /api/management/lan/key` | `{key}`; an empty string when none has been generated yet |
| `POST /api/management/lan/key/rotate` | The request must be exactly `{confirm:true}`; returns the new `{key}` |

The `lan` fields are `{enabled,running,host,requestedPort,port,addresses,baseUrls,error}`.
`enabled` expresses the saved LAN intent; when the master service switch is off it can be true while `running` is false.
`requestedPort` is the desired port, where 0 means one is assigned automatically on each start; the actual port appears only in `port`,
is never written back over the desired port, and is null when stopped. When a fixed port is taken, the setting is kept,
`running:false` is reported and `error` gives the failure code; after the port is freed, reapplying the settings retries.
Turning off the master service switch or the LAN switch stops the relay and releases the port immediately; a normal exit also releases the port.
`baseUrls` are the detected local network-interface IPv4 addresses plus the actual port; after switching networks, reading the summary again refreshes them.
Unknown fields, custom listen hosts, target addresses and keys submitted by clients are not accepted.

This only resolves the LAN inference access of issue #351. The Docker / FPK / NAS
remote-management deployment of issue #216 is still not implemented: the management listener and the Host trust fence are still limited to loopback, and
`--host`, `OFM_ALLOW_NON_LOOPBACK` or `OFM_TRUSTED_HOSTS` are not supported for widening management access.
Mapping the relay port from a container lets already-configured inference clients connect, but the management page cannot be opened from the LAN that way,
and no container image, FPK package or in-container account OAuth login adaptation is provided either.

## Current endpoints and channels

- `GET /v1/models`
- `POST /v1/chat/completions`, including streaming and non-streaming requests
- `POST /v1/responses`, including streaming and non-streaming requests
- Anonymous free models and Kilo free models
- EAC's original GitHub authorization, signed requests and resource pool; the standalone application uses its own authorization file
- LobsterAI,
  Qoder, Qoder (China edition), TRAE, Cline, Loomy, Raccoon, MiniMax Code, ZCode, Gemini
- The original channels' login, account pool and rotation, renewal, model toggles, daily check-in, credit locking, ledger and backup
- Local model cache, usage statistics, periodic refresh, request cancellation and exit cleanup
- `GET /`: the standalone Chinese web console
- `/api/management/*`: same-origin management endpoints, authenticated with a management session or the API Key

Startup binds the listener first, then refreshes the model roster asynchronously. The first run sends no availability probe requests by default;
`--probe` enables and saves the automatic probing setting, later starts keep it, and it can be turned off in the web settings.
When the upstream is unreachable the cache is kept; `--no-refresh` skips the core's startup refresh and periodic tasks,
while manual refresh, probing and inference remain available. The account channels' directory initialization, login polling, renewal and automatic check-in follow the channels' own rules;
`--no-refresh` does not turn those tasks off, and automatic check-in can be disabled on the channel page.
Automatic probing obeys the core backoff on rate limiting; a page-initiated probe forces a recheck and produces inference requests.

The standalone account channels are isolated per-instance in Workers and serve
`provider/model` model IDs through the same service port and API Key. Startup mounts HTTP first; the account roster loads in the background without waiting for every provider's network responses.
EAC is authorized on the standalone page itself; it does not use DSH's EAC token. The original plugin's host check stays as it was.
Plugin hot reload, self-update and host Agent auto-resume are not mounted on the standalone entry point.

## Web management

The standalone side has updated overview, channel management, model list, usage statistics, service settings and shared navigation;
API access and login keep their existing control logic. All assets are served by the local service;
channels, models, usage statistics and service settings load on demand and do not depend on a CDN. For visual and size records, see
[`Phase 1 verification`](../../docs/verification/2026-10-09-standalone-ui-phase1.md),
[`model list verification`](../../docs/verification/2026-10-09-standalone-model-browser.md),
[`usage statistics verification`](../../docs/verification/2026-10-09-standalone-usage-dashboard.md) and
[`service settings verification`](../../docs/verification/2026-10-09-standalone-settings-page.md).

After changing the frontend, run the following from the repository root:

```powershell
npm ci --prefix packages/standalone --ignore-scripts
npm run typecheck:standalone
npm run build:standalone-ui
node scripts/build-standalone-ui.mjs --check
```

`frontend/` is the source and `web/` is the committed build output. The service loads these assets at startup;
after rebuilding you need to restart the service. The dev tools are used only for building and are not exposed as web assets.

The models page uses TanStack Virtual to mount entries by visible region, with support for dynamic row heights and wrapping of long IDs.
After focusing the scroll region, Home/End reach the first/last entries; when a copy or test button has focus, its entry is kept.
Search and filters change only the current view, persist across refreshes and page switches, and are cleared when leaving management.
A single-model test can be cancelled; switching pages or leaving cancels the test request. Refresh and probing are shared server-side tasks;
leaving the page cancels the frontend wait and does not promise to stop the server's whole refresh task.

- **Overview**: inference status, access addresses, model count, Token usage over the last 7 days and local service information.
- **Model list**: name/ID search, combined channel/capability/status/visibility filters, copying a model ID,
  refreshing the roster, active probing, and cancellable single-model tests with result display.
- **Usage statistics**: accumulated user turns, physical requests, input/output Tokens, failed and recovered turns,
  trends over the last 7/14/30 local calendar days (14 days by default), and per-model search, sorting and statistics paged 20 per page.
  Historical estimates are clearly labelled, unknown performance values show "—"; reading and refreshing statistics sends no inference requests.
- **Free account channels**: the ten channel cards, login and account management; channel usage, request log,
  provider enable/disable, permanent credit locking, nicknames, account priority, rate-limit resets and backup import/export.
- **EAC co-paid channel**: GitHub authorization, status, cancel, logout and the resource pool. The user opens and completes the authorization page.
- **Service settings**: pause or resume inference, region models, stream recovery, output cap, refresh interval and automatic probing.
- **API access**: copy addresses, actively show or hide keys, copy call examples, and rotate keys after confirmation.

The login link's temporary credential lives in the URL fragment and is removed after the page redeems it. The browser uses an 8-hour
HttpOnly, SameSite=Strict management Cookie; restarting the service or logging out of management clears the session.
When a link has been used or has expired, you can log in with the `forwardKey` in `settings.json`.
The login page provides a local token-retrieval entry point: on Windows it opens PowerShell, on macOS the system Terminal,
reads the key from the current service's actual data directory, copies it to the clipboard, and you paste it back into the page to log in.
This operation accepts only same-origin requests from the local page, performs only the fixed action, accepts no command or path supplied by the web page,
and never returns the key to an unauthenticated web page. After each successful opening it cannot be opened again for 30 seconds.
If opening fails, expand "Manual retrieval and other systems", copy the token-retrieval command for the current system's default directory,
or read the `forwardKey` directly from the config file; for a custom directory, the startup arguments prevail.
On macOS, the first opening may require allowing the local service to control Terminal. Linux uses the manual instructions
or the one-time login link printed at service startup; Windows and macOS keep these fallback entry points too.
Rotating the key immediately invalidates the old key and the other management sessions; the current management session is kept, and clients must update their configuration.
The inference endpoints still require a Bearer API Key; the management Cookie cannot be used for inference. After inference is paused, the management page remains accessible.

The page updates its status every 15 seconds; reading status sends no inference requests. Active probing and model tests consume upstream quota;
model tests are limited to 64 output Tokens and a 60-second timeout, and real usage is counted in the statistics.
Statistics store usage and performance, not prompts or answers; inference content is still sent to the model upstream, and
prompts sent to the Kilo free pool may be recorded by the upstream — do not send sensitive content.

Service settings have an unsaved-changes notice, numeric range validation and undo. Background polling and page switches do not overwrite an editing draft;
the draft is cleared when leaving management; undo restores the most recently synced saved value. Repeated submission is blocked while saving is in progress;
on failure the input is kept, and on success the server's returned values prevail. The automatic probing switch still controls the original periodic tasks;
when started with `--no-refresh`, saving settings does not restore the automatic tasks.

## Gemini and Cline network connections

These two channels' login, renewal and model requests read `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`; with no environment proxy, Windows automatically reads the current user's manual system proxy. Environment proxies honour `NO_PROXY`, system proxies honour `ProxyOverride`, and loopback requests do not automatically use a proxy. There is no need to set `NODE_USE_ENV_PROXY`.

The Windows manual proxy configuration is cached for at most 30 seconds; PAC automatic configuration scripts are not supported. The standalone service does not yet provide the plugin's subscription egress feature; using an environment proxy or the manual system proxy is enough. Gemini needs access to Google's authorization, token, identity and Code Assist endpoints; a successful browser authorization does not mean the background connection succeeded, and network errors display the connection path and the underlying error code.

## Verification

```powershell
npm run test:standalone
npm run test:management
npm run test:standalone-channels
node scripts/channel-network-test.mjs
node scripts/standalone-lan-test.mjs
npm run test:contributor
```

The standalone service's dedicated tests use only local HTTP stand-ins and never access a real upstream. The tests cover standalone data and keys,
the two API protocols, streaming responses, caching, concurrent refresh, exit cleanup and process-level DSH dependency isolation.
The management tests cover sessions, same-origin protection, settings validation and persistence, resume after pausing, model operations,
key rotation, restart and automatic refresh scheduling; browser verification uses a standalone data directory and a local upstream stand-in.
The channel tests run the real adapters and the original authorization logic with networking redirected to local stand-ins, covering multi-instance isolation,
tools and images, Chat/Responses, credit locking, backup, usage, cancellation and exit. Real external account logins were not verified provider by provider.

A verification process loaded with a local stand-in is marked `networkMode: fixture` in the management summary, and the web UI shows a prominent test notice.
A stand-in process cannot be used for real account login; for actual use, start the standalone service with the commands above,
and use a proper standalone data directory, so test accounts and simulated quotas are not mistaken for real data.

## Regenerating the channel artifacts

Running the service needs no React or esbuild installation; the repository contains the generated local scripts and styles. After changing the generator or shared pages, run:

```powershell
npm ci --prefix packages/standalone --ignore-scripts
npm run build:standalone-channels
npm run build:standalone-ui
node scripts/build-standalone-channels.mjs --check
node scripts/build-standalone-ui.mjs --check
```

The generator only replaces the platform hosting and page wiring; it does not modify the original plugin's `client.js` or the channel pack.
The original channels' WASM and shared core still come from the full repository; copying this directory alone cannot run.
