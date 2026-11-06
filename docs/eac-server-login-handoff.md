# OFM Desktop Still Not Logged In After GitHub Authorisation: Server Troubleshooting and Fix Handover

Updated: 2026-10-07
Gateway: `https://ai.dtyg123.dpdns.org/eac`
Applies to: the self-hosted Node EAC gateway and its Nginx / Cloudflare proxy chain.

## 1. What needs to be done on the server side

After the user completes GitHub authorisation in the browser, OFM Desktop still shows unauthorised, and the waiting page never completes the login.

The maintainer is asked to complete three things:

1. Check whether this OAuth callback and token claim reached the same gateway process, and whether that process restarted.
2. Deploy the `auth-github.mjs` fix in the attachment, enabling the "retained claim → client saves → confirm claim" protocol.
3. Accept with a brand-new Desktop login session, confirming the user token is persisted and the authorisation state is correct.

The user has reported that a real login verification passed; the local client fix is installed. The on-site evidence below was recorded during the fix process and does not represent the current remote state. This PR synced upstream's encrypted-storage implementation; the remote module version and whether mandatory authentication is enabled still need to be checked by the maintainer. The code does not automatically flip the mandatory switch; after login acceptance, if a mandatory policy is needed, follow section 6.3.

## 2. Historically confirmed evidence (2026-10-06)

| Check item | Actual result | What it can show |
| --- | --- | --- |
| An earlier real token claim | HTTP 520, about 8446ms, non-JSON, no token; a later retry was pending | The claim path had a remote error; without logs, which layer the 520 came from cannot be determined |
| After authorising again, claiming the current UI's link code | HTTP 200, about 2626ms, `status=pending` | That response provided no claimable token |
| Local user authorisation file | Did not exist before or after the claim | Desktop did not successfully save a user token |
| Remote `/auth/status` | HTTP 200; configured=true, required=false, authorized=false | OAuth is configured and this is currently the compatibility period; unauthorised without a token is a normal result |
| `POST /auth/ack` for a random link code, with no token | HTTP 404, `not found` | The current access chain does not provide the new confirmation endpoint; the fixed version should return 401 |
| Remote `/auth/github/start` | HTTP 302; the callback address is the same-domain `/eac/auth/github/callback`; the state corresponds to the requested link code | The initiating side's callback address and link-code binding are as expected |
| Callback with an invalid state | HTTP 400, authorisation expired | The callback path reaches the expected authorisation handler |
| Local fix files | The SHAs of index, client and eac-login match the fix sources | This machine already has this client fix installed |

**Root causes that still cannot be determined:** whether the browser success page corresponds to the currently awaited link code, whether the old endpoint already consumed the token, whether the process restarted, and whether multiple instances caused state inconsistency. Verify against this success page and the server logs; do not conclude from an HTTP 520 or pending alone.

## 3. Fix contents and delivered files

The earlier delivery package contained:

- `README_CN.md`: this document.
- `auth-github.mjs`: the fixed server authorisation module.
- `auth-github.patch`: a single-file patch relative to the baseline commit, with path `worker/auth-github.mjs`.
- `SHA256SUMS`: the SHA-256 of the delivered files.

The current PR's target-branch baseline is `8f4f89e`; the fix is delivered through PR #107's `fix/pr97-reviewed-channels` branch. The earlier ZIP was based on `713b03f` and does not contain the later upstream encrypted storage or this integration, so the latest server version must not be overwritten based on the old ZIP. Adopt the `worker/auth-github.mjs` from the PR, or review and merge the differences against the current server version; no old `auth-github.patch` should be applied blindly.

SHA-256 of the target-branch baseline module above:

```text
7e67f47452ad35c84552d0ac5711f45380cb902d44b276452823b4b65b494021
```

SHA-256 of the fixed module:

```text
e2c0305c2a76af677ed7cfe7c44b8d462ddf1016dbb2cee40988b2f446cd113b
```

### Claim protocol

