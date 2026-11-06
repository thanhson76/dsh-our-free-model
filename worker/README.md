# EAC Gateway (Cloudflare Worker) Deployment and Rotation

The Worker is the **sole holder of secrets** for the co-paid channel: what is sealed into the plugin is only this gateway's address and a signing secret, while the relay's real key exists only in the Worker's environment variables. Reverse-engineering the plugin yields only an indirect entry point that can be revoked at any time.

```
Plugin (signed request, no key) → Worker (verify signature / allowlist / rate limit, inject real key) → Relay
```

## Signing contract (implemented and locked by worker.js)

```
x-ofm-timestamp: <unix milliseconds>
x-ofm-signature: hex(HMAC-SHA256(secret, "<ts>\n<METHOD>\n<path>\n<hex(sha256(body))>"))
```

- A timestamp deviating by more than `CLOCK_SKEW_SECONDS` (default 600s) is rejected (replay protection);
- Signatures are compared in constant time; a match against any entry in `SIGNING_SECRETS` passes (old and new coexist during rotation);
- Only `GET /v1/models` and `POST /v1/chat/completions` are allowed; everything else is 404;
- Models outside the `MODELS` allowlist get 403; a request body over `MAX_BODY_BYTES` gets 413;
- Optional `RATE_LIMITER` binding for per-IP rate limiting.

## Admin dashboard and rate limiting (self-hosted gateway only)

The gateway of a self-hosted deployment (Method 0) ships with three layers of built-in abuse prevention, all configured in `.env`:

- `CONCURRENCY_PER_IP=5` — per-IP concurrency cap (counts only chat forwarding; over the limit is 429). Default 5: one LLM stream holds an upstream connection for tens of seconds to minutes, a free relay cannot withstand heavy users hammering concurrency to the top, and the old default of 20 let a single IP fill the upstream connection pool and drag down the whole machine (the incident where even the panel could not be logged into was exactly this);
- `RATE_LIMIT_PER_MINUTE=60` / `RATE_LIMIT_PER_DAY=1000` — per-IP rate and daily quota;
- `POOL_PRESSURE_BUSY=30` / `POOL_PRESSURE_OVER=80` — load-verdict thresholds for global in-flight concurrency (0 = off): the snapshot uses them to report "busy / overloaded" to the account-pool panel on the plugin settings page, and a mean event-loop delay of ≥100ms / ≥300ms also forces the verdict up. Tune to your server's actual capacity;
- `ADMIN_TOKEN=<random string>` — admin dashboard token. Once set, open `https://<gateway domain>/eac/stats?t=<ADMIN_TOKEN>` in a browser: request heatmap (weekday × hour), 72-hour request curve, fan charts of token consumption by IP and by model, and a per-IP detail table (request count, rate, tokens, refusals, concurrency peak). The dashboard auto-refreshes every 30 seconds, statistics are persisted to `stats.json` (survive restarts), and IPs are stored as salted hashes, non-reversible.

**SSE prelude** (`SSE_PRELUDE_SECONDS=15`, 0 = off) is on by default: as soon as a chat turn passes signature verification, it returns 200 + `text/event-stream` headers + a `: keepalive` comment frame, then feeds the real frames once the upstream produces tokens. This is for Cloudflare (~100-second origin timeout, not adjustable on the free plan) and nginx (60-second default read timeout) — reasoning models often take 30–140 seconds to the first token, and without a prelude the middle layers cut them off into 504/524 HTML error pages. An upstream refusal that arrives after the prelude (e.g. a relay 5xx) is delivered as an in-stream `data: {"error":…}` frame, and the plugin classifies it with the same error-envelope logic; gateway logs and the dashboard still record the real upstream status code.

The New API panel itself does not account by IP; these views are provided by the gateway. Cloudflare deployments (Method 1) have no in-process state, so these three layers are available only in the self-hosted form.

## GitHub authorization gate (self-hosted form)

The gate answers "who may use EAC", not "did this request come from this plugin". Anyone can reverse-engineer the signing secret sealed into the plugin, so the only gate that counts per person has to sit at the gateway — which is also the only place holding the relay key.

