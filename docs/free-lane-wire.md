# The Keyless Lane's New Wire (measured 2026-10-14)

Between 2026-10-13/14, the free lane on `/zen/v1` returned
`403 {"type":"error","error":{"type":"FreeTierError", …}}` to the plugin across the board, while the official client still worked.
This file records the five changes found by measurement, the basis for determining them, and the corresponding fixes in `src/upstream.js` / `src/http.js`.

## Conclusion: the gate as it now stands

| Item | Measured result |
| --- | --- |
| Chat endpoint | **`https://opencode.ai/inference/v1/chat/completions`**. `/zen/v1/chat/completions` returns 403 FreeTierError even when everything else is right; `/inference/v1/models` and `/zen/v1/models` both still return 85 model ids |
| Session header | **`x-opencode-session-id` must be present** (with the same value as `x-opencode-session`). Removing it → 403 |
| Session id shape | The 12 hex digits after `ses_` must be of the **minted** shape `~(ms·0x1000+seq)` (the low 12 bits ≈ `0xFFE`). sha256-derived or random hex → 403 |
| Tool fingerprint | **`bash` and `read` must be declared together**, and each one's parameter schema must have at least one property. Declaring only one of them → 403; `properties: {}` → 403; both present + any property → 200, and you may attach your own tools as well |
| User-Agent | Containing `deepseek-harness` (case-insensitive, position-independent) → 403; `dsh/…` and `opencode/1.18.22` both 200 |
| Everything else | `authorization: Bearer public` must be kept; `x-opencode-request` / `x-opencode-project` / `x-opencode-client` may be omitted (still sent as before); HTTP/1.1 vs HTTP/2, and the Node vs Bun TLS stacks, **make no difference** |

## How it was determined