| Client request | Behaviour after the fix |
| --- | --- |
| Old client: `GET /auth/poll?link=...` | Keeps upstream's idempotent repeated claim, until expiry |
| New client: `GET /auth/poll?link=...&retain=1` | A successful response returns the token and `ackRequired:true`; the same token is retained until confirmation, for at most 15 minutes |
| `POST /auth/ack?link=...`, carrying a matching `x-ofm-user` | After confirmation, the pending-claim record is removed and 200 is returned; a repeated valid confirmation can succeed idempotently |
| ACK carries no token, or the token does not match the pending-claim record | Returns 401 and does not consume the pending-claim record |
| The token has been revoked, or the Star determination has lapsed | That token is not delivered again |

The new client first atomically saves and reads back the local token, then confirms the claim. If saving fails it does not confirm, and can claim again later. The client also fixed polling error prompts, concurrent claims, continuing to log in after the settings are closed, and sign-out races.

**Storage and limits:** Upstream's encrypted persistence of pending-claim tokens (users.json / 0600) is retained; under the same storage path and key, claims can be recovered across a single-instance restart; ACK deletion is also persisted. Multi-instance sharing is not yet implemented, so a single instance is still required. The old gateway's in-memory waiting records cannot be recovered by this upgrade; the login must be initiated again.

## 4. Pre-deployment checks

First confirm the actual process name, entry point, deployment directory, listening port and process-management user. `/www/eac-gateway/` and port `17788` are only repository examples and have not been verified as this server's actual values.

### 4.1 Process and restart state

Run the following as the user running this gateway. It only outputs PM2 runtime information and does not print secrets from environment variables:

```bash
pm2 jlist | node -e '
let text = "";
process.stdin.on("data", chunk => text += chunk);
process.stdin.on("end", () => {
  for (const p of JSON.parse(text)) {
    const e = p.pm2_env || {};
    console.log(JSON.stringify({
      name: p.name, pid: p.pid, id: p.pm_id,
      status: e.status, script: e.pm_exec_path, cwd: e.pm_cwd,
      mode: e.exec_mode, watch: e.watch,
      restarts: e.restart_time, unstableRestarts: e.unstable_restarts,
      startedAt: e.pm_uptime
    }));
  }
});'
```

This implementation requires **fork mode, a single instance, and watch=false**. The gateway writes stats.json, and enabling directory watch may restart it repeatedly; cluster / multiple instances would each hold their own pending-claim queue and user-token index. Also check whether the Nginx upstream, container replicas or other launchers point at multiple gateways.

If the process mode needs correcting, handle this gateway through the existing deployment configuration, keeping the original entry point, cwd, running user and environment variables. Do not run `pm2 restart all` or `pm2 delete all`.

### 4.2 Correlating the logs

Ask the user for the time of a new login round, and check, around that time:

- The Nginx access / error logs: the callback and poll times, HTTP status, upstream status and duration, and connection closes / upstream resets.
- The PM2 or other launcher logs: the PID in the same period, restart counts, exits, crashes, OOM and watch restarts.
- Cloudflare events: if a 520 appears again, record **that 520's own** Ray ID and time, and correlate with the origin logs. Another successful response's Ray ID is no substitute.

Questions to answer: which process handled the successful callback; did the subsequent poll reach the same process; was there a restart in between; is the successful callback's link code the same as Desktop's link code?

The existing application logs are not guaranteed to contain all of this information. If necessary, temporarily add diagnostics for PID, path, status and a link-code summary, and remove them after acceptance; do not record full OAuth codes/states, user tokens or GitHub credentials. The raw Nginx request_uri may already contain OAuth parameters; before sharing logs, keep only paths and diagnostic fields, and check sensitive parameters within the server only.

### 4.3 Proxy and configuration

