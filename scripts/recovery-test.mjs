/**
 * Bounded continuation regression for reasoning-only EOF: real Adapter, local HTTP, actual requests and stream output.
 * Run: node scripts/recovery-test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { callRoute, chatFrames, fakeContext, until } from './lib/fake-kernel.mjs'

let activeCase
let forwardScenario
const server = http.createServer((req, res) => {
  const pieces = []
  req.on('data', piece => pieces.push(piece))
  req.on('end', async () => {
    if (forwardScenario !== undefined && req.method === 'GET' && req.url === '/inference/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: forwardScenario.models.map(id => ({ id })) }))
      return
    }
    const body = JSON.parse(Buffer.concat(pieces).toString('utf8'))
    if (forwardScenario !== undefined && !JSON.stringify(body).includes(TASK)) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(chatFrames('healthy local boot probe'))
      return
    }
    const scenario = forwardScenario ?? activeCase
    const ordinal = scenario.requests.length
    scenario.requests.push({ body, path: req.url, headers: req.headers })
    scenario.responses.add(res)
    let released = false
    const release = () => {
      if (released) return
      released = true
      scenario.responses.delete(res)
      scenario.closed++
    }
    res.on('finish', release)
    res.on('close', release)
    const answer = scenario.answers[ordinal] ?? { status: 500, body: '{"error":{"message":"unexpected extra request"}}' }
    if (answer.socket) { req.destroy(); res.destroy(); return }
    if (answer.holdHeaders) return
    res.writeHead(answer.status ?? 200, { 'content-type': answer.status ? 'application/json' : 'text/event-stream' })
    const send = () => {
      if (answer.pieces) {
        for (const [index, piece] of answer.pieces.entries()) {
          const timer = setTimeout(() => {
            if (res.destroyed) return
            res.write(piece)
            if (index === answer.pieces.length - 1 && !answer.hold) res.end()
          }, index * answer.intervalMs)
          scenario.timers.push(timer)
        }
        return
      }
      if (answer.hold) { res.write(answer.body ?? ': waiting\n\n'); return }
      res.end(answer.body ?? '')
    }
    if (answer.delayMs) {
      const timer = setTimeout(send, answer.delayMs)
      scenario.timers.push(timer)
    } else send()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
server.unref()
process.env.OUR_FREE_MODEL_BASE = `http://127.0.0.1:${server.address().port}`

const { FreeModelAdapter, ROUTE_MAIN } = await import('../src/adapter.js')
const { buildCatalog } = await import('../src/catalog.js')
const { wireFor } = await import('../src/upstream.js')
const { recoveryPolicy } = await import('../src/recovery.js')

const MODELS = [
  'mimo-v2.6-flash-free', 'mimo-v2.5-free', 'muse-spark-1.3-contributor-free',
  'muse-spark-1.2-contributor-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free',
  'ling-3.0-flash-fin-free', 'space-bunny-free', 'union-alpha', 'deepseek-v4-flash-free',
  'jev-1.13-free', 'future-provider-free',
]
const CATALOG = buildCatalog(MODELS)
const REPRESENTATIVES = ['mimo-v2.6-flash-free', 'muse-spark-1.3-contributor-free', 'union-alpha']
const TASK = 'ORIGINAL_TASK_SENTINEL: answer the original question'
const CHECKPOINT = 'CHECKPOINT_SENTINEL: established reasoning to continue'
const ANSWER = 'VISIBLE_ANSWER_SENTINEL'
const TOOL = { name: 'dangerous_operation', description: 'A caller-owned tool', parameters: { type: 'object', properties: {} } }
const sse = payload => `data: ${JSON.stringify(payload)}\n\n`

function deltas(wire, { reasoning, text, toolName, toolArgs } = {}) {
  if (wire === 'chat') {
    const delta = {
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(text === undefined ? {} : { content: text }),
      ...(toolName === undefined && toolArgs === undefined ? {} : { tool_calls: [{ index: 0, function: {
        ...(toolName === undefined ? {} : { name: toolName }),
        ...(toolArgs === undefined ? {} : { arguments: toolArgs }),
      } }] }),
    }
    return sse({ choices: [{ index: 0, delta }] })
  }
  if (wire === 'responses') {
    return [
      reasoning === undefined ? '' : sse({ type: 'response.reasoning_summary_text.delta', item_id: 'r0', delta: reasoning }),
      text === undefined ? '' : sse({ type: 'response.output_text.delta', output_index: 1, delta: text }),
      toolName === undefined ? '' : sse({ type: 'response.output_item.added', output_index: 2, item: { type: 'function_call', call_id: 'call_local', name: toolName } }),
      toolArgs === undefined ? '' : sse({ type: 'response.function_call_arguments.delta', output_index: 2, delta: toolArgs }),
    ].join('')
  }
  return [
    reasoning === undefined ? '' : sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: reasoning } }),
    text === undefined ? '' : sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } }),
    toolName === undefined ? '' : sse({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'call_local', name: toolName } }),
    toolArgs === undefined ? '' : sse({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: toolArgs } }),
  ].join('')
}

function usageFrames(wire, input = 11, output = 7) {
  if (wire === 'chat') return sse({ choices: [], usage: { prompt_tokens: input, completion_tokens: output } })
  if (wire === 'messages') return sse({ type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 0 } } })
    + sse({ type: 'message_delta', delta: {}, usage: { output_tokens: output } })
  throw new Error('Responses usage is carried by the terminal frame')
}

function terminal(wire, { reason = 'stop', input = 11, output = 7, usage = true } = {}) {
  if (wire === 'chat') return (usage ? usageFrames(wire, input, output) : '')
    + sse({ choices: [{ index: 0, delta: {}, finish_reason: reason }] }) + 'data: [DONE]\n\n'
  if (wire === 'messages') return (usage ? usageFrames(wire, input, output) : '')
    + sse({ type: 'message_delta', delta: { stop_reason: reason === 'length' ? 'max_tokens' : reason === 'tool_calls' ? 'tool_use' : 'end_turn' } })
    + sse({ type: 'message_stop' })
  return sse({
    type: reason === 'length' ? 'response.incomplete' : 'response.completed',
    response: { status: reason === 'length' ? 'incomplete' : 'completed',
      ...(reason === 'length' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
      ...(usage ? { usage: { input_tokens: input, output_tokens: output } } : {}),
    },
  })
}

function setup(model, answers, { settings = {}, options = {}, entryOverrides = {}, onWarn, hideModel = false, combo = false } = {}) {
  assert.ok(CATALOG.some(entry => entry.id === model), `catalog is missing ${model}`)
  const scenario = { answers, requests: [], responses: new Set(), timers: [], closed: 0 }
  activeCase = scenario
  const records = []
  const turns = []
  const controller = new AbortController()
  const catalog = CATALOG.map(entry => entry.id === model ? { ...entry, ...entryOverrides } : entry)
  const comboEntry = { id: 'combo:progress-deadline', name: 'Progress deadline', channel: 'combo',
    combo: [model, 'mimo-v2.6-flash-free'], maxOutput: 32768, contextWindow: 131072 }
  if (combo) catalog.push(comboEntry)
  const adapter = new FreeModelAdapter({
    state: () => ({ catalog: hideModel ? [] : catalog, membership: { [ROUTE_MAIN]: MODELS }, settings: { enabled: true, defaultMaxTokens: 32768, ...settings }, attributionUserAgent: 'offline-recovery-test' }),
    recordUsage: row => records.push(row),
    recordTurn: row => turns.push(row),
    sealedCredential: () => ({ mode: 'direct', base: process.env.OUR_FREE_MODEL_BASE, apiKey: 'fixture' }),
    warn: message => onWarn?.(message, controller),
  })
  const stream = adapter.stream({ provider: ROUTE_MAIN, model: combo ? comboEntry.id : model, reasoningEffort: 'deep', maxTokens: 4096,
    sessionId: `recovery:${model}`, messages: [{ role: 'user', content: [{ type: 'text', text: TASK }] }],
    tools: [TOOL], signal: controller.signal, ...options })
  return { scenario, records, turns, controller, adapter, stream }
}

function cleanup(run) {
  run.controller.abort()
  for (const timer of run.scenario.timers) clearTimeout(timer)
  for (const response of run.scenario.responses) response.destroy()
}

async function drive(model, answers, config) {
  const run = setup(model, answers, config)
  const chunks = []
  const started = Date.now()
  const deadline = setTimeout(() => run.controller.abort(new Error('test timed out')), 1500)
  try {
    for await (const chunk of run.stream) chunks.push(chunk)
    return { ...run, chunks, elapsedMs: Date.now() - started,
      finish: chunks.find(chunk => chunk.type === 'finish')?.reason,
      usage: chunks.find(chunk => chunk.type === 'usage')?.usage }
  } finally {
    clearTimeout(deadline)
    cleanup(run)
  }
}

function checkBlocks(chunks) {
  const starts = chunks.filter(chunk => chunk.type === 'block-start')
  assert.deepEqual(starts.map(chunk => chunk.index), starts.map((_, index) => index), 'block indexes must be consecutive and must not repeat')
  const opened = new Map()
  const ended = new Set()
  for (const chunk of chunks) {
    if (chunk.type === 'block-start') opened.set(chunk.index, chunk.blockType)
    if (chunk.type.endsWith('-delta')) {
      assert.ok(opened.has(chunk.index), 'a delta must point to a block that has been opened')
      assert.ok(!ended.has(chunk.index), 'a block that has ended must not keep receiving deltas')
    }
    if (chunk.type === 'block-end') {
      assert.equal(opened.get(chunk.index), chunk.block.type, 'block start/end types must match')
      assert.ok(!ended.has(chunk.index), 'each block may end only once')
      ended.add(chunk.index)
    }
  }
  assert.equal(ended.size, starts.length, 'every opened block must end')
}

function checkFinal(run, kind, requests) {
  assert.equal(run.scenario.requests.length, requests, 'actual number of HTTP requests')
  assert.equal(run.chunks.filter(chunk => chunk.type === 'finish').length, 1, 'there must be exactly one final finish')
  const usageCount = run.chunks.filter(chunk => chunk.type === 'usage').length
  if (kind === 'stop' || requests === 2) assert.equal(usageCount, 1, 'the normal or recovery path must have exactly one final usage')
  else assert.ok(usageCount <= 1, 'a first-segment failure or cancellation has at most one usage')
  assert.equal(run.finish?.kind, kind)
  assert.equal(run.turns.length, 1, 'one adapter call must record exactly one logical turn')
  assert.equal(run.turns[0].ok, kind === 'stop', 'the logical turn result must match the final result')
  assert.equal(run.turns[0].attempts, requests, 'the logical turn keeps the actual number of physical requests')
  assert.equal(run.turns[0].recovered, kind === 'stop' && requests === 2, 'only a successful continuation is marked as recovered')
  checkBlocks(run.chunks)
}

function checkCut(run, requests = 2) {
  checkFinal(run, 'error', requests)
  assert.equal(run.finish?.failure?.code, 'STREAM_CUT')
  assert.equal(run.adapter.providerRetryPolicy().retryableCodes.includes(run.finish.failure.code), false, 'a recovery failure must not trigger the host to resend the whole turn')
}

function noToolChunks(chunks) {
  return chunks.every(chunk => chunk.type !== 'tool-call-delta'
    && !(chunk.type === 'block-start' && chunk.blockType === 'tool-call')
    && !(chunk.type === 'block-end' && chunk.block?.type === 'tool-call'))
}

function emptyToolMetadata(wire) {
  if (wire === 'chat') return sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0 }] } }] })
  if (wire === 'responses') return sse({ type: 'response.output_item.added', output_index: 2, item: { type: 'function_call' } })
  return sse({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use' } })
}

let failures = 0
let checks = 0
const suiteStarted = Date.now()
const check = async (name, fn) => {
  checks++
  console.log(`run  ${name} (${Date.now() - suiteStarted} ms)`)
  try { await fn(); console.log(`ok   ${name}`) }
  catch (error) { failures++; console.log(`FAIL ${name} - ${error.message}`) }
}

try {
  await check('auxiliary purposes isolate the upstream session, retries are stable and ordinary sessions stay compatible', async () => {
    const model = 'mimo-v2.6-flash-free'
    const wire = wireFor(model)
    const session = async options => {
      const run = await drive(model, [{ body: deltas(wire, { text: ANSWER }) + terminal(wire) }], { options })
      checkFinal(run, 'stop', 1)
      const headers = run.scenario.requests[0].headers
      assert.equal(headers['x-session-id'], headers['x-opencode-session'])
      assert.equal(headers['x-session-affinity'], headers['x-opencode-session'])
      return headers['x-opencode-session']
    }
    const normal = await session({ sessionId: 'shared-conversation' })
    const title = await session({ sessionId: 'shared-conversation', purpose: 'session-title' })
    assert.notEqual(title, normal)
    assert.equal(await session({ sessionId: 'shared-conversation', purpose: 'session-title' }), title)
    assert.equal(await session({ sessionId: 'shared-conversation', purpose: '  ' }), normal)
    assert.notEqual(await session({ sessionId: 'other-conversation', purpose: 'session-title' }), title)
    assert.notEqual(await session({ sessionId: undefined, purpose: 'session-title' }), await session({ sessionId: undefined }))
  })
  // Walk the different capabilities and unknown models in the catalog; the recovery conditions must not be limited to a model allowlist.
  for (const model of MODELS) {
    await check(`${model}: reasoning-only EOF continues with body text and ends normally`, async () => {
      const wire = wireFor(model)
      const run = await drive(model, [
        { body: deltas(wire, { reasoning: CHECKPOINT }) },
        { body: deltas(wire, { reasoning: 'SECOND_SEGMENT_REASONING', text: ANSWER }) + terminal(wire) },
      ])
      checkFinal(run, 'stop', 2)
      assert.equal(run.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), ANSWER)
      assert.equal(run.chunks.filter(chunk => chunk.type === 'reasoning-delta').map(chunk => chunk.text).join(''), CHECKPOINT + 'SECOND_SEGMENT_REASONING')
      const [first, continuation] = run.scenario.requests
      assert.equal(first.body.model, model)
      assert.equal(continuation.body.model, model)
      assert.equal(first.headers['x-opencode-session'], continuation.headers['x-opencode-session'], 'the continuation keeps the original logical session')
      // v2 fingerprint: upstream has rejected the v1 `x-opencode-request` header by
      // name (403), the four session headers must all have the same value, and that
      // header must not appear again.
      assert.equal('x-opencode-request' in continuation.headers, false, 'the v1 x-opencode-request must not be sent again')
      assert.equal(continuation.headers['x-session-affinity'], continuation.headers['x-opencode-session'], 'the v2 session headers have the same value')
      assert.equal(continuation.headers['x-session-id'], continuation.headers['x-opencode-session'], 'the v2 session headers have the same value')
      assert.ok(JSON.stringify(continuation.body).includes(TASK), 'the continuation must carry the original task')
      assert.ok(JSON.stringify(continuation.body).includes(CHECKPOINT), 'the continuation must carry the completed reasoning checkpoint')
      assert.notDeepEqual(continuation.body, first.body, 'the whole turn must not be resent as-is')
      // Suppressing tool calls in the continuation now relies on the instruction
      // body (v2 returns 403 when it sees tool_choice: 'none'). The Responses wire
      // adds the official default `auto`, so only `none` is forbidden here.
      assert.notEqual(continuation.body.tool_choice, 'none', 'the continuation must not send tool_choice: none')
      assert.ok(JSON.stringify(continuation.body).includes('Do not call tools'), 'the continuation instructions must themselves say "Do not call tools"')
      assert.equal(run.records.length, 2, 'each real HTTP call is recorded separately')
      assert.deepEqual(run.turns, [{ at: run.turns[0].at, model, ok: true, recovered: true, attempts: 2, origin: 'harness' }])
      assert.deepEqual(run.records.map(row => row.attempt), [0, 1])
      assert.equal(typeof run.records[0].recoveryId, 'string')
      assert.ok(run.records[0].recoveryId.length > 0)
      assert.equal(run.records[0].recoveryId, run.records[1].recoveryId, 'the two segments belong to the same logical call')
      assert.equal(run.records[0].recoveryScheduled, true)
      assert.equal(run.records[1].recoveryAttempt, true)
      assert.equal(run.records[1].recovered, true)
      assert.equal(run.records[0].noUsage, true, 'a first segment missing usage must be explicitly flagged')
      assert.equal(run.usage.inputTokens, 11)
      assert.equal(run.usage.outputTokens, 7)
    })
  }

  for (const model of REPRESENTATIVES) {
    const wire = wireFor(model)
    for (const [label, delta] of [['body text', { reasoning: CHECKPOINT, text: 'partial answer' }], ['tool name', { reasoning: CHECKPOINT, toolName: TOOL.name }], ['tool arguments', { reasoning: CHECKPOINT, toolArgs: '{"x":1}' }]]) {
      await check(`${wire}: no continuation when the first segment already has ${label}`, async () => {
        const run = await drive(model, [{ body: deltas(wire, delta) }])
        checkCut(run, 1)
      })
    }
    for (const reason of ['stop', 'length']) {
      await check(`${wire}: a second segment with reasoning only is not recovered even on ${reason}`, async () => {
        const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
          { body: deltas(wire, { reasoning: 'more thinking' }) + terminal(wire, { reason }) }])
        checkCut(run)
      })
    }
    await check(`${wire}: whitespace and newlines in the second segment cannot pass as a successful body-text recovery`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
        { body: deltas(wire, { text: ' \n\t ' }) + terminal(wire) }])
      checkCut(run)
      assert.ok(run.records.every(row => row.recovered !== true))
    })
    await check(`${wire}: a second-segment EOF does not send a third request`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }, { body: deltas(wire, { reasoning: 'still thinking' }) }])
      checkCut(run)
    })
    await check(`${wire}: a second segment that has body text but ends with length cannot pass as a successful recovery either`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
        { body: deltas(wire, { text: ANSWER }) + terminal(wire, { reason: 'length' }) }])
      checkCut(run)
    })
    await check(`${wire}: tool metadata with no name and no arguments in the first segment also forbids recovery`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + emptyToolMetadata(wire) }])
      checkCut(run, 1)
    })
    await check(`${wire}: empty tool metadata in the second segment must not be passed to the host either`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
        { body: deltas(wire, { text: ANSWER }) + emptyToolMetadata(wire) + terminal(wire) }])
      checkCut(run)
      assert.ok(noToolChunks(run.chunks))
    })
    for (const tool of [{ toolName: TOOL.name }, { toolArgs: '{"x":1}' }]) {
      await check(`${wire}: tool output in the second segment must not leak to the host`, async () => {
        const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
          { body: deltas(wire, { text: ANSWER, ...tool }) + terminal(wire, { reason: 'tool_calls' }) }])
        checkCut(run)
        assert.ok(noToolChunks(run.chunks), 'no executable tool blocks or argument deltas are allowed')
      })
    }
    await check(`${wire}: a reasoning-only turn that ends with a normal stop continues once to ask for body text`, async () => {
      const warns = []
      const run = await drive(model, [
        { body: deltas(wire, { reasoning: CHECKPOINT }) + terminal(wire) },
        { body: deltas(wire, { text: ANSWER }) + terminal(wire) },
      ], { onWarn: message => warns.push(message) })
      checkFinal(run, 'stop', 2)
      assert.equal(run.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), ANSWER, 'the body text must come from the continuation segment')
      assert.equal(run.records[0].recoveryScheduled, true, 'the first segment must record recoveryScheduled')
      assert.equal(run.records[0].ok, false, 'an empty stop in the first segment must not be recorded as a success')
      assert.equal(run.records[1].ok, true)
      assert.equal(run.records[1].recovered, true)
      const continuation = run.scenario.requests[1].body
      assert.ok(JSON.stringify(continuation).includes(CHECKPOINT), 'the continuation must carry the reasoning checkpoint')
      assert.notEqual(continuation.tool_choice, 'none', 'the continuation must not send tool_choice: none (v2 returns 403 on sight)')
      assert.ok(JSON.stringify(continuation).includes('Do not call tools'), 'the continuation instructions must themselves say "Do not call tools"')
      assert.ok(warns.some(message => message.includes('stopped turn held only its reasoning')), 'an empty-stop continuation must report a warning')
    })
    await check(`${wire}: when the continuation segment still holds only reasoning it fails as a cut stream`, async () => {
      const run = await drive(model, [
        { body: deltas(wire, { reasoning: CHECKPOINT }) + terminal(wire) },
        { body: deltas(wire, { reasoning: CHECKPOINT }) + terminal(wire) },
      ])
      checkCut(run)
      assert.equal(run.records.every(row => row.recovered !== true), true)
    })
    await check(`${wire}: with recovery off, a reasoning-only normal ending keeps its original classification`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + terminal(wire) }],
        { settings: { streamRecovery: false } })
      checkFinal(run, 'stop', 1)
      assert.equal(run.records[0].recoveryScheduled, undefined)
    })
    await check(`${wire}: a reasoning-only empty stop that has burned through the first segment output budget sends no further request`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + terminal(wire, { output: 4096 }) }])
      checkFinal(run, 'stop', 1)
      assert.equal(run.records[0].recoveryScheduled, undefined, 'an insufficient budget must not record recoveryScheduled')
    })
    // The chat wire has no normal ending that has a terminal frame but no tokens: once finish_reason arrives there are tokens, and without a terminal frame it is a cut stream.
    if (wire !== 'chat') {
      await check(`${wire}: a reasoning-only normal ending with no tokens also continues once`, async () => {
        const tokenless = wire === 'messages'
          ? usageFrames('messages') + sse({ type: 'message_stop' })
          : sse({ type: 'response.done', response: {} })
        const run = await drive(model, [
          { body: deltas(wire, { reasoning: CHECKPOINT }) + tokenless },
          { body: deltas(wire, { text: ANSWER }) + terminal(wire) },
        ])
        checkFinal(run, 'stop', 2)
        assert.equal(run.records[0].recoveryScheduled, true, 'a tokenless normal ending must record recoveryScheduled')
        assert.equal(run.records[0].ok, false, 'an empty stop in the first segment must not be recorded as a success')
        assert.equal(run.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), ANSWER, 'the body text must come from the continuation segment')
      })
    }
    await check(`${wire}: with recovery off, the original cut stream is kept`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }], { settings: { streamRecovery: false } })
      checkCut(run, 1)
    })
    await check(`${wire}: body text arriving in the second segment without a terminal frame is still a cut stream`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }, { body: deltas(wire, { text: ANSWER }) }])
      checkCut(run)
    })
  }

  await check('a Responses cancelled terminal state cannot record partial body text from the second segment as a successful recovery', async () => {
    const run = await drive('muse-spark-1.3-contributor-free', [
      { body: deltas('responses', { reasoning: CHECKPOINT }) },
      { body: deltas('responses', { text: ANSWER }) + sse({ type: 'response.done', response: {
        status: 'cancelled', usage: { input_tokens: 11, output_tokens: 7 },
      } }) },
    ])
    checkCut(run)
    assert.ok(run.records.every(row => row.recovered !== true))
  })

  for (const model of ['mimo-v2.6-flash-free', 'union-alpha', 'muse-spark-1.3-contributor-free']) {
    const wire = wireFor(model)
    await check(`${wire}: partial answer followed by an explicit server error cannot replay the turn`, async () => {
      const error = { type: 'server_error', message: 'provider failed' }
      const event = wire === 'responses' ? { type: 'response.failed', response: { status: 'failed', error } } : { type: 'error', error }
      const run = await drive(model, [{ body: deltas(wire, { text: ANSWER }) + sse(event) }])
      checkCut(run, 1)
    })
  }

  await check('EAC no longer has an independent no-progress deadline, including legacy settings', () => {
    for (const value of [undefined, false, { enabled: false }, { progressTimeoutMs: 200 }]) {
      assert.equal(Object.hasOwn(recoveryPolicy(value), 'progressTimeoutMs'), false)
    }
  })

  for (const [label, answer] of [
    ['held headers', { delayMs: 400, body: deltas('chat', { text: ANSWER }) + terminal('chat') }],
    ['heartbeats', { pieces: [...Array(6).fill(': heartbeat\n\n'), deltas('chat', { text: ANSWER }) + terminal('chat')], intervalMs: 80 }],
    ['empty deltas and usage', { pieces: [...Array(6).fill(sse({ choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 1, completion_tokens: 0 } })), deltas('chat', { text: ANSWER }) + terminal('chat')], intervalMs: 80 }],
  ]) await check(`EAC ${label} can wait for an answer beyond the former progress deadline`, async () => {
    const run = await drive('union-alpha', [answer], { entryOverrides: { channel: 'eac' }, settings: { streamRecovery: { enabled: false, progressTimeoutMs: 200 } } })
    checkFinal(run, 'stop', 1)
    assert.ok(run.elapsedMs > 200)
    assert.ok(run.chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === ANSWER))
  })

  for (const recovery of [true, false]) await check(`EAC does not schedule the former 60-second cutoff (recovery=${recovery})`, async () => {
    const originalTimer = globalThis.setTimeout
    let cutoffTimers = 0
    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay === 60000) {
        cutoffTimers++
        return originalTimer(callback, 10, ...args)
      }
      return originalTimer(callback, delay, ...args)
    }
    try {
      const run = await drive('union-alpha', [{
        delayMs: 80, body: deltas('chat', { text: ANSWER }) + terminal('chat'),
      }], { entryOverrides: { channel: 'eac' }, settings: { streamRecovery: recovery } })
      checkFinal(run, 'stop', 1)
      assert.equal(cutoffTimers, 0)
    } finally { globalThis.setTimeout = originalTimer }
  })

  for (const kind of ['text', 'reasoning', 'tool']) await check(`EAC preserves ${kind} across a longer stream`, async () => {
    const pieces = Array.from({ length: 7 }, (_, index) => kind === 'tool'
      ? deltas('chat', { ...(index === 0 ? { toolName: 'test_tool' } : {}), toolArgs: index === 0 ? '{"x":"' : index === 6 ? '"}' : 'x' })
      : deltas('chat', { [kind]: 'progress' }))
    pieces.push(deltas('chat', { text: ANSWER }) + terminal('chat'))
    const run = await drive('union-alpha', [{ pieces, intervalMs: 80 }], { entryOverrides: { channel: 'eac' }, settings: { streamRecovery: { progressTimeoutMs: 200 } } })
    assert.equal(run.scenario.requests.length, 1)
    assert.notEqual(run.finish.kind, 'error')
    assert.ok(run.elapsedMs > 200)
  })

  for (const emptyArguments of [false, true]) await check(`EAC named tool start accepts ${emptyArguments ? 'zero' : 'delayed'} arguments after waiting`, async () => {
    const pieces = [
      ': waiting\n\n',
      deltas('chat', { toolName: TOOL.name }),
      emptyArguments ? terminal('chat', { reason: 'tool_calls' })
        : deltas('chat', { toolArgs: '{}' }) + terminal('chat', { reason: 'tool_calls' }),
    ]
    const run = await drive('union-alpha', [{ pieces, intervalMs: 250 }], {
      entryOverrides: { channel: 'eac' }, settings: { streamRecovery: { enabled: false, progressTimeoutMs: 400 } },
    })
    assert.equal(run.scenario.requests.length, 1)
    assert.notEqual(run.finish.kind, 'error')
    assert.ok(run.chunks.some(chunk => chunk.type === 'block-end' && chunk.block?.type === 'tool-call' && chunk.block.name === TOOL.name))
  })

  await check('EAC waits through a heartbeat-only gap after partial text', async () => {
    const run = await drive('union-alpha', [{ pieces: [deltas('chat', { text: ANSWER }), ...Array(6).fill(': heartbeat\n\n'), terminal('chat')], intervalMs: 80 }], { entryOverrides: { channel: 'eac' }, settings: { streamRecovery: { progressTimeoutMs: 200 } } })
    checkFinal(run, 'stop', 1)
    assert.ok(run.elapsedMs > 200)
    assert.ok(run.chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === ANSWER))
  })

  await check('EAC silent waiting does not advance a combo or duplicate the request', async () => {
    const run = await drive('union-alpha', [
      { pieces: [...Array(6).fill(': heartbeat\n\n'), deltas('chat', { text: ANSWER }) + terminal('chat')], intervalMs: 80 },
    ], { combo: true, entryOverrides: { channel: 'eac' }, settings: { streamRecovery: { enabled: false, progressTimeoutMs: 200 } } })
    checkFinal(run, 'stop', 1)
    assert.ok(run.elapsedMs > 200)
    assert.ok(run.chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === ANSWER))
  })

  await check('caller cancellation stops a combo before its next candidate', async () => {
    const run = await drive('union-alpha', [
      { hold: true },
      { body: deltas('chat', { text: ANSWER }) + terminal('chat') },
    ], { combo: true, entryOverrides: { channel: 'eac' }, options: { signal: AbortSignal.timeout(100) },
      settings: { streamRecovery: { enabled: false, progressTimeoutMs: 500 } } })
    checkFinal(run, 'aborted', 1)
    assert.equal(run.finish.failure.code, 'ABORTED')
  })

  await check('EAC server errors retain failure and do not replay the native turn', async () => {
    const run = await drive('union-alpha', [{ status: 500, body: JSON.stringify({ error: { type: 'server_error', message: 'fixture failure' } }) }], { entryOverrides: { channel: 'eac' } })
    checkFinal(run, 'error', 1)
    assert.equal(run.finish.failure.code, 'EAC_UPSTREAM_FAILED')
    assert.equal(run.adapter.providerRetryPolicy().retryableCodes.includes(run.finish.failure.code), false)
  })

  for (const phase of ['first segment', 'continuation segment']) {
    await check(`Responses ${phase} response.failed missing status must still return a failure`, async () => {
      const failed = sse({ type: 'response.failed', response: { usage: { input_tokens: 11, output_tokens: 7 } } })
      const answers = phase === 'first segment'
        ? [{ body: deltas('responses', { reasoning: CHECKPOINT }) + failed }]
        : [{ body: deltas('responses', { reasoning: CHECKPOINT }) }, { body: deltas('responses', { text: ANSWER }) + failed }]
      const run = await drive('muse-spark-1.3-contributor-free', answers)
      checkCut(run, phase === 'first segment' ? 1 : 2)
      assert.ok(run.records.every(row => row.recovered !== true))
    })
  }

  for (const model of ['mimo-v2.6-flash-free', 'union-alpha']) {
    const wire = wireFor(model)
    await check(`${wire}: known usage is added only once and reduces the continuation budget`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + usageFrames(wire, 20, 100) },
        { body: deltas(wire, { text: ANSWER }) + terminal(wire, { input: 30, output: 40 }) }])
      checkFinal(run, 'stop', 2)
      assert.equal(run.usage.inputTokens, 50)
      assert.equal(run.usage.outputTokens, 140)
      assert.equal(run.usage.totalTokens, 190)
      assert.deepEqual(run.records.map(row => [row.input, row.output]), [[20, 100], [30, 40]])
      assert.ok(run.records.every(row => row.noUsage !== true))
      const ceiling = run.scenario.requests[1].body.max_tokens
      assert.ok(ceiling > 0 && ceiling <= 4096 - 100, 'the continuation budget must deduct the known output of the first segment')
    })
    await check(`${wire}: no continuation when the known output has exhausted the budget`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + usageFrames(wire, 20, 4096) }])
      checkCut(run, 1)
    })
  }

  const model = REPRESENTATIVES[0]
  const wire = wireFor(model)
  for (const [label, answer] of [
    ['HTTP 429', { status: 429, body: '{"error":{"message":"rate limit"}}' }],
    ['HTTP 503', { status: 503, body: '{"error":{"message":"server unavailable"}}' }],
    ['socket reset', { socket: true }],
    ['empty response', { body: '' }],
    ['in-stream error', { body: sse({ type: 'error', error: { type: 'RegionError', message: 'This model is not available in your country.' } }) }],
  ]) {
    await check(`a failed recovery (${label}) does not trigger a whole-turn resend`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }, answer])
      checkCut(run)
    })
  }

  await check('a Chat content_filter terminal state with body text still cannot be marked as a successful recovery', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire, { reason: 'content_filter' }) }])
    checkCut(run)
    assert.ok(run.records.every(row => row.recovered !== true))
  })

  await check('when both segments are missing usage, keep it missing rather than fabricating zero-consumption evidence', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire, { usage: false }) }])
    checkFinal(run, 'stop', 2)
    assert.equal(run.records.length, 2)
    assert.ok(run.records.every(row => row.noUsage === true))
    assert.deepEqual(run.usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, "the host structure stays numeric; the missing usage is recorded by each segment's noUsage")
  })

  for (const [label, tail] of [
    ['tool violation', deltas(wire, { toolName: TOOL.name, toolArgs: '{}' })],
    ['in-stream error', sse({ type: 'error', error: { type: 'FreeUsageLimitError', message: 'Free usage limit reached.' } })],
  ]) {
    await check(`after the continuation usage has arrived, ${label} still keeps the known counts`, async () => {
      const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) + usageFrames(wire, 20, 100) },
        { body: usageFrames(wire, 30, 40) + tail }])
      checkCut(run)
      assert.equal(run.usage.inputTokens, 50)
      assert.equal(run.usage.outputTokens, 140)
      assert.deepEqual(run.records.map(row => [row.input, row.output]), [[20, 100], [30, 40]])
      assert.ok(run.records.every(row => row.noUsage !== true))
      assert.ok(noToolChunks(run.chunks))
    })
  }

  await check('after the first-segment usage has arrived, an in-stream error still keeps the counts and does not enter EOF recovery', async () => {
    const run = await drive(model, [{ body: usageFrames(wire, 20, 100) + deltas(wire, { reasoning: CHECKPOINT })
      + sse({ type: 'error', error: { type: 'FreeUsageLimitError', message: 'Free usage limit reached.' } }) }])
    checkFinal(run, 'error', 1)
    assert.equal(run.usage?.inputTokens, 20)
    assert.equal(run.usage?.outputTokens, 100)
    assert.deepEqual(run.records.map(row => [row.input, row.output]), [[20, 100]])
    assert.ok(run.records.every(row => row.noUsage !== true))
  })

  await check('cancellation from the continuation warning callback after a first-segment EOF still keeps the usage and sends no second HTTP request', async () => {
    const run = await drive(model, [{ body: usageFrames(wire, 20, 100) + deltas(wire, { reasoning: CHECKPOINT }) }],
      { onWarn: (_, controller) => controller.abort(new Error('cancelled between attempts')) })
    checkFinal(run, 'aborted', 1)
    assert.equal(run.finish.failure.code, 'ABORTED')
    assert.equal(run.chunks.filter(chunk => chunk.type === 'usage').length, 1)
    assert.equal(run.usage?.inputTokens, 20)
    assert.equal(run.usage?.outputTokens, 100)
    assert.deepEqual(run.records.map(row => [row.input, row.output]), [[20, 100]])
  })

  for (const phase of ['first segment', 'continuation segment']) {
    await check(`cancelling after the ${phase} usage has arrived still keeps the known counts`, async () => {
      const first = { body: usageFrames(wire, 20, 100) + deltas(wire, { reasoning: CHECKPOINT }), hold: phase === 'first segment' }
      const run = setup(model, [first, { hold: true, body: usageFrames(wire, 30, 40) + deltas(wire, { reasoning: 'CANCEL_WITH_USAGE' }) }])
      const chunks = []
      try {
        for await (const chunk of run.stream) {
          chunks.push(chunk)
          if (chunk.type === 'reasoning-delta' && (phase === 'first segment' || chunk.text === 'CANCEL_WITH_USAGE')) run.controller.abort(new Error('user cancelled after usage'))
        }
        const out = { ...run, chunks, finish: chunks.find(chunk => chunk.type === 'finish')?.reason }
        checkFinal(out, 'aborted', phase === 'first segment' ? 1 : 2)
        assert.ok(run.records.every(row => row.noUsage !== true))
        assert.deepEqual(run.records.map(row => [row.input, row.output]), phase === 'first segment' ? [[20, 100]] : [[20, 100], [30, 40]])
        const usage = chunks.find(chunk => chunk.type === 'usage')?.usage
        assert.equal(usage?.inputTokens, phase === 'first segment' ? 20 : 50)
        assert.equal(usage?.outputTokens, phase === 'first segment' ? 100 : 140)
      } finally { cleanup(run) }
    })
  }

  await check('a checkpoint over capacity cannot be truncated and pass as a complete-checkpoint recovery', async () => {
    const reasoning = 'discarded_prefix_'.repeat(300) + 'KEPT_CHECKPOINT_SUFFIX'
    const run = await drive(model, [{ body: deltas(wire, { reasoning }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire) }], { settings: { streamRecovery: { checkpointLimit: 128 } } })
    checkCut(run, 1)
  })

  await check('the continuation output ceiling can be lowered and the budget actually sent is limited', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire) }], { settings: { streamRecovery: { maxOutputTokens: 600 } } })
    checkFinal(run, 'stop', 2)
    assert.ok(run.scenario.requests[1].body.max_tokens > 0 && run.scenario.requests[1].body.max_tokens <= 600)
  })

  await check('no continuation request is added when the catalog context capacity is insufficient', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire) }], { entryOverrides: { contextWindow: 200 } })
    checkCut(run, 1)
  })

  await check('a recovery config with enabled:false keeps the original cut stream', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }], { settings: { streamRecovery: { enabled: false } } })
    checkCut(run, 1)
  })

  await check('the continuation time limit aborts the in-flight HTTP request and keeps a non-retryable error', async () => {
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) }, { hold: true, body: deltas(wire, { reasoning: 'held recovery' }) }],
      { settings: { streamRecovery: { maxContinuationMs: 80, totalTimeoutMs: 1000 } } })
    checkCut(run)
    assert.ok(run.elapsedMs < 1000, `the continuation did not end on time: ${run.elapsedMs} ms`)
  })

  await check('the whole-turn time limit includes the first segment time and avoids adding a timed-out continuation', async () => {
    const run = await drive(model, [{ hold: true, body: deltas(wire, { reasoning: CHECKPOINT }) }, { body: deltas(wire, { text: ANSWER }) + terminal(wire) }],
      { settings: { streamRecovery: { totalTimeoutMs: 80, maxContinuationMs: 1000 } } })
    checkFinal(run, 'error', 1)
    assert.equal(run.adapter.providerRetryPolicy().retryableCodes.includes(run.finish?.failure?.code), false)
    assert.ok(run.elapsedMs < 1000)
    assert.match(run.finish.failure.message, /^our free model reached its 0s time limit before its finish token$/)
  })

  await check('discarded-content warnings for a recovery turn do not accumulate with the number of payload rebuilds', async () => {
    const notices = []
    const run = await drive(model, [{ body: deltas(wire, { reasoning: CHECKPOINT }) },
      { body: deltas(wire, { text: ANSWER }) + terminal(wire) }], {
      options: { messages: [{ role: 'user', content: [
        { type: 'text', text: TASK }, { type: 'image', attachment: {} }, { type: 'image', attachment: {} },
      ] }] },
      onWarn: message => notices.push(message),
    })
    checkFinal(run, 'stop', 2)
    assert.deepEqual(run.records.map(row => row.warnings?.filter(w => w === 'image-dropped').length), [2, 2],
      'the two dropped images are each recorded once in this turn, and the count does not grow with checkpoint estimates and repeated builds of the continuation segment')
    const dropped = notices.filter(message => message.includes('image-dropped'))
    assert.equal(dropped.length, 1, 'the user-facing dropped-content warning is sent only once')
    assert.equal(dropped[0].split('image-dropped').length - 1, 2, 'the warning text must not accumulate repeatedly')
  })

  for (const phase of ['first segment', 'continuation segment']) {
    await check(`a user cancellation in the ${phase} closes the in-flight HTTP request`, async () => {
      const first = { body: deltas(wire, { reasoning: CHECKPOINT }), hold: phase === 'first segment' }
      const run = setup(model, [first, { hold: true, body: deltas(wire, { reasoning: 'CANCEL_TARGET' }) }])
      const chunks = []
      try {
        for await (const chunk of run.stream) {
          chunks.push(chunk)
          if (chunk.type === 'reasoning-delta' && (phase === 'first segment' || chunk.text === 'CANCEL_TARGET')) run.controller.abort(new Error('user cancelled'))
        }
        const out = { ...run, chunks, finish: chunks.find(chunk => chunk.type === 'finish')?.reason }
        checkFinal(out, 'aborted', phase === 'first segment' ? 1 : 2)
        assert.equal(out.finish.failure.code, 'ABORTED')
        await until(() => run.scenario.responses.size === 0, { what: 'cancellation closes the HTTP connection', timeoutMs: 600 })
      } finally { cleanup(run) }
    })
  }

  await check('generator.return() can cancel the HTTP request a queued next is waiting on', async () => {
    const run = setup(model, [{ hold: true, body: deltas(wire, { reasoning: CHECKPOINT }) }])
    let timer
    try {
      let chunk
      do { chunk = await run.stream.next() } while (!chunk.done && chunk.value.type !== 'reasoning-delta')
      const pending = run.stream.next()
      const returning = run.stream.return()
      await Promise.race([Promise.all([pending, returning]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('return did not cancel the HTTP request being waited on')), 600) })])
      assert.equal(run.scenario.requests.length, 1)
      await until(() => run.scenario.responses.size === 0, { what: 'return closes the HTTP connection', timeoutMs: 600 })
      assert.equal(run.turns.length, 1)
      assert.deepEqual({ ok: run.turns[0].ok, recovered: run.turns[0].recovered, attempts: run.turns[0].attempts }, { ok: false, recovered: false, attempts: 1 })
    } finally { clearTimeout(timer); cleanup(run) }
  })

  await check('cancelling before the first upstream request also records a failed turn', async () => {
    const run = setup(model, [])
    run.controller.abort(new Error('cancelled before request'))
    const chunks = []
    try {
      for await (const chunk of run.stream) chunks.push(chunk)
      checkFinal({ ...run, chunks, finish: chunks.find(chunk => chunk.type === 'finish')?.reason }, 'aborted', 0)
    } finally { cleanup(run) }
  })

  for (const [label, config, code] of [
    ['plugin disabled', { settings: { enabled: false } }, 'CONFIG_DISABLED'],
    ['model not provided by the catalog', { hideModel: true }, 'SERVER'],
  ]) {
    await check(`${label} also records a failed turn with zero physical requests`, async () => {
      const run = await drive(model, [], config)
      checkFinal(run, 'error', 0)
      assert.equal(run.finish.failure.code, code)
      assert.deepEqual(run.turns[0], { at: run.turns[0].at, model, ok: false, recovered: false, attempts: 0, origin: 'harness' })
    })
  }

  const { apply, inject } = await import('../index.js')
  async function withForward(answers, fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-recovery-forward-'))
    const dataDir = path.join(home, 'our-free-model')
    const originalHome = process.env.DSH_HOME
    fs.mkdirSync(dataDir)
    fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
      distribution: 'managed', forward: { enabled: true, host: '127.0.0.1', port: 0 },
    }))
    process.env.DSH_HOME = home
    const scenario = { answers, models: [model], requests: [], responses: new Set(), timers: [], closed: 0 }
    forwardScenario = scenario
    const ctx = fakeContext({ inject, mounted: ['llm', 'webServer'] })
    let api
    try {
      apply(ctx, { distribution: 'managed' })
      await until(() => {
        api = ctx.__captured.serverRoutes.find(route => route.kind === 'prefix')?.handler
        return api !== undefined
      }, { what: 'local plugin settings API', timeoutMs: 3000 })
      let summary
      await until(async () => {
        summary = await callRoute(api, 'GET', '/api/our-free-model/summary')
        return summary.json?.settings?.forward?.running === true
      }, { what: 'Forward started', timeoutMs: 3000 })
      const port = summary.json.settings.forward.actualPort
      const key = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).forwardKey
      const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
      const savedStats = async count => {
        let saved
        await until(() => {
          saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'stats.json'), 'utf8'))
          return saved.samples?.length === count
        }, { what: `${count} physical-request statistics written to disk`, timeoutMs: 3000 })
        return saved
      }
      await fn({ scenario, headers, base: `http://127.0.0.1:${port}`, savedStats })
    } finally {
      if (api) await callRoute(api, 'POST', '/api/our-free-model/settings', { forward: { enabled: false } })
      for (const dispose of ctx.__disposers.reverse()) dispose()
      for (const timer of scenario.timers) clearTimeout(timer)
      for (const response of scenario.responses) response.destroy()
      forwardScenario = undefined
      if (originalHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = originalHome
      fs.rmSync(home, { recursive: true, force: true })
    }
  }
  const requestBody = stream => ({ model, messages: [{ role: 'user', content: TASK }], stream, max_tokens: 4096, reasoning_effort: 'deep' })
  const usageCounters = usage => ({ prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens })
  const ssePayloads = raw => raw.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6))
  for (const wantsStream of [true, false]) {
    await check(`Forward ${wantsStream ? 'SSE' : 'JSON'} returns the continuation body text through the real plugin and saves statistics for both segments`, async () => {
      await withForward([{ body: deltas(wire, { reasoning: CHECKPOINT }) }, { body: deltas(wire, { text: ANSWER }) + terminal(wire) }],
        async ({ base, headers, scenario, savedStats }) => {
        const response = await fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody(wantsStream)),
          signal: AbortSignal.timeout(3000),
        })
        assert.equal(response.status, 200)
        if (wantsStream) {
          const raw = await response.text()
          const payloads = ssePayloads(raw)
          assert.equal(payloads.filter(payload => payload === '[DONE]').length, 1, 'Forward sends exactly one DONE')
          const frames = payloads.filter(payload => payload !== '[DONE]').map(payload => JSON.parse(payload))
          assert.ok(frames.every(frame => frame.error === undefined))
          assert.equal(frames.flatMap(frame => frame.choices ?? []).map(choice => choice.delta?.content ?? '').join(''), ANSWER)
          assert.equal(frames.flatMap(frame => frame.choices ?? []).map(choice => choice.delta?.reasoning ?? '').join(''), CHECKPOINT)
          assert.deepEqual(frames.flatMap(frame => frame.choices ?? []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason), ['stop'])
          assert.deepEqual(frames.filter(frame => frame.usage !== undefined).map(frame => usageCounters(frame.usage)), [{ prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }])
        } else {
          const body = await response.json()
          assert.equal(body.error, undefined)
          assert.equal(body.choices.length, 1)
          assert.equal(body.choices[0].message.content, ANSWER)
          assert.equal(body.choices[0].finish_reason, 'stop')
          assert.deepEqual(usageCounters(body.usage), { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 })
        }
        const requests = scenario.requests
        assert.equal(requests.length, 2, 'Forward actually sends the first segment and the continuation as two requests upstream')
        assert.ok(JSON.stringify(requests[1].body).includes(CHECKPOINT))
        assert.equal(requests[1].body.tool_choice, undefined, 'the v2 gate rejects tool_choice: none; the continuation suppresses tool calls using only the instruction body')
        const saved = await savedStats(2)
        assert.equal(saved.requests, 2)
        assert.deepEqual(saved.samples.map(row => row.attempt), [0, 1])
        assert.equal(saved.samples[0].recoveryId, saved.samples[1].recoveryId)
        assert.equal(saved.samples[0].recoveryScheduled, true)
        assert.equal(saved.samples[0].noUsage, true)
        assert.equal(saved.samples[1].recovered, true)
        assert.equal(saved.samples[1].recoveryAttempt, true)
        assert.deepEqual(saved.samples.map(row => [row.input, row.output]), [[0, 0], [11, 7]])
      })
    })
  }

  for (const [endpoint, wantsStream] of [['/v1/chat/completions', true], ['/v1/chat/completions', false], ['/v1/responses', false]]) {
    for (const [label, tail] of [['EOF', ''], ['in-stream error', sse({ type: 'error', error: { type: 'FreeUsageLimitError', message: 'Free usage limit reached.' } })]]) {
      await check(`Forward ${endpoint} ${wantsStream ? 'SSE' : 'JSON'} cannot return a normal completion after partial body text followed by ${label}`, async () => {
        await withForward([{ body: deltas(wire, { reasoning: CHECKPOINT }) }, { body: usageFrames(wire) + deltas(wire, { text: ANSWER }) + tail }],
          async ({ base, headers, scenario, savedStats }) => {
          const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers,
            body: JSON.stringify(requestBody(wantsStream)), signal: AbortSignal.timeout(3000) })
          if (wantsStream) {
            assert.equal(response.status, 200, 'the SSE HTTP headers have already been sent')
            const payloads = ssePayloads(await response.text())
            assert.equal(payloads.filter(payload => payload === '[DONE]').length, 1)
            const frames = payloads.filter(payload => payload !== '[DONE]').map(payload => JSON.parse(payload))
            assert.equal(frames.flatMap(frame => frame.choices ?? []).map(choice => choice.delta?.content ?? '').join(''), ANSWER)
            assert.equal(frames.filter(frame => frame.error !== undefined).length, 1, 'exactly one explicit error must be sent')
            assert.ok(!frames.flatMap(frame => frame.choices ?? []).some(choice => choice.finish_reason === 'stop'), 'a normal stop must not be added after the error')
          } else {
            assert.equal(response.status, 502)
            const body = await response.json()
            assert.equal(body.error?.type, 'server_error')
            assert.notEqual(body.status, 'completed')
            assert.equal(body.choices, undefined)
          }
          assert.equal(scenario.requests.length, 2)
          const saved = await savedStats(2)
          assert.ok(saved.samples.every(row => row.recovered !== true))
          assert.deepEqual(saved.samples.map(row => [row.input, row.output]), [[0, 0], [11, 7]])
        })
      })
    }
  }

  for (const wantsStream of [true, false]) {
    for (const phase of ['first segment', 'continuation segment']) {
      await check(`Forward ${wantsStream ? 'SSE' : 'JSON'} a client disconnect in the ${phase} closes upstream immediately and does not continue`, async () => {
        const first = { body: deltas(wire, { reasoning: CHECKPOINT }), hold: phase === 'first segment' }
        await withForward([first, { hold: true, body: deltas(wire, { reasoning: 'CANCEL_TARGET' }) }],
          async ({ base, headers, scenario, savedStats }) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(new Error('test timed out')), 3000)
          const pending = fetch(`${base}/v1/chat/completions`, { method: 'POST', headers,
            body: JSON.stringify(requestBody(wantsStream)), signal: controller.signal })
            .then(async response => ({ text: await response.text() })).catch(error => ({ error }))
          try {
            const count = phase === 'first segment' ? 1 : 2
            await until(() => scenario.requests.length === count && scenario.responses.size === 1,
              { what: `the real upstream connection for the ${phase} is in flight`, timeoutMs: 1000 })
            controller.abort()
            const result = await pending
            assert.equal(result.error?.name, 'AbortError')
            await until(() => scenario.responses.size === 0, { what: 'client cancellation closes the real upstream connection', timeoutMs: 600 })
            const saved = await savedStats(count)
            assert.equal(saved.requests, count)
            assert.ok(saved.samples.every(row => row.recovered !== true))
            assert.equal(scenario.requests.length, count, 'no recovery request may be added after cancellation')
          } finally { clearTimeout(timeout); controller.abort(); await pending }
        })
      })
    }
  }
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}

console.log(`\nrecovery: ${checks - failures}/${checks} checks passed`)
process.exitCode = failures === 0 ? 0 : 1