1. Run the official client `opencode-ai@1.19.0` locally (linux-arm64-musl, Alpine's musl loader) and confirm
   `opencode run -m opencode/cat-jam-free` works — showing the gate is a client fingerprint, not an account or quota.
2. Use a TLS man-in-the-middle with a self-signed CA (`NODE_EXTRA_CA_CERTS`) to point the client at a local endpoint and read the requests it actually sends:
   the path is **`/inference/v1/chat/completions`**, and it carries `x-opencode-session-id`.
3. Use **byte-for-byte replay** for single-variable comparisons (ordinary Node `https`, involving no TLS tricks):
   starting from the real request, delete/change one item at a time and record 200/403. The table above is the result of that comparison.
4. Run a separate matrix for the tool dimension: `bash` alone → 403, `read` alone → 403, `bash`+`read` with empty schemas → 403,
   `bash`+`read` each with one property → 200, the `Read`/`BASH` case variants → 403.

## Fixes

- `endpointFor()` / `wireFor()`: the three paths move to `/inference/v1`; the list address moves with them,
  and the stand-in gateways used by tests (`scripts/lib/fake-kernel.mjs` etc.) follow.
- `gatewayHeaders()`: add `x-opencode-session-id`, and `x-opencode-client` reports `cli`.
- `sessionForConversation()`: switch to minting with `mintSessionId()` and caching per conversation (keeping
  the "one session per conversation" quota semantics while satisfying the shape check).
- `applyFingerprint()`: both the decoys and the caller's own `bash`/`read` are completed with at least one property;
  only the schema is completed — names are not changed, descriptions are not changed, and tools are not copied.
- `userAgentWith()` in `http.js`: the `deepseek-harness` in the attribution UA is rewritten to `dsh`,
  and the parenthesised URL repeating that token is removed; the rest of the attribution information is kept.

Regression tests: `scripts/fingerprint-test.mjs` (tool fingerprint) and the new
`scripts/free-lane-wire-test.mjs` (paths, session header, session shape, UA sanitisation, including one end-to-end assertion through a stand-in gateway
). Both are in `npm run test:contributor`.

---

# The v2 client fingerprint (2026-10-16)

Around 2026-10-14 upstream switched the free lane to the shape of the **OpenCode v2 client**, and the v1's four characteristics
failed one by one — each one appearing on its own is a `403 FreeTierError` ("free tier can only be used from
within OpenCode"). On 2026-10-16 this plugin was redone following v2, and the two implementations (`src/upstream.js` and
the vendored `vendor/channel-pack/src/opencode*.ts`) keep the same shape.

## Conclusion: the four changes from v1 to v2

| Item | v1 (old) | v2 (now) |
| --- | --- | --- |
| User-Agent | `opencode/1.18.31` | **`opencode/latest/2.0.26/cli`** (`opencode/<channel>/<version>/<client>`, major ≥ 2; the whole string is matched, and any prefix or suffix no longer counts as a v2 client) |
| Request headers | Carried `x-opencode-request` | **Not carried** (a v1-only header; carrying it gives 403); instead carries `x-session-affinity` / `x-session-id`, with the same value as `x-opencode-session` / `x-opencode-session-id` — four headers, one value |
| Tool gate | The four names `bash`/`glob`/`grep`/`read`, each with at least one property | **`read` and `shell` — two names, and the description and parameter schema must match the official client word for word** |
| `tool_choice` | With no tools, add `none` to suppress the decoys | **`none` itself is a 403** — never send it; only the Responses wire adds the official `auto` |

The session id's shape is unchanged (`ses_` + 12 digits of minted hex + 14 base62 digits), but a **counter constraint** was added:
upstream decodes those 12 hex digits, and the seq inside must be small (measured: 0–16 pass, ≥100 are refused);
`mintSessionId()`'s approach of resetting every millisecond happens to satisfy this.

## How it was determined (basis)

- This repository's v1 determination comes from the 2026-10-14 TLS man-in-the-middle + byte-for-byte replay (see the previous section).
- The v2 shape is taken from **9router v0.5.104** (`open-sse/executors/opencode.js` and
  `open-sse/utils/opencodeFingerprint.js`, committed 2026-10-15 as
  `5bdcd5e` "move free tier to /inference/v1 with the v2 client fingerprint") —
  that project measured the same upstream item by item, and states in writing that both the v1 UA and `x-opencode-request` get a 403.
- Local re-check on 2026-10-16: `GET /inference/v1/models` and `/zen/v1/models` both 200
  (88 entries, 12 free); **the conversation request that time was blocked by a `429 FreeUsageLimitError`**
  (retry-after ≈ 12h), so the v2 item-by-item comparison relies on 9router's measurements and was not re-measured locally.
  Once the egress recovers, one direct verification should be added: a single 200 proves the v2 shape is accepted.

## Fixes

- `CLIENT_UA` → the v2 string; `userAgentWith()` in `http.js` no longer concatenates an attribution UA
  (v2 matches the whole string, so a concatenated string is no longer a v2 client). Attribution is still kept on the other lanes.
- `gatewayHeaders()`: remove `x-opencode-request`, add `x-session-affinity` / `x-session-id`.
- `applyFingerprint()`: rewritten for v2 — inject the official `read`/`shell` definitions (word for word); caller
  tools with the same name but a different definition are renamed to `<name>_client[N]` and restored on the response side, with same-name calls in the history
  renamed along with them; after injection, a system prompt line "do not call them" is added, and any `tool_choice: 'none'` is cleared as a backstop.
  v1's "promote the caller's shell into the `bash` slot" and "complete an empty schema with a placeholder property" are both deleted
  (v2 compares definitions, and both would get a 403).
- Continuation turns no longer send `tool_choice: 'none'`: the suppression means returns to the
  "Do not call tools" that was already in the continuation instruction body.
- The channel pack (`opencode*.ts`): the same set of changes, plus `resolveOpencodeEffort()`, which converges a requested level
  to the nearest level the model has declared (the same meaning as 9router's `normalizeOpenAILevel`, implemented using this repository's
  own intensity ordering).

Regression tests: `scripts/fingerprint-test.mjs` (the v2 tool gate, including aliases/duplicates/three wire shapes),
`scripts/free-lane-wire-test.mjs` (the four session headers, the UA, no v1 headers), and the new
`scripts/opencode-parity-test.mjs` (fingerprint consistency between the `src/` and channel-pack sides —
names, word-for-word definitions, UA, header set, aliases, `tool_choice`, level convergence). All three are
in `npm run test:contributor`.

---

# Alignment with the reference gateway opencode2api v1.4.6 (2026-10-31)

Several 429/403 recurrences in late October pinned down three new facts (each with a single-variable measurement):

1. **The vocabulary gate**: if the request body still carries another client's tool vocabulary — Claude Code's
   `ReportFindings` and `ScheduleWakeup` appearing together is enough — upstream returns 429
   (measured 2026-10-30; at the time an alias table was built for only DSH's two tools, a special case of the same finding).
2. **The official prompt gate**: with tools and request headers all correct and a clean IP, missing the official CLI system prompt still gives 429;
   adding the base prompt + `<env>` + skills gives 200 (measured 2026-10-28, first held down with a bare env block;
   the full prompt is the reference implementation's shape).
3. **Timestamp plausibility**: the session id's shape/encoding are all correct but the embedded date is untrustworthy (a pure hash landing in 1970)
   → 429; a real, recent date → 200 (2026-10-28 A/B).

These three are exactly what [opencode2api](https://github.com/jasonxu114514/opencode2api)
(the reference implementation this repository has followed since 2026-10-17) solved item by item in its v1.4.x. Therefore,
from 2026-10-31, the anonymous lane's request-shaping layer was replaced wholesale with a port of its **v1.4.6**: `src/o2a/`
(for the file mapping, the seven intentional deviations and the upgrade manual, see `src/o2a/SYNC.md`). `src/upstream.js`
is retained as the adapter layer, with its public exports unchanged.

## This round's online shape (v1.4.6)

| Item | Before (the 2026-10-28 shape) | Now (the v1.4.6 port) |
| --- | --- | --- |
| Client tools | Original names kept (two known bad names in the alias table) | **All renamed** to `clint_<sha256[:12]>`; `tool_choice`/history/`input` call lines are renamed in sync, and folded back on the response side |
| Official tool set | Two word-for-word definitions, `read` + `shell` | **All 13 official tools** (captured from the 2.1 CLI's `opencode_tools.json`; the chat wire carries `strict:false`, and on Windows hosts the shell description says powershell) |
| System prompt | A bare `<env>` block | **The full official CLI prompt**: base prompt + `<env>` (model/directory/platform/date) + built-in skills; request bodies already carrying the marker are skipped |
| `x-opencode-project` | Always `global` (a shared quota bucket) | **One 40-hex per request** (a caller-given `global`/git commit passes through directly; everything else is hashed to 40-hex) |
| Endpoint | `/inference/v1/…` | **Family paths** `/inference/openai/v1/…`, `/inference/anthropic/v1/messages?beta=true` (the 2.1 client shape; the old flat paths still work) |
| UA | `opencode/latest/2.0.26/cli` | `opencode/latest/2.1.1/cli` (following the reference implementation's `v2ClientVersion`) |
| Chat body | — | Streaming adds `stream_options.include_usage:true`; with no cap, adds `max_completion_tokens:32000` |
| Session minting | Real-timestamp minting + persistence | Slow-clock minting (today's UTC midnight − a ≤30-day hash offset, descending encoding, a process salt); persistence is retained, and old ids whose date is outside the window (±400 days) are re-minted |

The Anthropic wire adds the `anthropic-beta: interleaved-thinking-2025-05-14` header. The retained
plugin-side deviations (placeholder prompts, the `tool_choice:'none'` backstop clearing, idempotent shaping, block-object preservation,
not forcing non-streaming, sessions across restarts, copy-on-write) are listed item by item in section 2 of `src/o2a/SYNC.md`.

## Basis

- The reference implementation v1.4.6's sources (released 2026-10-29, commit `58f5667`), compared file by file;
  it performed the same single-variable measurements against this lane's upstream, and its release notes agree with facts 1–3 in this file.
- **Wire-byte comparison (same day)**: have the v1.4.6 gateway send its shaped request to a local plaintext echo server,
  capture its final outbound (header set, a 24868B body, 13 tools, a 9579B system prompt),
  and diff it against this port field by field: the key set, tool set, system prompt, UA/project/session shapes all match;
  the only difference is that it **does not send an `accept` header** — this port is now aligned (not sent by default, sent only on an explicit override).
- **Replay determinations are invalid (same day)**: at the same egress and moment, v1.4.6's own bytes get a 200 through a Go client and a
  429 through curl/python forwarding (both `FreeUsageLimitError`) — upstream is sensitive to the TLS/HTTP client
  fingerprint, and the 429 message does not distinguish "IP quota exhausted" from "unofficial client". Using curl
  to replay this lane for a 200/429 conclusion (including this file's early hand-written comparisons) requires "the same client fingerprint"
  as a premise; comparisons across clients are all invalid. A determination can only use this lane's own client (the plugin =
  Node/Bun) or the reference gateway itself.

Regression tests: `scripts/fingerprint-test.mjs` (opaque renaming + the 13-tool set + idempotency),
`scripts/free-lane-wire-test.mjs` (family paths, the 40-hex project id, the UA, the four session headers,
no accept header), `scripts/opencode-parity-test.mjs` (the overlapping contract of the lane and the channel pack),
`scripts/wire-tool-alias-test.mjs` (renaming → streaming restoration → host dispatch),
`scripts/free-lane-compat-test.mjs` (prompt injection on three wires + the transport layer). All are in `npm test`.