```
Plugin (signature + x-ofm-user token) → Gateway (verify signature + verify token + verify star) → Relay
```

- Only `POST /v1/chat/completions` requires a token; `GET /v1/models` is not blocked, so the plugin can list the EAC models before sign-in (and show the lock marker).
- Tokens are issued by the gateway after GitHub sign-in is completed in the browser and **the repository has been starred** (32 random bytes; the server stores only SHA-256); the plugin claims the token automatically, with no copy-paste anywhere.
- The star is decided by `GET /user/starred/<REQUIRE_STAR_REPO>`: 204 = starred, 404 = not starred. A sign-in without a star keeps a "recheck" ticket (30 minutes); after starring, the user clicks once and does not need to sign in again.
- **Periodic recheck**: every `STAR_RECHECK_HOURS` (default 12) hours the saved GitHub authorization rechecks once; removing the star revokes the token. A GitHub-side network failure / rate limit (5xx, 403, timeout) keeps the existing verdict and never harms an already-authorized user; a GitHub 401 (the user revoked the app authorization) is treated as invalid and requires signing in again.
- **Per-account rate limiting**: `TOKEN_RATE_LIMIT_PER_MINUTE` / `TOKEN_RATE_LIMIT_PER_DAY` / `TOKEN_CONCURRENCY_PER_USER` each default to the same-named per-IP value — a shared token cannot bypass the quota by changing IP.
- User table `users.json` (0600, in the same directory as `stats.json`): GitHub id / login / token hash / star verdict; the GitHub authorization is stored AES-256-GCM-encrypted (key `USER_STORE_KEY`, falling back to the first signing secret when unset) and used only for star rechecks. Deleting this file revokes all tokens (users must sign in again).
- Environment variables:

  ```ini
  GITHUB_CLIENT_ID=<the OAuth App's Client ID>
  GITHUB_CLIENT_SECRET=<the OAuth App's Client Secret>
  REQUIRE_STAR_REPO=Ebony-Vinyl/dsh-our-free-model
  REQUIRE_USER_TOKEN=0        # 0=compatibility window (record only, do not refuse); 1=chat must carry a valid token
  STAR_RECHECK_HOURS=12
  PUBLIC_ORIGIN=https://<gateway domain>   # used to build the OAuth callback URL; empty = derive from request headers
  USER_STORE_KEY=<random string of 32+ bytes, e.g. openssl rand -base64 32>
  ```

- **GitHub OAuth App** (create with the repository owner account, 1 minute): GitHub → Settings → Developer settings → OAuth Apps → New OAuth App; set the Homepage URL to the repository address; **the Authorization callback URL must be exactly `https://<gateway domain>/eac/auth/github/callback`**; after creating it, copy the Client ID and generate a Client Secret, and put them only into the server's `.env` (600 permissions), never into the repository or the plugin. Request only the single `read:user` scope.
- **Rollout order**: first deploy with `REQUIRE_USER_TOKEN=0` (old plugin versions keep working) → release the plugin version with the sign-in entry → announce → change `REQUIRE_USER_TOKEN` to `1` and restart the gateway. That is the entire cutover; rollback is the same in reverse (change back to 0).
- The gateway ships an authorization page (`{mount}/auth/github/start|callback|recheck`) and JSON endpoints for the plugin (`{mount}/auth/poll`, `{mount}/auth/status`, `{mount}/auth/logout`, `{mount}/auth/ack`), all mounted under `{mount}/auth/*`; the existing nginx `/eac/` reverse proxy passes them through directly, **no nginx change needed**. If the site WAF blocks them, just allow `/eac/auth/*` in that site's URL allowlist.
- **GitHub egress goes through `node:https`, not the global fetch** — measured on the locally deployed server, undici (the global fetch) gets `UND_ERR_CONNECT_TIMEOUT` for every GitHub call, while `node:https` on the same machine answers in milliseconds (403/404 are both genuine GitHub replies). The `nodeFetch` in `auth-github.mjs` exists for this reason; moving servers needs no configuration change, and the offline suite uses injected stubs and is unaffected.
- The `auth` field of the dashboard's `/stats-data` reports the authorized / known / pending-claim counts and the enforcement switch state.

