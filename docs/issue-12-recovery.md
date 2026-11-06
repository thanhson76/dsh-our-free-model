# Issue #12: Bounded Recovery After a Long-Thinking Stream Is Truncated

## Status and goal

- Record date: 2026-09-30.
- Current status: targeted offline regression, the full offline suite and manifest checks have passed; after revising the recovery prompt, one real MiMo Deep truncation recovery succeeded. The first real failure record is retained; the real dsh UI is still to be completed.
- Goal: when upstream closes the stream with no normal end frame after returning only thinking and before producing any body text or tool call, the plugin appends at most one more request, attempting to generate an answer from the thinking already received.
- Scope: open to all models by default, covering the three upstream protocols Chat Completions, Messages and Responses. A model entering the recovery flow must still satisfy the same trigger conditions.
- Non-goals: unlimited continuation, a full replay of the original request, automatically recovering a turn that already output body text or a tool call, or guaranteeing that upstream will be able to complete the answer.

## Existing facts and this change

The v1.3.1 implementation could already distinguish a normal ending from an EOF with no end frame. An EOF with no output returns a retryable `TRANSPORT`; an EOF with output returns a non-retryable `STREAM_CUT`. That prevents the host from re-sending the same long thinking for a whole turn, but a turn whose pure thinking is truncated still has no body text.

The 304-second, 608-second and 912-second retry records in the README are historical evidence from old versions, not acceptance results for this recovery implementation. The moment of upstream truncation and the recovery request's success rate are still affected by the model, load and network.

This change adds one recovery request inside the adapter. The host still sees one logical turn; local statistics must record at most two physical requests actually sent.

## Trigger conditions

All of the following conditions must be satisfied:

1. The first stream segment reaches EOF naturally, with no protocol-recognised normal end frame.
2. The first segment received non-empty thinking content.
3. The first segment produced no body text and no tool call of any kind, including a tool call that did not finish completely.
4. The user has not cancelled, the call signal has not aborted, and the overall deadline still has room.
5. No recovery request has been sent yet.
6. The thinking checkpoint does not exceed 131072 characters, and the original context and recovery material pass a conservative capacity check.

A normal `stop`, an exhausted output budget, an explicit upstream failure, a region refusal, rate limiting, a network anomaly or a cancellation must not be interpreted as the EOF above. When the first segment has no output at all, the original empty-output failure handling is kept.

The second segment does not enter the recovery flow again. A first segment that already produced body text or a tool still ends under the original truncation rules, to avoid a repeated answer or repeated tool execution.

A recovery segment counts as successful only when it ends normally and produces non-blank body text. Thinking alone, blank body text or an end frame cannot be recorded as recovered.

## Recovery material and tool boundaries

The recovery request keeps the original conversation input, takes the thinking received in the first segment as explicitly labelled checkpoint text, and asks the model to organise the answer directly. The checkpoint is input material; it must not become a system instruction, nor be treated as a tool result awaiting execution. The thinking blocks the first segment already output are not replayed to the host.

The recovery prompt states explicitly that the checkpoint already satisfies the original task's long-analysis requirement, asks for conclusion-first, at most 800 words, and no
restarting the analysis or exploring more constructions. 800 words is a prompt constraint, not a hard token limit, and the model may not comply.
This is a degraded answer; a long-form or step-by-step analysis required by the original task may be simplified; it cannot be promised to complete every time.

The checkpoint exists only in the current call's memory and is released when it ends; local statistics, warnings and probe summaries do not save or print the original thinking text, user prompts, tool results, images or credentials.

The recovery segment disables tool selection and allows no new tool call to execute. The four tool fingerprint declarations required by the upstream free lane may be kept, but tool disabling must use the dialect recognised by each protocol; Chat's setting must not be treated directly as the Messages contract. If upstream still returns a tool call, it must not be handed to the host for execution.

The first segment and the recovery segment belong to the same stable upstream session; the recovery segment uses a new request ID, to make the two requests easy to distinguish.

