# src/o2a — opencode2api porting and synchronization manual

This directory is a JavaScript port of the **anonymous free lane (free tier /
anonymous lane) request shaping** in the
[opencode2api](https://github.com/jasonxu114514/opencode2api) gateway. Each
time upstream releases a new version, port it file by file following this
manual; there is no need to redo the archaeology.

- Current mirrored version: `O2A_VERSION` / `O2A_COMMIT` in `src/o2a/version.js`
- Porting date: 2026-10-31 (v1.4.6, commit `58f56676ba1438adb30604b889bf36db2a1542a1`)
- Upstream releases page: https://github.com/jasonxu114514/opencode2api/releases

## 1. File mapping table (Go → JS)

| Upstream file (`internal/…`) | This directory | Contents |
|---|---|---|
| `identity/request.go` | `identity.js` | Session minting: `bootNonce` (process salt), `CanonicalSessionID` (slow-clock timestamp + descending encoding), `isOfficialSessionID`, `RandomProjectID`, base62. The JS side adds `sessionTimestampMs` (extracts the timestamp embedded in the session, so the persistence layer can do freshness-based re-minting). |
| `protocol/tools.go` | `tool-renames.js` | `clint_<sha256[:12]>` opaque renaming, `ToolRenames` (forward/reverse mapping + case/separator-folding resolution in `Resolve`), conflict `_2` suffix. |
| `gateway/toolshape.go` | `toolshape.js` | `renameAndCompleteTools` (rename all client tools + append the official 13-tool set), `rewriteToolReferences` (tool_choice / historical tool_calls / tool_use / input call lines / function_call / allowed_tools renamed in sync), legacy `functions` conversion. |
| `gateway/toolshape.go` (assets) | `official-tools.js` + `assets/opencode_tools.json` | Official 2.x tool set (captured verbatim from the official CLI), `strict:false` (chat wire), Windows host shell description rewrite, `renamableToolName` (Responses/Messages built-in tools are skipped). |
| `gateway/opencode_prompt.go` (assets) | `official-prompt.js` + `assets/opencode_prompt_v2.txt` | Official CLI system prompt (base + `<env>` + skills), marker deduplication, injection on the three wires. |
| `gateway/upstream.go` (body part) | `gateway-body.js` | `ensureAnonymousChatUsage` (`stream_options.include_usage`), `ensureV2CompletionLimit` (`max_completion_tokens: 32000`). |
| `gateway/upstream.go` (header part) | `headers.js` | `setV2Headers` four session headers + 40-hex `x-opencode-project` (`projectID`: `global`/git commit pass through directly, everything else is hashed to 40-hex), `anthropic-beta` header, `Bearer public`, UA. |
| `httpx/client.go` | `version.js` | `v2ClientVersion` → `V2_CLIENT_VERSION` (the sole source for the UA and version number). |
| `gateway/upstream.go` (endpoints) | `endpointFor` in `src/upstream.js` | `/inference/<family>/v1/…` family paths; the Anthropic wire adds `?beta=true`. |
| `gateway/upstream.go` (retry/rotation), `warp/*`, `gateway/pool.go`, `gateway/rotation.go`, etc. | **Not ported** | The server runtime (process pool, WARP egress, registration, rotation, cooldown) is the gateway's responsibility; the plugin runs on the user's local machine and its egress is the user's own IP, so these layers have no counterpart. Retry/failure classification follows the plugin's own `failure.js` / `forward.js` policy. |

The two files under `assets/` are verbatim copies of the upstream
`//go:embed` assets — **never edit them by hand**; when syncing, simply
overwrite them with the same-named files from the new version.

## 2. Deviations retained in the adapter layer (upstream.js, all intentional)

Porting is not byte-for-byte copying; the following deviations are dictated
by the plugin form, and should be **retained** when syncing upstream:

1. **Placeholder prompt**: The injected official tool set consists of
   placeholder tools that are not executable for this plugin's host; after
   injection, a "placeholders in this session" prompt is appended to hold the
   model down from calling them (the reference implementation's downstream is
   a real CLI, which really does execute these tools, so it does not send
   this note).
2. **`tool_choice: 'none'` deletion**: The v2 gate answers 403 as soon as it
   sees it (verified live on 2026-10-16). The reference implementation never
   actively sends it, so it does not need to delete it; the plugin's callers
   (such as continuation paths) may leave it behind, and the adapter layer
   cleans it up as a fallback.
3. **Idempotent shaping**: The reference implementation shapes each request
   body only once; the plugin may call `applyFingerprint` again on an
   already-shaped body (retry/recovery paths). A declaration that already
   carries a verbatim official definition is treated as an official
   declaration (not renamed, not completed again), and a name that already
   has the `clint_` prefix is a wire name from the previous round (skipped).
4. **Chat wire prompt injection retains block objects**: The reference
   implementation folds all system text into a single rebuilt system message
   (losing block objects and `cache_control`); this port **prepends** the
   official prompt into the first system message (string concatenation /
   prepending to a block array), and keeps the other system messages as-is.
5. **Does not force `stream: true`**: The reference implementation is a
   streaming proxy, so it forces it; paths such as the plugin's probes
   legitimately send non-streaming requests, and `stream_options` is only
   added when `stream === true`.
6. **Sessions persist across restarts**: The reference implementation uses
   `bootNonce` to re-mint all sessions on every restart (daemon semantics);
   the plugin persists the conversation → session mapping to
   `session-map.json`, while still mixing the process salt into minting. The
   persistence layer uses `sessionTimestampMs` for a freshness check: an old
   id whose date has left the window the upstream accepts (±400 days) is
   re-minted, rather than replayed forever.
7. **Copy-on-write on the response side**: The reference implementation
   mutates the caller's objects in place; the plugin's tool objects/history
   lines are shared with the host harness, so renaming always swaps in a
   shallow copy.

## 3. Upgrade workflow (when upstream releases a new version)

1. **Get the source**: Download `Source code (tar.gz)` from the releases
   page and extract it to a separate directory (for example
   `/d/o2a-ref/opencode2api-<ver>/`); do not mix it into this repository.
2. **Look at the diff**: `git diff v<old> v<new> -- internal/`, caring only
   about `identity/request.go`, `protocol/tools.go`, `gateway/toolshape.go`,
   `gateway/opencode_prompt.go`, `gateway/upstream.go` (body/header/endpoints),
   `httpx/client.go`, and the `internal/gateway/*.json|*.txt` assets.
3. **Port according to the table**: Move the diff semantics, file by file
   following the mapping table in section 1, into the corresponding JS
   modules; overwrite the asset files in `assets/` directly. Update the three
   constants in `version.js`.
4. **Run the guards**: `node scripts/fingerprint-test.mjs && node scripts/free-lane-wire-test.mjs && node scripts/opencode-parity-test.mjs && node scripts/wire-tool-alias-test.mjs && node scripts/free-lane-compat-test.mjs`, then run
   `npm test`.
5. **Canary verification** (when conditions allow): Send a real `PONG` probe
   to the upstream (`scripts/oc-free-live-test.mjs`); a 429/403 means looking
   back at the diff to see whether some gate fact was missed in the port.

## 4. Two conclusions verified live on 2026-10-31 (written into the guards, to prevent regressions)

Using the method of "having the v1.4.6 gateway send its shaped request to a
local plaintext echo server", we captured its **final wire bytes** and, after
diffing them field by field against this port, obtained:

1. **The v2 lane does not send an `accept` header**. The reference
   implementation's `setV2Headers` does not include Accept (Go's http client
   does not send it by default); this port now likewise does not send it by
   default, and only sends it when the caller explicitly gives an `accept`
   (such as a manifest GET). `headers.js` has a corresponding comment, and
   `free-lane-wire-test.mjs` has a guard.
2. **Replaying this lane with curl/python to judge 429/200 is invalid**. At
   the same egress and the same moment, v1.4.6's own bytes get a 200 via the
   Go client and a 429 via curl/forwarding (the error message is
   `FreeUsageLimitError` in both cases) — the upstream is sensitive to the
   TLS/HTTP client fingerprint, and a 429 message does not distinguish "IP
   quota burned out" from "non-official client". Judgement can only be made
   using this lane's own client (the plugin = Node/Bun) or the reference
   gateway itself.

## 5. Discipline for this directory

- Pure functions, zero plugin dependencies: this directory **must not**
  import plugin modules such as `src/store.js` or `src/http.js`, nor read
  plugin configuration; it is only consumed in reverse by `src/upstream.js`.
  That way, when comparing against an upstream diff, there is no hidden
  coupling.
- Upstream facts (each one corresponding to a live-verified 403/429) are
  written in the header comments of each file, corresponding to the upstream
  comments; read the file header before changing behavior.
- The version constants must be updated together, in the same commit, as the
  asset files — a guard test compares the consistency of
  `O2A_PORTED_VERSION` with the UA constants.
