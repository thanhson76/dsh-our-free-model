/**
 * Cross-day inspection: a resident process that passes midnight must still
 * make up a check-in round.
 *
 * Only tests "when runIfDue should be called", without touching real
 * channels — `claim()` is a stub that counts calls, and the assertions are
 * on the observable call counts rather than the internal implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const sourceRoot = new URL('../vendor/channel-pack/src/', import.meta.url).href
const kernel = new URL('./lib/channel-pack-kernel.mjs', import.meta.url).href
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-checkin-tick-'))
process.env.DSH_CHANNEL_PACK_HOME = scratch

// Use typescript's transpileModule rather than Node's built-in strip: the
// latter does not support constructor parameter properties (which
// channel-pack-store in the dependency chain uses) and throws
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX outright.
const ts = (await import('typescript')).default

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@deepseek-ai/')) return { url: kernel, shortCircuit: true }
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const target = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (fs.existsSync(target)) return { url: target.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: fileURLToPath(url),
      }).outputText,
    }
    return nextLoad(url, context)
  },
})

const { createAutoCheckin, AUTO_CHECKIN_TICK_MS, AUTO_CHECKIN_RETRY_MS } =
  await import('../vendor/channel-pack/src/auto-checkin.ts')

let checks = 0
const check = async (name, run) => {
  await run()
  checks++
  console.log(`ok   ${name}`)
}

const EMPTY_DOC = () => ({
  enabled: true, lastDate: '', lastResult: '', lastAt: 0,
  channels: [], todayDate: '', today: [], dismissedRunAt: 0,
})

/** A moment in UTC+8 → a millisecond timestamp (avoids hand-computing time zones). */
const utc8 = (date, hour = 12) => Date.parse(`${date}T00:00:00+08:00`) + hour * 3_600_000