When local forwarding receives a final failure, even if some body text was already received, non-streaming Chat/Responses returns a JSON
502; Chat SSE returns an error followed by `[DONE]`, and must not fake a normal `stop`. A client disconnect cancels the current
generation segment and prevents a subsequent recovery request. The actual regression results are as recorded in this round's test record; the real dsh UI has not yet been run.

## Counts, time limits and capacity

| Constraint | Default | Behaviour |
| --- | --- | --- |
| Recovery count | 1 | At most one additional physical request per logical turn |
| Total time limit per logical turn | 900 seconds | Counted from when the first segment is sent, including the first segment, recovery preparation and the recovery segment |
| Recovery segment time limit | 300 seconds | Also constrained by the remaining total time limit; the smaller of the two applies |
| Recovery output cap | 8192 tokens | Also constrained by the user's original cap and the model's output capacity; if less than 512 remains after deducting the first segment's known output tokens, do not recover |
| Checkpoint size | 131072 characters | If exceeded, do not recover; do not silently trim and then claim the full thinking was kept |
| Context capacity | A text-byte estimate of the model's known capacity | Estimates the original text, checkpoint, control prompt and output reservation; does not count image tokens and is not an exact tokenizer check |

> 2026-10-05 revision (issues #69/#70): the total time limit went 480→900 seconds and the recovery segment 180→300 seconds. The earlier values, when
> the upstream account pool was saturated (measured 1923 capacity / 2451 concurrent, first token 34–220 seconds, deep thinking over 6 minutes),
> would reliably cut off normal long turns; the transport layer has a separate 300-second idle deadline for "no bytes", and the wall clock only backstops turns that "keep emitting frames
> but are slow overall", so relaxing it does not change the anti-hang semantics. The values may still only be adjusted downwards.

User cancellation must abort the current request and prevent subsequent requests. Cancellation, total-time-limit exhaustion, a capacity-check refusal, the second segment being truncated again, or the second segment failing must all produce a recognisable final failure and must not fake normal completion.

"Open to all models" means there is no model list; it does not mean ignoring capacity, tool, cancellation or time-limit protections, nor that real-model verification has been completed one by one.

Setting `streamRecovery: false` locally disables recovery; the object form supports an `enabled` switch and numeric bounds.
Numeric values may only be adjusted downwards and cannot break through the default caps above. When the capacity or checkpoint cap is exceeded, recovery is skipped; a recovery failure
returns `STREAM_CUT`, preventing the host from re-sending the whole long-thinking turn. User cancellation is the exception and still returns
`kind: 'aborted'` and `code: 'ABORTED'`; it must not be rewritten as a truncation or retry.

The text-byte check skips `image_url` and `data` content and cannot guarantee a multimodal input's actual total tokens
are below the model window; nor, when the model capacity is unknown, can it claim to have passed an exact capacity check. Upstream may still refuse the recovery request.

## Usage and local statistics

### Logical turns

In the end the adapter emits only one logical turn's usage summary and final end result. The usage summary only adds up the known counts actually reported by upstream; when one segment's usage is missing, tokens must not be inferred from the thinking character count, and unknown usage must not be written as a confirmed zero.

If the host usage contract cannot express a missing count, the compatibility field returns only the known part; the local sample also explicitly marks that something is missing, to avoid describing that summary as the whole turn's complete usage.

### Physical requests

Each request actually sent enters `recordUsage` separately, so a logical turn that is truncated in one segment and then recovers successfully leaves two samples:

- First segment: a truncation failure; keeps the actual known usage; when usage is missing, explicitly marks `noUsage`.
- Second segment: recorded as a success or failure according to the actual end result; keeps its actual known usage; when usage is missing, likewise marks `noUsage`.

The total request count and each model's calls increment correspond to the number of physical requests. The recovery metadata includes `recoveryId`, `attempt` (0/1), `recoveryAttempt`, `recoveryScheduled`, `recovered` and `noUsage`. Missing information is recorded in each segment sample's `noUsage` and correlated via the same `recoveryId`; there is no separate whole-turn missing field. Acceptance must read the persisted samples, not only check the adapter callbacks.

`src/store.js` uses an explicit sample field list, to which the persistence of the recovery metadata above has been added; a new field cannot be passed in by the adapter alone, or it will be dropped when persisted. Requests that completed normally but have no usage also keep the missing mark.

A failed segment's duration must not be added to the successful decoding speed; the recovery segment's speed measurement uses only that segment's own decoding window and its corresponding known tokens, and must not mix the two segments' time with one segment's tokens in a division.

## Acceptance conditions

| Scenario | Expected result | Current evidence state |
| --- | --- | --- |
| Three protocols: the first segment has only thinking and EOFs, the second segment answers normally | Two upstream requests; only one non-blank body text output; a normal final ending | For the offline suite results, see the next section; one real Chat/MiMo success, other models and protocols not measured one by one |
| Any model entering the same recovery condition | Not restricted by a model list | For the offline suite results, see the next section; real models cannot be claimed verified one by one |
| The first segment already has body text | No recovery request is appended; the truncation failure is kept | For the offline suite results, see the next section |
| The first segment already has a tool call, including an incomplete one | No recovery, no repeated tool execution | For the offline suite results, see the next section |
| The first segment has a normal termination frame or reaches the output cap | The protocol's corresponding end result is kept; no recovery | For the offline suite results, see the next section |
| Cancellation during the first segment or between the two segments | No second request is produced; the result is a cancellation | For the offline suite results, see the next section |
| The second segment is cancelled, times out, is truncated or has an explicit error | A final failure; no third request may be sent; a cancellation stays ABORTED | For the offline suite results, see the next section |
| The second segment has only blank body text | Not recorded as a recovery success | For the offline suite results, see the next section |
| The recovery requests' tool settings on three protocols | Declarations satisfy the fingerprint requirements; tool calls are off and not executable | For the offline suite results, see the next section |
| The checkpoint exceeds the character cap, or the text-context estimate is insufficient | Recovery is refused; a recognisable failure is kept | For the offline suite results, see the next section |
| The remaining known output budget is under 512 tokens | No recovery request is sent | For the offline suite results, see the next section |
| The first segment has no usage, the second segment has usage | The final usage is the second segment's known value; the first sample's noUsage and recoveryId are persisted | For the offline suite results, see the next section |
| Both segments have usage | The known counts are added; the request count is 2, with no double counting | For the offline suite results, see the next section |
| Neither segment has usage | Each segment's noUsage is explicit; zero values do not fake complete usage | For the offline suite results, see the next section |
| Local forwarding and host consumption | One logical turn can receive the recovered body text and the final end result | Verified through a real plugin + local HTTP integration; the real dsh UI was not run |
| A real upstream long-thinking request | Record the actual model, protocol, duration, both segments' samples and the final result | The first recovery failed after reaching the total deadline; after the prompt revision, the second recovery succeeded — see the next section |

Offline tests should use a local upstream service to control EOF, end frames, usage, tools and cancellation, and verify the actual number of requests and the request bodies sent. Real probing uses `scripts/probes/long-think-truncation.mjs`, which accesses upstream and consumes free-lane quota; if it was not run, it must not be written as passed.

## Acceptance record

The following are the actual offline results provided by this round's main agent, recorded on 2026-09-30; the editor of this record did not re-run these tests.

| Check | Result received | Limitation |
| --- | --- | --- |
| `scripts/recovery-test.mjs` | 100/100 passed, exit code 0 | A locally controlled upstream regression; does not represent real-model success rates |
| `scripts/fingerprint-test.mjs` | 11 new items passed | Does not write the number of new assertions as the suite total |
| `scripts/truncation-test.mjs` | 35/35 passed | Local truncation and end-frame regression |
| `npm run typecheck` | Exit code 0 | A static type check; no substitute for runtime acceptance |
| Real plugin forwarding + local HTTP | 12 integration verifications passed | 2 recovery successes with persistence, 6 EOF/error after partial body text, 4 first-segment/recovery-segment SSE/JSON client disconnects; not an online upstream or the real dsh UI |
| `node scripts/build-manifest.mjs --force` | Exit code 0; 29 release files, 465385 bytes | Only generated a local manifest; nothing was committed or released |
| `npm test` | 19/19 suites passed, exit code 0 | Includes manifest, release, catalog and recovery |
| `npm run manifest:check` | Exit code 0 | Both manifests match all 29 release files |
| `git diff --check` | Exit code 0 | No whitespace errors; no substitute for behaviour verification |

Boundaries such as Responses cancelled, failed missing a status, Chat content_filter, and cancellation between the two segments still keeping the known
usage have also passed this recovery regression. Test expansion has ended, the release manifest has been refreshed, and the final 19
suites were run uniformly and passed.

### Real upstream, first round: recovery failed

Command executed:

```powershell
node .verify/issue-12/repro.mjs --mode thinking --effort deep
```

Evidence files:

- `.verify/issue-12/2026-09-30T08-59-34-775Z-thinking-result.json`
- `.verify/issue-12/2026-09-30T08-59-34-775Z-thinking-trace.jsonl`

MiMo V2.6 Flash · Deep, Chat protocol, original output budget 32768. The first segment EOF'd naturally at 303.882 seconds,
with no finish or `[DONE]`; the plugin actually sent a second HTTP request. The two segments accumulated 63123 received
characters of thinking, with no body text or tools. The total deadline ended the request at 480.024 seconds, ending as `error / STREAM_CUT`,
not retryable; the probing side did not cancel proactively. Both physical request samples carry `noUsage`, so a zero-value summary means there are no
known counts and cannot be interpreted as the two segments spending no tokens.

This failure shows that the first version's recovery prompt still let the model continue the original task's long analysis. The prompt was then tightened: the checkpoint already satisfies the old
task's long-analysis requirement, so output a conclusion-first answer of at most 800 words directly, without re-analysing or exploring additional constructions.
The failure evidence is retained; "a recovery request was sent" is not treated as "recovery succeeded".

### Real upstream, second round: recovery succeeded after the prompt revision

The same command was executed, with evidence files:

- `.verify/issue-12/2026-09-30T09-08-57-348Z-thinking-result.json`
- `.verify/issue-12/2026-09-30T09-08-57-348Z-thinking-trace.jsonl`

| Observation | Actual result |
| --- | --- |
| Model, level, protocol | MiMo V2.6 Flash · Deep, Chat |
| First segment | A natural EOF at 304.161 seconds, no finish, no `[DONE]` |
| Recovery segment | 32.777 seconds, received 4264 characters of non-blank body text, no tools |
| Normal wrap-up | The original `stop` at 336.910 seconds, usage at 336.920 seconds, `[DONE]` at 336.924 seconds |
| Logical result | `stop`, total duration 336.942 seconds; the probing side did not cancel proactively |
| Request count | 2; using the same session, and the recovery segment having a new request ID, is covered by the code and offline checks |
| First sample | `attempt:0`, `ok:false`, `truncated:true`, `noUsage:true`, `recoveryScheduled:true` |
| Second sample | `attempt:1`, `ok:true`, `recoveryAttempt:true`, `recovered:true` |
| Known usage | uncached input 12380, cached input 192, output 1475, of which reasoning 397; total 14047 includes the cached input |

The two samples share a `recoveryId` and record only two physical requests. The first segment's usage is unknown, and the final usage only summarises
the second segment's counts that were received; 14047 must not be described as the whole turn's complete token total.

This result proves that this one real request was truncated and generated an answer through a new request; it cannot be extrapolated to all models, all three
real protocols, or arbitrary long tasks having passed. The real dsh UI was not run; the local plugin forwarding's 12 integration regressions
have passed. The final full offline checks, release manifest consistency and static type checks have all passed.

The bilingual READMEs are release files, so after modification `feed/manifest.json` and `catalog/integrity.json` must be regenerated and verified. This design document and the probing scripts are not in the release file list. Committing, pushing, tagging, Release and CDN purge are still decided by the user's release authorisation.

## Pre-merge review fixes

The review raised two points, both reproduced at the entry of a real plugin + local HTTP before being fixed, rather than decided by reading code alone.

1. **One recovery turn accumulated three times the discarded-content warnings.** `payloadFor` reuses the turn-level shared
   `warnings` array, while the checkpoint capacity estimate builds another payload and the continuation segment builds yet another, so three
   `buildPayload` calls each push into the same array. Evidence: construct a recovery turn with two unparseable images
   (Chat protocol, first segment pure-thinking EOF, continuation a normal `stop`); both segments' samples' `warnings` each contain **6**
   `image-dropped` entries, and the user-visible warn line likewise repeats 6 times; before the `src/adapter.js` change there was only one
   build, so this was introduced by this PR. The other half of the problem is that the first segment's sample holds an array reference, so when a later build appends, it changes along with it.
   Fix: warnings are collected only by the first segment's (canonical) payload; the estimate and the continuation segment each use a one-off array, and the set of discarded content
   does not change anyway. After the fix, the same turn has 2 entries and the warn line 1.
2. **When the first segment hit the limit, the wording described a recovery that never happened as if it had.** `expired` only judged whether it timed out and did not distinguish
   the segment number, so a first-segment timeout also reported "automatic recovery reached its time limit". It now reports, according to the deadline actually in effect for that segment,
   `our free model reached its Ns time limit before its finish token`, with the continuation segment
   adding a suffix; this only triggers while `streamRecovery` is enabled, and with it off there is still no client time limit at all.

New regressions: `The discarded-content warnings of a recovery turn do not accumulate with the number of payload rebuilds` (pinning both the sample array and the user-
visible text), plus, in the existing whole-turn time-limit check, additionally pinning the actual seconds in the wording. recovery grew from 98 items to
99 items — what was added is a check item; appended assertions are not counted separately.

This fix changed `src/adapter.js` and the bilingual READMEs, which are release files, so
`node scripts/build-manifest.mjs --force` regenerated the manifest: 29 release files,
465932 bytes; `npm run manifest:check` exit code 0.

> Review correction: the "100 items" above counted both "one new check added" and "an assertion appended in an existing check" as check items.
> Based on the suite's actual output, recovery is **99/99**, and the bilingual READMEs and this document's figure have been changed back to 99,
> with the manifest recalculated accordingly to 29 release files / 465928 bytes. All other figures come from that run's output.

### Issue #15: Physical requests and logical turns counted separately

Fixed. Each HTTP request actually sent is still recorded separately by `recordUsage`, so a first segment interrupted and a continuation succeeding
leaves 2 physical samples, of which the first segment's `ok:false` still counts as a request failure; the adapter additionally, when the final result is determined,
calls `recordTurn` once, recording the same process as 1 conversation turn, 0 turn failures and 1 recovered. The failure,
cancellation and generator-cleanup paths likewise record only one logical turn each.

`stats.json`'s `failedRequests` stores the cumulative physical failure count, and `logical` stores the cumulative turn results; the dashboard
displays both sets of numbers at the same time, avoiding describing an internal failure during recovery as a user turn failure. Data from v2 and earlier cannot reliably reconstruct turn boundaries from
physical samples, so migration builds an estimated baseline from the retained physical records and marks it with `estimated`;
records after the upgrade accumulate exactly. Request, turn and Token totals use lifetime accumulation; speed, first frame and the heatmap
still use the retained window. The regressions cover recovery success, failure, cancellation, generator `return()`, sample retention and persisted reload.
