# Issue #196: Proxy Fix for the Gemini and Cline Channels

## Baseline and reproduction

The baseline is mainline `84ab66398c3b8b6aeb7595a8b7ce38a7a5bc9cbf`. The problem was that after the browser completed Google authorization through the system proxy, the channel pack still connected directly to the token endpoint with Node's global fetch; the plugin's original egress covered only the anonymous channels and was not passed to GeminiAuth.

Using `scripts/channel-network-test.mjs --pack .verify/issue196-before-pack.mjs --oauth-only` to load the baseline release pack, a real OAuth callback was received on the local machine. The request stand-in required the token-exchange request to carry a dispatcher and threw `UND_ERR_CONNECT_TIMEOUT` when it did not. The baseline result was `done: true, success: false, error: fetch failed`, matching the failure path in the issue report. This was an isolated reproduction; no real Google account was operated and no real network geographic restriction was simulated.

## Fix design and scope

A separate channel egress wrapper is used for each mount; the global fetch and global Dispatcher are not modified. Route priority is: the egress the plugin is running, the environment proxy, the Windows manually configured system proxy, then a direct connection; the plugin passes the egress capability explicitly into the channel pack, and the standalone service uses the environment and system proxy capabilities of the same generated business pack.

Gemini's login, renewal, userinfo, project probing and inference all inject the same wrapper; Cline's login, renewal, model catalog and inference are connected in the same way. The business of the other channels keeps its original implementation; this round does not claim to have unified the network calls of all thirteen channels.

Environment proxies support HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and their lowercase forms, and honour NO_PROXY; Windows reads ProxyEnable, ProxyServer and ProxyOverride, supporting per-protocol configuration, wildcards and <local>, cached for at most 30 seconds. Loopback requests are not proxied automatically, and PAC is not executed. The existing HTTP(S)/SOCKS5 proxy constructors are used, together with undici's official Dispatcher1Wrapper to be compatible with the handler contract of Node 22/24's built-in fetch. Proxy instances are released with the mount and do not change the per-account proxy cache.

Error text shows only the route type and the underlying error code; it does not splice in proxy URLs, passwords or OAuth codes. Network errors keep their original cause; TLS's CERT_HAS_EXPIRED is no longer mistaken by Gemini's expired-text criterion for a refresh_token invalidation. There is no automatic fallback to a direct connection after a proxy failure.

## Actual verification

- `node scripts/channel-network-test.mjs`: 6/6 items passed, including system proxy parsing, exceptions, proxy priority, parameter passing, caching, cancellation, error codes and redaction, proxy release, and real local HTTP proxy forwarding.
- The same dedicated test loaded the actual plugin pack and the standalone service's generated business pack respectively, actually listened for a local OAuth callback and called the real RPC and credential services; the stand-ins for token, identity, renewal, project probing and Gemini inference requests all required the proxy to be carried. Cline device-code authorization and renewal also verified proxy injection.
- The regression check for TLS expiry errors confirmed that credentials are not deleted and are not misjudged as a refresh_token expiry.
- `node scripts/test-all.mjs --mode contributor`: 34/34 suites passed.
- `node scripts/channel-pack-test.mjs`: passed; the existing checks for the thirteen channels, login-failure polling, balances, image budgets and anonymous model requests still passed.
- `npm run typecheck`, `npm run typecheck:standalone`: passed; these two existing configurations check their respective declared scopes and do not mean the whole vendor TypeScript source has passed type checking.
- `node scripts/build-channel-pack.mjs`, `node scripts/build-standalone-channels.mjs`: succeeded; `node scripts/build-standalone-channels.mjs --check`: passed.
- `node --check scripts/channel-network-test.mjs`, `node --check index.js`, `git diff --check`: passed.
- `node scripts/test-all.mjs --mode release`: 0/3 suites passed; manifest, release and catalog all failed because the size or digest of `index.js` and the channel-pack artifacts did not match the existing manifest. The existing manifest and signatures are retained, for the maintainer to update and re-sign before release.

## Unverified items and release boundaries

No real Google or Cline account was used to walk through authorization manually, and Google's other restrictions on OAuth clients were not verified. The network stand-ins verified proxy selection and the authorization state machine, and the local HTTP proxy verified actual socket forwarding; that is not the same as having verified all third-party proxy software, real Google HTTPS endpoints or PAC. An authorization timeout caused by a callback not arriving is not a network path this fix has already solved.

No application UI changes. No release was published, no trust public key was changed and no signature was generated; before release, the maintainer must update the manifest, catalog revision and signatures. Upgrading requires no data migration; rolling back this commit and rebuilding the channel artifacts is sufficient.