- The public callback address should be `https://ai.dtyg123.dpdns.org/eac/auth/github/callback`, matching the OAuth App configuration.
- Nginx forwards `/eac/` as-is, without stripping the prefix; it allows GET and POST on `/eac/auth/*` and does not cache authorisation responses.
- Compare the local loopback port with the public network: if the local ACK=401 and the public ACK=404, first check proxy routing, an old upstream or another instance; if both sides are 404, first verify the actually loaded code.
- Keep the original `USER_STORE_KEY`, signing secret, GitHub OAuth configuration, user storage path and relay configuration. Do not newly generate or rotate these secrets during the fix, or existing authorisations may lapse.
- `REQUIRE_USER_TOKEN=0` means the compatibility period and will not prevent a correct login. Enabling mandatory authentication will not fix token claiming; keep the original deployment policy.

## 5. Deployment steps

The following is the single-file update flow. **All placeholder values must be replaced with verified actual values**; updating an old in-memory-queue gateway loses the original pending logins; a restart may also interrupt in-flight conversations, so arrange a maintenance window.

```bash
DEPLOY_DIR='/actual gateway deployment directory'
FIX_DIR='/delivery package extraction directory'
APP_NAME='actual PM2 gateway process name'

cd "$FIX_DIR"
# Extract the fixed module from this PR; check against the SHA below, do not use the old ZIP's checksum table.
sha256sum "$FIX_DIR/auth-github.mjs"
node --check "$FIX_DIR/auth-github.mjs"
sha256sum "$DEPLOY_DIR/auth-github.mjs"
```

Check the current module's SHA. If it does not match the original module SHA above, first compare the server's custom content with the patch, merge manually and review; **do not directly overwrite an unknown version**. The patch path is relative to the repository root; when the deployment directory stores files flat, do not run git apply directly in that directory.

Once the original module matches and the fix has been reviewed:

```bash
BACKUP_DIR="$DEPLOY_DIR/backup-eac-auth-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP_DIR"
cp -p "$DEPLOY_DIR/auth-github.mjs" "$BACKUP_DIR/auth-github.mjs"

cp "$FIX_DIR/auth-github.mjs" "$DEPLOY_DIR/auth-github.new.mjs"
chmod --reference="$DEPLOY_DIR/auth-github.mjs" "$DEPLOY_DIR/auth-github.new.mjs"
node --check "$DEPLOY_DIR/auth-github.new.mjs"
mv "$DEPLOY_DIR/auth-github.new.mjs" "$DEPLOY_DIR/auth-github.mjs"
pm2 restart "$APP_NAME"
```

Keep the `.mjs` extension on the staging file so Node runs the syntax check correctly. Ensure the commands run as the original deployment user and keep the original file owner; do not delete users.json or replace .env. When using systemd / BaoTa or another launcher, restart only this gateway through the original launcher.

## 6. Acceptance

### 6.1 Local loopback and public endpoints

The following probes use a random, non-existent link code and do not read or consume a user token. The example port must be adjusted to the actual listening value:

```bash
LOCAL_PORT='17788' # replace with the actual port
GATEWAY_ROOT='https://ai.dtyg123.dpdns.org/eac'
PROBE_LINK=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))')

curl --silent --show-error --max-time 20 --request POST \
  "http://127.0.0.1:$LOCAL_PORT/eac/auth/ack?link=$PROBE_LINK" \
  --write-out '\nHTTP %{http_code}\n'

curl --silent --show-error --max-time 20 --request POST \
  "$GATEWAY_ROOT/auth/ack?link=$PROBE_LINK" \
  --write-out '\nHTTP %{http_code}\n'

curl --silent --show-error --max-time 20 \
  "$GATEWAY_ROOT/auth/poll?link=$PROBE_LINK&retain=1" \
  --write-out '\nHTTP %{http_code}\n'
```

Expected: both token-less ACKs are **401**, and poll is **200 / pending**. ACK=404 means the new handler was not reached; HTML or a 5xx should be correlated further against the proxy and origin logs. This probe only proves the routing and protocol are deployed; it is no substitute for a full login acceptance.

### 6.2 A brand-new login session