The new plugin claims via `/auth/poll?link=...&retain=1`, and after confirming the token is saved locally, calls `POST /auth/ack?link=...` with `x-ofm-user`. The gateway keeps the token for at most 15 minutes before confirmation, so a lost response can be claimed again; old plugins keep claiming idempotently, and new plugins are also compatible with gateways without ACK. Pending tokens are stored encrypted in users.json following the upstream implementation, so they remain claimable after a restart under the same store and key; old gateways that claim once and do not persist cannot guarantee re-claiming. Avoid upgrading during an active authorization session, and keep the single-instance configuration below.

## ⚠️ Single instance only (cluster / instances>1 breaks outright)

The gateway is a **single-process stateful** service: the issued user-token index, the per-IP / per-account rate-limit and concurrency counters, and the dashboard statistics all live in process memory; the user table and pending login links land in `users.json`
(0600; pending tokens are likewise encrypted on disk — a restart no longer swallows a completed login waiting to be claimed).
If started in **PM2 cluster mode or with multiple instances** (`instances: 2`), connections are round-robined to multiple
processes each holding its own memory, and the symptoms are:

- `authorized` on `/eac/auth/status` flips between true/false — even though the user signed in successfully;
- Newly signed-in tokens work intermittently; rate limits and concurrency caps effectively double; dashboard numbers do not add up.

**The correct posture** (the factory values in `pm2_configs/eac-gateway.config.js`):
`exec_mode: "fork"`, `instances: "1"`, and **`watch: false`** — the gateway writes
`stats.json` into its own directory every 30 seconds, so leaving watch on makes it restart itself endlessly.

A single process is enough: one SSE stream is just a few idle sockets, and a few thousand concurrent streams are within one event loop's ability.
To raise capacity, tune `POOL_SIZE` / `RATE_LIMIT_*` / `CONCURRENCY_PER_IP`; do not add instances;
if multi-process is ever truly needed, the user table and rate-limit state must first be moved into shared storage, not just a PM2 config change.