function harness({ doc = {}, clock = utc8('2026-10-27', 16) } = {}) {
  const state = { clock, claims: [], providers: ['fixture'], listCalls: 0, listFailure: false }
  const stored = { ...EMPTY_DOC(), ...doc }
  const timers = { start: null, tick: null }
  const checkin = createAutoCheckin({
    store: { load: () => stored, save: value => Object.assign(stored, value), flush() {} },
    now: () => state.clock,
    listProviderIds: async () => {
      state.listCalls++
      if (state.listFailure) throw new Error('fixture enumeration failed')
      return state.providers
    },
    claim: async provider => {
      state.claims.push(provider)
      // coversToday=false → lastDate is not recorded, which is exactly what lets us observe the backoff
      return { ok: true, value: { summary: { claimed: 1, coversToday: false }, accounts: [] } }
    },
    delayMs: 0,
    tickMs: 1_000,
    schedule: fn => { timers.start = fn; return { cancel() {} } },
    scheduleTick: (fn, ms) => { timers.tick = { fn, ms, cancelled: false }; return { cancel() { timers.tick.cancelled = true; timers.tick = null } } },
    warn() {},
  })
  return { checkin, stored, timers, state }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

await check('start() installs the cross-day inspection, with the interval taken from tickMs', async () => {
  const { checkin, timers } = harness()
  checkin.start()
  assert.ok(timers.tick !== null, 'start() must schedule the inspection')
  assert.equal(timers.tick.ms, 1_000)
  checkin.stop()
})

await check('stop() cancels the inspection and leaves no dangling timer', async () => {
  const { checkin, timers } = harness()
  checkin.start()
  const scheduled = timers.tick
  checkin.stop()
  assert.equal(scheduled.cancelled, true, 'stop() must actually cancel the inspection')
  assert.equal(timers.tick, null)
})

await check('tickMs=0 schedules no inspection (the host does not need to stay resident)', async () => {
  let scheduled = null
  const checkin = createAutoCheckin({
    store: { load: EMPTY_DOC, save() {}, flush() {} },
    now: () => utc8('2026-10-27'),
    listProviderIds: async () => [], claim: async () => ({ ok: true, value: {} }),
    delayMs: 0, tickMs: 0,
    schedule: () => ({ cancel() {} }),
    scheduleTick: fn => { scheduled = fn; return { cancel() {} } },
    warn() {},
  })
  checkin.start()
  assert.equal(scheduled, null, 'tickMs=0 means the inspection is disabled')
  checkin.stop()
})

await check('already ran successfully today → the inspection does not hit upstream again', async () => {
  const { checkin, timers, state } = harness({
    doc: { lastDate: '2026-10-27', lastAt: utc8('2026-10-27', 9) },
    clock: utc8('2026-10-27', 16),
  })
  checkin.start()
  state.clock = utc8('2026-10-27', 20)
  timers.tick.fn()
  await settle()
  assert.deepEqual(state.claims, [], 'already succeeded today, so the inspection must not call claim again')
  checkin.stop()
})

await check('after the day rolls over, the inspection makes up a round', async () => {
  const { checkin, timers, state } = harness({
    doc: { lastDate: '2026-10-26', lastAt: utc8('2026-10-26', 9) },
    clock: utc8('2026-10-27', 1),
  })
  checkin.start()
  state.clock = utc8('2026-10-28', 1)
  timers.tick.fn()
  await settle()
  assert.deepEqual(state.claims, ['fixture'], 'entering a new day must trigger a make-up run')
  checkin.stop()
})

await check('tried today but failed → no more upstream calls during the backoff window', async () => {
  const start = utc8('2026-10-27', 9)
  const { checkin, timers, state } = harness({ clock: start })
  checkin.start()
  await settle()
  // start() with delayMs=0 ran a round immediately; claim returned
  // coversToday=false, so lastDate is still empty and lastAt stays at
  // 09:00 — exactly the shape of "tried today but failed".
  assert.deepEqual(state.claims, ['fixture'], 'precondition: one round has already been tried')
  const tried = state.claims.length
  state.clock = start + 10 * 60_000
  timers.tick.fn()
  await settle()
  assert.equal(state.claims.length, tried, 'no retry during the backoff window (<1h)')
  checkin.stop()
})

await check('past the backoff floor → the inspection may retry', async () => {
  const start = utc8('2026-10-27', 9)
  const { checkin, timers, state } = harness({ clock: start })
  checkin.start()
  await settle()
  const tried = state.claims.length
  state.clock = start + AUTO_CHECKIN_RETRY_MS + 60_000
  timers.tick.fn()
  await settle()
  assert.equal(state.claims.length, tried + 1, 'a retry should be allowed after more than 1 hour')
  checkin.stop()
})

await check('when automatic check-in is off the inspection makes no requests, and it runs normally after re-enabling', async () => {
  const { checkin, timers, state } = harness({ doc: { enabled: false } })
  checkin.start()
  timers.tick.fn()
  await settle()
  assert.equal(state.listCalls, 0)
  await checkin.setEnabled(true)
  assert.deepEqual(state.claims, ['fixture'])
  checkin.stop()
})

await check('channel enumeration errors are also protected by backoff, so unpersisted results do not cause repeated retries', async () => {
  const start = utc8('2026-10-27', 9)
  const { checkin, timers, state } = harness({ clock: start })
  state.listFailure = true
  checkin.start()
  await settle()
  assert.equal(state.listCalls, 1)
  state.clock = start + 10 * 60_000
  timers.tick.fn()
  await settle()
  assert.equal(state.listCalls, 1)
  state.clock = start + AUTO_CHECKIN_RETRY_MS
  timers.tick.fn()
  await settle()
  assert.equal(state.listCalls, 2)
  checkin.stop()
})

await check('the default constants match the design (inspection 2.5h, backoff 1h)', async () => {
  assert.equal(AUTO_CHECKIN_TICK_MS, 150 * 60 * 1000)
  assert.equal(AUTO_CHECKIN_RETRY_MS, 60 * 60 * 1000)
})

console.log(`\n${checks} cross-day inspection checks passed`)
fs.rmSync(scratch, { recursive: true, force: true })