1. After the deployment is stable, cancel the old wait in the fixed Desktop and start a brand-new login; use the entry point opened this time and do not reuse an old success page.
2. Complete the GitHub authorisation and Star check in person, keeping the Desktop settings page open.
3. Confirm the new poll returns ok / ackRequired, Desktop saves the user token and then ACK=200, and the UI becomes authorised. When checking endpoints, do not print the token into logs or forward it to others.
4. Confirm the local user file is at `our-free-model/eac-user.json` under the actual DSH_HOME. The file's existence alone does not mean the authorisation is valid; also confirm that `/auth/status` with that token is authorized=true.
5. Close and reopen the settings; the authorisation is still correct. When the user agrees to test signing out, confirm the local file is cleared and that token lapses on the server.
6. Observe that the process keeps running and does not restart repeatedly due to stats writes. If it is still pending, go back to section 4 and check the same round's link code and process; do not repeatedly ask the user to log in again instead of diagnosing.

### 6.3 Enabling mandatory authentication after login verification

When GitHub login and Star must be mandatory, set, in the actually effective deployment configuration:

```ini
REQUIRE_USER_TOKEN=1
```

`.env` only supplements process environment variables that are not already defined. If the PM2 ecosystem / BaoTa launch configuration still defines `REQUIRE_USER_TOKEN=0`, that configuration must be changed in sync and the gateway process's environment updated through the original launcher; changing only `.env` may have no effect. Restart only the actual gateway process, keeping the original secrets and user storage.

Acceptance:

- `/auth/status` returns `required:true`.
- A user who is authorised and whose Star is valid can complete EAC calls.
- An EAC generation request with no `x-ofm-user` but a valid HMAC signature returns 401 / AuthorizationRequired and does not reach the relay. A request with an invalid signature can only test signature verification; it cannot prove user authentication is in effect.
- The original anonymous free lane remains usable; this switch governs EAC only.

These configuration steps are performed by the maintainer; this PR contains no actual `.env`, token or secret.

## 7. Verification boundaries and rollback

The final integrated code has been completed locally: the contributor suite is 28/28, passing regressions for the old protocol, the new protocol's retained re-claim / ACK, error or revoked tokens, 15-minute expiry, client save failures, concurrent claims, sign-out races, error prompts and page recovery. The adapter type check, runtime file syntax checks and git diff --check all pass.

**Current acceptance boundary:** the user has confirmed that a real GitHub login verification passed; local loopback tests are no substitute for that on-site feedback. The remote's current module version, the actually effective state of `REQUIRE_USER_TOKEN=1`, and the 520 log root cause have not been independently re-checked, and no production release signing has been completed.

When a rollback is needed, restore this backup's authorisation module and restart only this gateway:

```bash
cp -p "$BACKUP_DIR/auth-github.mjs" "$DEPLOY_DIR/auth-github.mjs.rollback"
mv "$DEPLOY_DIR/auth-github.mjs.rollback" "$DEPLOY_DIR/auth-github.mjs"
pm2 restart "$APP_NAME"
```

Do not restore an old users.json over new authorisations made after deployment, and do not delete the user table. If this fix corrected PM2 / proxy configuration, keep each original configuration backup; rolling back configuration needs review again — in particular, do not restore cluster / watch configurations that are confirmed to cause state loss directly into production. When rolling back to an old module that does not persist pending-claim records, users who are logging in need to initiate again; that must not be used to overwrite existing user data.

## 8. Results the maintainer is asked to report back

- The actual entry point and directory, process mode, instance count, watch value and restart state.
- The online `auth-github.mjs` SHA-256, and the status codes of the local loopback and public ACKs.
- The result of one new login's callback → poll → local save → ACK → authorized sequence.
- If it failed: the time, path, HTTP / upstream status, and whether the process restarted; if there was a 520, attach that instance's Ray ID.
- The fix adopted, the acceptance result and any still-unresolved problems. Do not report back OAuth parameters, user tokens or server secrets.