> Lessons measured on 2026-10-06 (two incidents, same class of root cause):
>
> 1. This project was once started as cluster×2 + watch:true; users signed in successfully but their status flipped
>    between "authorized / unauthorized" (the two processes' user tables were independent, and the token was issued to only one of them).
>    Switching back to fork×1 restored it immediately.
> 2. The same class of configuration revived once in another daemon: on this server **root and www each have a
>    PM2 daemon** (each with its own boot-time systemd unit); the Baota panel manages one of them under the project's run user
>    (www), while `pm2` commands in a root shell operate on the other — if both sides host a copy of
>    the app they fight over port 17788, the loser enters an EADDRINUSE restart loop; watch:true on top of
>    the periodic `stats.json` writes turns it into an endless restart storm. At the restart instant nginx reports
>    `connection refused` / `prematurely closed`, Cloudflare returns 520, and if that lands on a sign-in
>    poll it looks like "authorization succeeded but the app never syncs". **Remediation: confirm which of the two daemons holds
>    the app, clear the other one and `pm2 save`; the panel's project settings (watch/cluster) are the source the panel
>    regenerates from, so editing only the `pm2_configs` file will be reverted at the next panel restart.**

## Deployment

Pick any one of three methods (Cloudflare and self-hosted are alternatives; the core signature-verification logic is the same `worker.js`).

**Reuse the relay's existing domain? Yes.** Two routes:

- **Subdomain (zero code change)**: add one DNS record `eac.your-domain` → the same server, deploy the gateway as below, and use `https://eac.your-domain/v1` as the client's sealed address.
- **Same-domain sub-path (one less DNS record)**: set `MOUNT_PREFIX=/eac` in the gateway's `.env` (or Worker vars), and add a pass-through reverse proxy segment to the Nginx configuration of **the relay's existing site** (**do not** strip the prefix). **The read timeout must be explicitly lengthened** — nginx's default `proxy_read_timeout 60s`, while reasoning models often take over 60 seconds to the first byte, so missing this is a wall of 504s:
  ```nginx
  location /eac/ {
      proxy_pass http://127.0.0.1:17788;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_buffering off;
      proxy_cache off;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_connect_timeout 60s;
      proxy_send_timeout 600s;
      proxy_read_timeout 600s;
  }
  ```
  Use `https://your-domain/eac/v1` as the client's sealed address (the signature covers the full path including the prefix, and the gateway strips the prefix itself for routing after receiving it as-is). If the gateway and relay are on the same machine, `UPSTREAM_URL` can be the relay's loopback address directly (`http://127.0.0.1:<relay port>`; the gateway allows loopback http).

### Method 0: Self-hosted Node gateway via Baota Panel

Prerequisite: the server has Baota Panel (Linux edition) installed, and a domain that resolves to this server (e.g. add an A record for `eac.your-domain` pointing at the server IP at your DNS provider).

1. **Install Node**: Baota → Software Store → search "Node.js Version Manager" → install, then install Node 20 or 22 (LTS) in it.
2. **Upload files**: Baota → Files → create directory `/www/eac-gateway/`, and upload **three files** from this directory into it: `worker.js`, `gateway-node.mjs`, `auth-github.mjs` (they must be in the same directory).
3. **Write the configuration**: create a new file `.env` in `/www/eac-gateway/` with (the three real values come from `D:\our free model\eac-channel.private.json`: `base`→UPSTREAM_URL, `apiKey`→UPSTREAM_API_KEY, `signingSecret`→SIGNING_SECRETS):
   ```ini
   UPSTREAM_URL=https://<relay address>/v1 (must end with /v1 — the gateway builds /models and /chat/completions from it)
   UPSTREAM_API_KEY=paste the apiKey from the private JSON (never write any real key into any file in this repository)
   SIGNING_SECRETS=paste the signingSecret here (a string of about 43 characters)
   MODELS=deepseek-ai/deepseek-v4.1-flash,moonshotai/kimi-k2.6,moonshotai/kimi-k3,openai/gpt-oss-20b,z-ai/glm-5.3,z-ai/glm-5.3-flash
   HOST=127.0.0.1
   PORT=17788
   RATE_LIMIT_PER_MINUTE=60
   # GitHub authorization gate (see the previous section; if left empty the gate is not enabled and old behaviour is unchanged)
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   REQUIRE_STAR_REPO=Ebony-Vinyl/dsh-our-free-model
   REQUIRE_USER_TOKEN=0
   STAR_RECHECK_HOURS=12
   PUBLIC_ORIGIN=https://<gateway domain>
   USER_STORE_KEY=<openssl rand -base64 32>
   ```
   Change the `.env` permissions to 600 (right-click → Permissions) so other users cannot read it.
4. **Create the Node project**: Baota → Websites → Node Project → Add Node Project:
   - Project directory: `/www/eac-gateway`
   - Start method / run script: `node gateway-node.mjs` (choose `gateway-node.mjs` as the startup file)
   - Port: `17788`
   - Run user: anything (www is fine); submit and start. The log should show `eac gateway listening on 127.0.0.1:17788 → …`.
   - Older panels without the Node Project feature: add the same directory's `gateway-node.mjs` in the PM2 Manager instead, with the same effect.
5. **Domain + certificate**: Baota → Websites → Add Site (domain: the one from step 0, PHP version: pure static) → Site Settings → Reverse Proxy → Add Reverse Proxy, target URL `http://127.0.0.1:17788`, send domain `$host`; then SSL → apply for a Let's Encrypt certificate → enable "Force HTTPS".
6. **Security**: confirm the Baota security group / firewall has **not** opened 17788 (the gateway listens only on the local loopback; external access goes only through Nginx's 443).
7. **Self-check**: on your own computer (in this repository's directory) run:
   ```
   node worker\verify-deployment.mjs https://eac.your-domain/v1 "D:\our free model\eac-channel.private.json"
   ```
   All three lines ok means the deployment succeeded. The server clock must be accurate (signatures have a ±10-minute replay window; Baota machines usually have NTP synced; if you get 401 while the same configuration works locally, check the server time first).
8. **Cutover**: after the self-check passes, put `https://eac.your-domain/v1` into the private JSON's `workerBase` → re-run `node scripts/eac-vault-mint.mjs "D:\our free model\eac-channel.private.json"` → follow the release process → finally rotate the old key on the relay side.

### Method 1: Paste in the Cloudflare dashboard (no server needed)

1. Cloudflare Dashboard → Workers & Pages → **Create** → Create Worker, name it anything (e.g. `ofm-eac-gateway`), Deploy, then **Edit code**, paste the full text of this directory's `worker.js` in, and Deploy.
2. Worker → **Settings → Variables and Secrets**, add:
   - Secret `UPSTREAM_URL` = relay address (like `https://<relay-host>/v1`, from the `base` in the private credentials file)
   - Secret `UPSTREAM_API_KEY` = relay key (`sk-…`, from the `apiKey` in `D:\our free model\eac-channel.private.json`)
   - Secret `SIGNING_SECRETS` = signing secret (from the `signingSecret` in the same file)
   - Variable `MODELS` = comma-separated list of the six model ids (see `wrangler.toml`)
3. (Optional) Settings → Bindings → add a **Rate Limit** binding; its name must be `RATE_LIMITER` (e.g. 30 requests / 60 seconds).

### Method 2: wrangler

```bash
npm i -g wrangler && wrangler login
cd worker
npx wrangler secret put UPSTREAM_URL
npx wrangler secret put UPSTREAM_API_KEY
npx wrangler secret put SIGNING_SECRETS
npx wrangler deploy        # for rate limiting, first uncomment the bindings in wrangler.toml
```

`wrangler tail` shows live logs (one line per request: path/status/duration, no body, no key, no signature).

## Cutover (taking the real key out of the plugin)

1. After deployment, put the Worker address (`https://<name>.<subdomain>.workers.dev/v1`, **must end with `/v1`**) into the `workerBase` of `D:\our free model\eac-channel.private.json`.
2. Re-mint the seal: `node scripts/eac-vault-mint.mjs "D:\our free model\eac-channel.private.json"` (from this point the seal contains only the Worker address + signing secret).
3. Publish per the release runbook (version number, announcement, manifest re-signing, dual commits). After the release completes, **rotate the old key on the relay side** — old plugin versions stop working naturally, and the Worker using the new key is unaffected.

## Rotation playbook

- **Signing secret leaked** (symptom: legitimately signed requests from unfamiliar sources): change `SIGNING_SECRETS` to `"new secret"` (or `"new secret,old secret"` for compatibility) → deploy → ship a new plugin version; after confirming old traffic has dropped to zero, remove the old secret and deploy again. The whole process takes effect in seconds, and the relay key does not need to move.
- **Relay key leaked**: rotate on the relay side → update the Worker's `UPSTREAM_API_KEY` → deploy. Zero client changes.
- Both leaked: do both of the above, in any order.

## Local verification

The offline suite drives this repository's `worker.js` directly (the same code, no logic drift): `node scripts/test-all.mjs --only vault`, covering signature pass / expired timestamp / bad signature / unknown path / model outside the allowlist / oversized body / the full streaming-forwarding chain.

The authorization gate has its own full offline acceptance: `node scripts/test-all.mjs --only eac-auth` (or `node scripts/eac-auth-test.mjs`) — GitHub fully stubbed, the relay a local loopback server, covering the start redirect shape, state tampering/expiry, star pass / not-starred recheck, idempotent token claiming that remains claimable after a restart, matching confirmation after saving under the new protocol, unknown links answered as expired, users.json never storing plaintext, no token / unknown token / revoked token refused, listing not blocked, star removal revoking, GitHub unreachable causing no false harm, sign-out, compatibility-window pass-through, and per-account rate limiting.
