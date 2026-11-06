# Separating "Syntactically Invalid" from "Truncated by Length" in Tool Arguments

## Requirements and Assumptions

- Tool arguments that are structurally complete but syntactically invalid (such as the bare value `{"pattern": **/*x, "limit": 50}`) must no longer masquerade as "the output token limit was reached": the UI does not lie, the turn follows the normal tool-calls path, and host schema validation returns the error to the model so it can fix it itself.
- Structurally incomplete arguments (unterminated strings, unbalanced brackets — shards lost or genuinely cut off by max_tokens) keep the current behaviour: judged truncated, reported as max-tokens, and the host discards the incomplete call and retries. The measured conclusion recorded in the `sse.ts` comments (one retry restores it) continues to hold.
- No new recovery mechanism is added and the original arguments are not re-injected (expectation 3 in the issue is a nice-to-have that depends on new assumptions about the host turn protocol, so it is not done); the brokenToolCall fallback and continuation-exclusion logic in `src/adapter.js` are untouched, and are corrected naturally by narrowing the judgement in stream.js.
- The judgement logic must be narrowed in sync in two places: the channel pack's `sse.ts` (finishReason classification and arguments field selection) and the plugin's `src/stream.js` (the brokenToolCall second confirmation). Vendor and plugin source are two build boundaries, each holding its own implementation.

## Approach and Trade-offs

After a JSON.parse failure, `isTruncatedArguments` performs one additional linear structural scan: it tracks the in-string / escape state and the `{[` depth. At the end of the scan it counts as truncated only if it ends "inside an unterminated string" or "with depth greater than zero"; a syntax error with matched brackets and fully closed strings returns false. A scan was chosen over heuristics (counting quotes, looking at the first/last characters) because it is correct for escapes, nesting and brackets inside strings, and is O(n) with no dependencies. Excess closing brackets such as `{"a":1}}` are judged non-truncated — that is not the product of being cut off, so it is left for schema validation to expose.

The brokenToolCall semantics in stream.js are narrowed in sync: its reason for existing (already recorded in the comments) is "upstream still reports tool_calls when it cuts JSON off at the output limit" — exactly the structurally incomplete scenario; a structurally complete syntax error produces an explicit schema error when executed, which is a stronger recovery signal than silently discarding it.

## Verification

- `channel-pack-test.mjs --source`: in `verifySourceRegressions`, assertions against the three shared adapters — complete-but-syntactically-invalid arguments plus `finish_reason: tool_calls` report `tool-calls` (before the fix: `max-tokens`); genuinely truncated arguments report `max-tokens` (unchanged).
- `forward-test.mjs`: on the plugin gateway side — complete-but-syntactically-invalid arguments are not marked brokenToolCall; an unterminated string is marked brokenToolCall.
- After both channel-pack build layers, the full bundle-mode `channel-pack-test` plus `build-standalone-channels --check`; and the full `npm run test:contributor`.
