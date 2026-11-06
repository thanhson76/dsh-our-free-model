/** An egress change only invalidates old measurements; it must not probe automatically or restore late old verdicts. */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stubUpstream } from './lib/fake-kernel.mjs'

let probeAnswer
const upstream = await stubUpstream({ answer: () => probeAnswer() })
process.env.OUR_FREE_MODEL_BASE = upstream.base
const { createRuntimeStores, createModelRuntime } = await import('../src/core/runtime.js')
const { modelAvailability } = await import('../src/model-test.js')
const { CODE } = await import('../src/http.js')
after(() => upstream.close())

const id = 'mimo-v2.6-flash-free'
const other = 'space-bunny-free'
const originalFetch = globalThis.fetch
const stop = { type: 'finish', reason: { kind: 'stop' } }
const answer = async function* () { yield { type: 'text-delta', text: 'OK' }; yield stop }
const gate = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-egress-availability-'))
  const stores = createRuntimeStores({ dataDir, logger: { warn() {} } })
  stores.settings.update({ enabled: true, exposeRegionModels: false, combos: [] })
  stores.catalogStore.update({ entries: [id, other] })
  stores.availability.update({
    egress: { ip: '198.51.100.1' }, at: 1234,
    results: { [id]: { state: 'region-blocked', detail: 'Old egress restricted', at: 1234 }, [other]: { state: 'available', at: 1234 } },
    manualResults: { [other]: { state: 'available', source: 'manual', at: 2345 } },
  })
  let changes = 0
  let ip = '198.51.100.2'
  const requests = []
  globalThis.fetch = (url, init) => {
    const address = String(url)
    requests.push(address)
    if (new URL(address).hostname === 'api.ipify.org') return Promise.resolve(Response.json({ ip }))
    assert.ok(address.startsWith(upstream.base + '/'), `must not request the external network: ${address}`)
    return originalFetch(url, init)
  }
  const runtime = createModelRuntime({ ...stores, logger: { info() {}, warn() {} }, onTopology: () => { changes++ } })
  return {
    dataDir, stores, runtime, requests, get changes() { return changes }, setIp(value) { ip = value },
    advertised: () => Object.values(runtime.state().membership).flat(),
    close() { globalThis.fetch = originalFetch; runtime.dispose(); stores.dispose(); fs.rmSync(dataDir, { recursive: true, force: true }) },
  }
}

test('switching egress restores models hidden by an old region verdict; historical measurements are kept, still invalid after a restart, and no probe is sent', async () => {
  const f = fixture()
  try {
    assert.ok(!f.advertised().includes(id))
    await f.runtime.watchEgress()
    assert.ok(f.advertised().includes(id))
    assert.equal(f.changes, 1, 'the picker should be notified to recompute the model groups')
    assert.equal(f.requests.length, 1)
    assert.match(f.requests[0], /ipify/)
    const saved = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'availability.json'), 'utf8'))
    assert.equal(saved.at, 0)
    assert.equal(saved.results[id].state, 'region-blocked')
    assert.equal(saved.results[id].stale, true)
    assert.equal(saved.manualResults[other].stale, true)
    const reopened = createRuntimeStores({ dataDir: f.dataDir })
    try {
      assert.equal(modelAvailability(id, reopened.availability.get()).availability, 'unknown')
      assert.equal(modelAvailability(other, reopened.availability.get()).availability, 'unknown')
    } finally { reopened.dispose() }
    f.runtime.adapter.stream = answer
    assert.equal((await f.runtime.testModel(id)).persisted, true)
    assert.equal(modelAvailability(id, f.stores.availability.get()).availability, 'available')
    assert.equal(modelAvailability(id, f.stores.availability.get()).availabilitySource, 'manual')
  } finally { f.close() }
})

test('the same egress keeps valid measurements, sends no probe, and does not notify the picker again', async () => {
  const f = fixture()
  try {
    f.setIp('198.51.100.1')
    const previous = structuredClone(f.stores.availability.get())
    await f.runtime.watchEgress()
    assert.deepEqual(f.stores.availability.get(), previous)
    assert.equal(f.changes, 0)
    assert.equal(f.requests.length, 1)
  } finally { f.close() }
})

test('an in-flight manual measurement from the old egress cannot overwrite the new egress result', async () => {
  const f = fixture()
  const started = gate(), release = gate()
  let running
  try {
    f.runtime.adapter.stream = async function* () { started.resolve(); await release.promise; yield* answer() }
    running = f.runtime.testModel(id)
    const rejected = assert.rejects(running, error => error.code === CODE.aborted && /egress changed/.test(error.message))
    await started.promise
    await f.runtime.watchEgress()
    f.runtime.adapter.stream = answer
    await f.runtime.testModel(id)
    const saved = structuredClone(f.stores.availability.get().manualResults[id])
    release.resolve()
    await rejected
    assert.deepEqual(f.stores.availability.get().manualResults[id], saved)
  } finally { release.resolve(); await running?.catch(() => {}); f.close() }
})

test('a late failure from the old egress cannot be written into the new egress cache', async () => {
  const f = fixture()
  const started = gate(), release = gate()
  let running
  try {
    f.runtime.adapter.stream = async function* () { started.resolve(); await release.promise; throw new Error('Old egress failed') }
    running = f.runtime.testModel(id)
    const rejected = assert.rejects(running, /Old egress failed/)
    await started.promise
    await f.runtime.watchEgress()
    const saved = structuredClone(f.stores.availability.get())
    release.resolve()
    await rejected
    assert.deepEqual(f.stores.availability.get(), saved)
  } finally { release.resolve(); await running?.catch(() => {}); f.close() }
})

test('a manual probe on the new egress does not merge into the old round, and completing an old HTTP probe does not restore a stale verdict', async () => {
  const f = fixture()
  const started = gate(), release = gate()
  let running
  try {
    // Switch egress only after both old HTTP requests have arrived, instead of relying on timing luck.
    let oldRequests = 0
    probeAnswer = () => {
      oldRequests++
      if (oldRequests === 2) started.resolve()
      return { status: 400, body: JSON.stringify({ error: { message: 'Model is unavailable.' } }), wait: release.promise }
    }
    running = f.runtime.refreshAvailability(true)
    await started.promise
    await f.runtime.watchEgress()
    probeAnswer = () => ({ status: 400, body: JSON.stringify({ error: { message: 'Model is unavailable.' } }) })
    const newer = f.runtime.refreshAvailability(true)
    const deadline = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('The new egress probe wrongly waited for the old round')), 3000)
      timer.unref()
      newer.finally(() => clearTimeout(timer)).catch(() => {})
    })
    await Promise.race([newer, deadline])
    const saved = structuredClone(f.stores.availability.get())
    assert.equal(modelAvailability(id, saved).availability, 'unavailable')
    release.resolve()
    await running
    assert.deepEqual(f.stores.availability.get(), saved)
  } finally { release.resolve(); await running?.catch(() => {}); f.close() }
})
