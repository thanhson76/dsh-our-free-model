import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { verifyLoginLaunchers, verifyLoginTerminal } from './standalone-login-terminal-test.mjs'

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-management-'))
const dataDir = path.join(scratch, 'data')
const model = 'mimo-v2.6-flash-free'
const kilo = 'nvidia/nemotron-3.5-lightning:free'
let calls = 0
let failedListing = ''
let emptyFreeListing = false
let holdNextCall = false
let notifyCall
let notifyClosed
const upstream = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    if (req.method === 'GET') {
      const source = req.url === '/models' ? 'kilo' : 'free'
      if (failedListing === source) {
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Simulated listing refresh failure' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: source === 'kilo'
        ? [{ id: kilo, isFree: true, name: 'Test free model' }]
        : emptyFreeListing ? [] : [{ id: model }] }))
    } else {
      calls++
      if (holdNextCall) {
        holdNextCall = false
        res.once('close', () => notifyClosed())
        notifyCall()
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end([
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'OK' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 7 } })}\n\n`,
        'data: [DONE]\n\n',
      ].join(''))
    }
  })
})
upstream.listen(0, '127.0.0.1')
await once(upstream, 'listening')
const base = `http://127.0.0.1:${upstream.address().port}`
process.env.OUR_FREE_MODEL_BASE = base
process.env.OUR_FREE_MODEL_KILO_BASE = base
const { startStandalone } = await import('../packages/standalone/service.mjs')
let service
let cookie
let key
let failures = 0
let checks = 0
const check = async (name, run) => {
  checks++
  try { await run(); console.log(`ok   ${name}`) }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.stack}`) }
}
const getKey = () => JSON.parse(fs.readFileSync(service.keyFile, 'utf8')).forwardKey
const request = async (route, { body, cookie: cookieValue = cookie, headers = {}, method } = {}) => {
  if (headers.host) {
    // fetch sets Host itself; use a real HTTP request to verify a malicious Host, without mistaking client normalization for it.
    return new Promise((resolve, reject) => {
      const raw = http.request(service.url + route, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { cookie: cookieValue ?? '', 'content-type': 'application/json', ...headers },
      }, res => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode }))
      })
      raw.once('error', reject)
      raw.end(body === undefined ? undefined : JSON.stringify(body))
    })
  }
  const response = await fetch(service.url + route, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...cookieValue ? { cookie: cookieValue } : {},
      ...body === undefined ? {} : { 'content-type': 'application/json' },
      connection: 'close',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  return response
}
const login = async body => {
  const response = await request('/api/management/session', { body, cookie: '' })
  assert.equal(response.status, 200)
  const setCookie = response.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  assert.match(setCookie, /Path=\/api\/management/)
  return setCookie.split(';')[0]
}

try {
  await check('macOS and Windows pinned launchers quote paths safely; the token is copied only via stdin', verifyLoginLaunchers)
  await check('the local token endpoint restricts origin and parameters, rejects concurrency, and leaks no key or creates a session', verifyLoginTerminal)
  service = await startStandalone({ dataDir, port: 0, refresh: false, logger: { warn() {} } })
  key = getKey()
  await check('page assets are served locally and contain no key; the health endpoint stays compatible', async () => {
    const page = await request('/', { cookie: '' })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    const body = await page.text()
    assert.match(body, /Local Console/)
    assert.match(page.headers.get('content-security-policy'), /script-src 'self';/)
    const scripts = [...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    assert.ok(scripts.length > 0)
    assert.ok(scripts.every(([, attributes, content]) => /\bsrc=/.test(attributes) && !content.trim()),
      'management page scripts must load as same-origin external resources, not inline scripts that CSP forbids')
    const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'unsupported'
    assert.ok(body.includes(`data-login-platform="${platform}"`))
    assert.ok(!body.includes(key))
    const manifest = JSON.parse(fs.readFileSync(new URL('../packages/standalone/web/assets.json', import.meta.url), 'utf8'))
    assert.ok(manifest.includes('app.js') && manifest.includes('app.css'))
    assert.ok(manifest.some(name => /^channels-.+\.js$/.test(name)))
    for (const asset of manifest) {
      const response = await request(`/assets/${asset}`, { cookie: '' })
      assert.equal(response.status, 200, asset)
      assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/)
      assert.ok(!(await response.text()).includes(key), asset)
      assert.equal((await request(`/assets/${asset}`, { method: 'HEAD' })).status, 200)
      assert.equal((await request(`/assets/${asset}`, { method: 'POST' })).status, 405)
    }
    for (const route of ['/assets/settings.json', '/assets/assets.json', '/assets/unknown.js', '/frontend/app.tsx', '/assets/%2e%2e%2fservice.mjs']) {
      assert.equal((await request(route, { cookie: '', headers: { authorization: `Bearer ${key}` } })).status, 404, route)
    }
    const health = await (await request('/health')).json()
    assert.equal(health.product, 'standalone')
    assert.equal(health.capabilities.webUi, true)
  })
  await check('all management data and actions require login; OPTIONS does not allow cross-origin', async () => {
    for (const route of ['summary', 'stats', 'key']) assert.equal((await request(`/api/management/${route}`, { cookie: '' })).status, 401)
    for (const route of ['settings', 'key/rotate', 'models/refresh', 'models/test']) {
      assert.equal((await request(`/api/management/${route}`, { body: {}, cookie: '' })).status, 401)
    }
    const response = await request('/api/management/settings', { cookie: '', method: 'OPTIONS' })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })
  await check('a one-time link redeems only once; a wrong credential does not consume a valid one', async () => {
    const bootstrapToken = new URLSearchParams(new URL(service.managementUrl).hash.slice(1)).get('login')
    assert.ok(bootstrapToken)
    assert.ok(!service.managementUrl.includes(key))
    assert.equal((await request('/api/management/session', { cookie: '', body: { bootstrapToken: 'wrong' } })).status, 401)
    cookie = await login({ bootstrapToken })
    assert.equal((await request('/api/management/session', { cookie: '', body: { bootstrapToken } })).status, 401)
    const secondCookie = await login({ key })
    assert.notEqual(cookie, secondCookie)
  })
  await check('summary and statistics leak no key; a management session cannot call the inference endpoints', async () => {
    const response = await request('/api/management/summary')
    assert.equal(response.status, 200)
    const summary = await response.json()
    assert.equal(summary.dataDir, dataDir)
    assert.equal(summary.automaticRefresh, false)
    assert.equal(summary.networkMode, 'live')
    assert.equal(summary.capabilities.eac, true)
    assert.ok(!JSON.stringify(summary).includes(key))
    const stats = await (await request('/api/management/stats')).json()
    assert.equal(stats.requests, 0)
    assert.ok(!JSON.stringify(stats).includes(key))
    assert.equal((await request('/v1/models')).status, 401)
    assert.equal((await request('/api/management/summary', { cookie: '', headers: { authorization: `Bearer ${key}` } })).status, 200)
  })
  await check('same-origin protection covers login, reads and writes, and rejects forged Host and plugin origins', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      { origin: 'http://127.0.0.1:1' },
      { referer: 'http://evil.example/' },
      { referer: 'dsh-app://app' },
      { 'sec-fetch-site': 'cross-site' },
      { host: 'evil.example' },
    ]) {
      assert.equal((await request('/api/management/summary', { headers })).status, 403, JSON.stringify(headers))
      assert.equal((await request('/api/management/settings', { headers, body: { enabled: false } })).status, 403)
      assert.equal((await request('/api/management/session', { headers, body: { key } })).status, 403)
    }
    const response = await request('/api/management/settings', { body: {}, headers: { origin: service.url, referer: `${service.url}/` } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })
  await check('settings strictly validate field types, ranges and the request body, with no partial saves', async () => {
    for (const body of [
      null, [], { enabled: 'false' }, { enabled: false, unknown: 1 },
      { forwardKey: 'injected' }, { standalonePort: 80 }, { defaultMaxTokens: 0 },
      { defaultMaxTokens: 131073 }, { probeIntervalMinutes: 0 },
      { probeIntervalMinutes: 1441 }, { probeIntervalMinutes: '15' },
      { standaloneProbe: {} }, { enabled: false, probeIntervalMinutes: 0 },
      { hideFreeModels: 'true' }, { hideEacModels: 1 }, { hiddenModelIds: null },
      { hiddenModelIds: [1] }, { hiddenModelIds: [''] }, { hiddenModelIds: [' x'] },
      { hiddenModelIds: ['x\n'] }, { hiddenModelIds: ['x'.repeat(301)] },
      { hiddenModelIds: Array(1001).fill('model') },
      { enabled: false, hiddenModelIds: [false] },
    ]) assert.equal((await request('/api/management/settings', { body })).status, 400)
    assert.equal(getKey(), key)
    assert.equal(service.runtime.state().settings.enabled, true)
    const malformed = await fetch(service.url + '/api/management/settings', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{',
    })
    assert.equal(malformed.status, 400)
    assert.equal((await request('/api/management/settings', { body: {}, headers: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await request('/api/management/settings', { body: { huge: 'x'.repeat(17000) } })).status, 413)
  })
  await check('saved settings persist immediately; the management page can resume the service while inference is paused', async () => {
    const patch = { enabled: false, exposeRegionModels: false, streamRecovery: false, standaloneProbe: true, defaultMaxTokens: 8192, probeIntervalMinutes: 12 }
    assert.equal((await request('/api/management/settings', { body: patch })).status, 200)
    const saved = JSON.parse(fs.readFileSync(service.keyFile, 'utf8'))
    for (const [name, value] of Object.entries(patch)) assert.equal(saved[name], value)
    assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).status, 503)
    assert.equal((await request('/')).status, 200)
    assert.equal((await request('/api/management/summary')).status, 200)
    const before = calls
    assert.equal((await request('/api/management/models/test', { body: { model } })).status, 503)
    assert.equal(calls, before)
    assert.equal((await request('/api/management/settings', { body: { enabled: true } })).status, 200)
    assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).status, 200)
  })
  await check('a persistence failure does not claim success and keeps the original configuration and key', async () => {
    const nativeRename = fs.renameSync
    fs.renameSync = (source, target) => {
      if (target === service.keyFile) throw Object.assign(new Error('Simulated unwritable disk'), { code: 'EACCES' })
      return nativeRename(source, target)
    }
    try {
      assert.equal((await request('/api/management/settings', { body: { enabled: false } })).status, 500)
      assert.equal(service.runtime.state().settings.enabled, true)
      assert.equal((await request('/api/management/key/rotate', { body: { confirm: true } })).status, 500)
      assert.equal(service.runtime.state().settings.forwardKey, key)
      assert.equal(getKey(), key)
    } finally { fs.renameSync = nativeRename }
    assert.equal((await request('/api/management/settings', { body: { enabled: true } })).status, 200)
  })
  await check('refresh does not infer by default; active probing and single-model tests run the core and write statistics', async () => {
    const before = calls
    assert.equal((await request('/api/management/models/refresh', { body: {} })).status, 200)
    assert.equal(calls, before)
    const models = (await (await request('/api/management/summary')).json()).catalog
    assert.deepEqual(models.map(row => row.id), [model, kilo])
    assert.equal((await request('/api/management/models/refresh', { body: { probe: true } })).status, 200)
    assert.equal(calls, before + 1)
    assert.equal((await request('/api/management/models/refresh', { body: { probe: 'yes' } })).status, 400)
    const tested = await request('/api/management/models/test', { body: { model } })
    assert.equal(tested.status, 200)
    const testResult = await tested.json()
    assert.equal(testResult.text, 'OK')
    assert.equal(testResult.persisted, true)
    const measured = (await (await request('/api/management/summary')).json()).catalog.find(row => row.id === model)
    assert.equal(measured.availabilitySource, 'manual')
    assert.equal(measured.availability, 'available')
    assert.equal(measured.ttftMs, testResult.ttftMs)
    assert.equal(measured.latencyMs, testResult.totalMs)
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'availability.json'), 'utf8'))
    assert.equal(saved.manualResults[model].ttftMs, testResult.ttftMs)
    assert.equal(calls, before + 2)
    assert.equal((await request('/api/management/models/test', { body: { model: 'missing' } })).status, 404)
    assert.equal(calls, before + 2)
    const stats = await (await request('/api/management/stats')).json()
    assert.equal(stats.requests, 1)
    assert.equal(stats.turns, 1)
    assert.equal(stats.grand.input, 11)
    assert.equal(stats.grand.output, 7)
  })
  await check('refresh reports failures and retained row counts per source, and leaves no failure state after recovery', async () => {
    const before = calls
    const refresh = async () => {
      const response = await request('/api/management/models/refresh', { body: {} })
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.deepEqual(result.catalog.map(row => row.id), [model, kilo])
      assert.equal(result.dataDir, dataDir)
      assert.ok(!JSON.stringify(result).includes(key))
      return result.sources
    }
    try {
      for (const source of ['free', 'kilo']) {
        failedListing = source
        const sources = await refresh()
        assert.deepEqual(sources[source], { ok: false, count: 1 })
        assert.deepEqual(sources[source === 'free' ? 'kilo' : 'free'], { ok: true, count: 1 })
        assert.deepEqual(sources.sealed, { ok: true, count: 0, skipped: true })
      }
      failedListing = ''
      emptyFreeListing = true
      assert.deepEqual((await refresh()).free, { ok: false, count: 1 })
      emptyFreeListing = false
      const sources = await refresh()
      assert.deepEqual(sources.free, { ok: true, count: 1 })
      assert.deepEqual(sources.kilo, { ok: true, count: 1 })
      assert.equal(calls, before, 'a listing failure must not trigger inference or probing')
    } finally { failedListing = ''; emptyFreeListing = false }
  })
  await check('account-channel refresh returns failures, row counts and recovery results per provider', async () => {
    const channelDir = path.join(scratch, 'channel-refresh')
    fs.mkdirSync(channelDir, { recursive: true })
    const fixtureFile = path.join(channelDir, 'refresh-fixture.json')
    const fixture = {
      trae: { models: [{ id: 'fixture-trae', name: 'TRAE test model' }] },
      qodercn: { models: [{ id: 'fixture-qoder', name: 'Qoder test model' }] },
    }
    const save = () => fs.writeFileSync(fixtureFile, JSON.stringify(fixture))
    save()
    const argv = [...process.execArgv]
    let instance
    try {
      process.execArgv.push('--import', new URL('./lib/standalone-refresh-fixture.mjs', import.meta.url).href)
      instance = await startStandalone({ dataDir: channelDir, port: 0, refresh: false, logger: { warn() {} } })
      await instance.ready
      const forwardKey = JSON.parse(fs.readFileSync(instance.keyFile, 'utf8')).forwardKey
      for (const failed of [false, true, false]) {
        fixture.trae.fail = failed
        save()
        const response = await fetch(instance.url + '/api/management/models/refresh', {
          method: 'POST', headers: { authorization: `Bearer ${forwardKey}`, 'content-type': 'application/json' },
          body: '{}', signal: AbortSignal.timeout(10000),
        })
        assert.equal(response.status, 200)
        const result = await response.json()
        assert.deepEqual(result.sources.trae, { ok: !failed, count: failed ? 0 : 1 })
        assert.deepEqual(result.sources.qodercn, { ok: true, count: 1 })
        assert.deepEqual(result.sources.free, { ok: true, count: 1 })
        assert.equal(result.catalog.filter(row => row.channel === 'trae').length, failed ? 0 : 1)
        assert.equal(JSON.stringify(result).includes('fixture-private-token'), false)
      }
      const listing = instance.channels.refresh()
      const report = instance.channels.refresh({ report: true })
      assert.ok(Array.isArray(await listing), 'existing channel calls still return a model array')
      assert.deepEqual((await report).sources.trae, { ok: true, count: 1 })
    } finally {
      process.execArgv.splice(0, process.execArgv.length, ...argv)
      await instance?.close()
    }
  })
  await check('when authorization switches before the EAC listing succeeds or fails, it returns skipped and does not overwrite the current catalog', async () => {
    const { createRuntimeStores, createModelRuntime } = await import('../src/core/runtime.js')
    const { lane } = await import('../src/eac.js')
    const stores = createRuntimeStores({ dataDir: path.join(scratch, 'sealed-refresh'), logger: { warn() {} } })
    stores.catalogStore.update({ sealIds: ['fixture-cached'] })
    let credential = { mode: 'direct', base, apiKey: 'fixture-sealed-key', userToken: 'fixture-old-user' }
    const runtime = createModelRuntime({ ...stores, sealedCredential: () => credential, logger: { warn() {} } })
    const cached = runtime.catalog.filter(row => row.channel === 'eac').map(row => row.id)
    const originalFetch = lane.fetch
    try {
      assert.equal(cached.length, 1)
      for (const failed of [false, true]) {
        credential = { ...credential, userToken: 'fixture-old-user' }
        lane.fetch = async () => {
          credential = { ...credential, userToken: 'fixture-new-user' }
          return new Response(JSON.stringify(failed ? { error: { message: 'refused' } } : { data: [{ id: 'fixture-stale' }] }), { status: failed ? 401 : 200 })
        }
        const result = await runtime.refreshCatalog({ report: true })
        assert.deepEqual(result.sources.sealed, { ok: false, count: 1, skipped: true })
        assert.deepEqual(runtime.catalog.filter(row => row.channel === 'eac').map(row => row.id), cached)
        assert.equal(JSON.stringify(result.sources).includes('fixture-old-user'), false)
        assert.equal(JSON.stringify(result.sources).includes('fixture-new-user'), false)
      }
    } finally {
      lane.fetch = originalFetch
      runtime.dispose()
      stores.dispose()
    }
  })
  await check('cancelling a single-model test closes the real upstream request and the management session stays usable', async () => {
    const started = new Promise(resolve => { notifyCall = resolve })
    const closed = new Promise(resolve => { notifyClosed = resolve })
    const controller = new AbortController()
    const before = calls
    holdNextCall = true
    const pending = fetch(`${service.url}/api/management/models/test`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ model }), signal: controller.signal,
    })
    const cancelled = pending.then(() => null, error => error)
    const deadline = AbortSignal.timeout(5000)
    const wait = promise => Promise.race([promise, new Promise((_, reject) => {
      deadline.addEventListener('abort', () => reject(new Error('Cancelling the test did not close the upstream request within five seconds')), { once: true })
    })])
    try {
      await wait(started)
      controller.abort()
      assert.equal((await cancelled)?.name, 'AbortError')
      await wait(closed)
      assert.equal(calls, before + 1)
      assert.equal((await request('/api/management/summary')).status, 200)
    } finally { controller.abort(); holdNextCall = false }
  })
  await check('hiding a model only filters the public catalog; it keeps the management entry and call history and persists', async () => {
    const listing = async () => (await (await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).json()).data
    assert.equal((await request('/api/management/settings', { body: { hiddenModelIds: [model, model] } })).status, 200)
    assert.deepEqual((await listing()).map(row => row.id), [kilo])
    const summary = await (await request('/api/management/summary')).json()
    assert.deepEqual(summary.settings.hiddenModelIds, [model])
    assert.equal(summary.catalog.find(row => row.id === model).hiddenByUser, true)
    assert.equal(summary.catalog.find(row => row.id === model).routable, false)
    assert.equal(JSON.stringify(summary).includes(key), false)
    assert.equal((await request('/api/management/models/test', { body: { model } })).status, 200,
      'hidden history ids remain callable')
    assert.equal((await request('/api/management/settings', { body: { hiddenModelIds: [], hideFreeModels: true, hideEacModels: true } })).status, 200)
    assert.deepEqual(await listing(), [])
    assert.equal((await (await request('/api/management/summary')).json()).catalog.length, 2)
    const hiddenSettings = { hiddenModelIds: [model], hideFreeModels: false, hideEacModels: true }
    assert.equal((await request('/api/management/settings', { body: hiddenSettings })).status, 200)
    const stored = JSON.parse(fs.readFileSync(service.keyFile, 'utf8'))
    for (const [name, value] of Object.entries(hiddenSettings)) assert.deepEqual(stored[name], value)
  })
  await check('rotation requires confirmation; the old key and other sessions are invalidated while the current management session is kept', async () => {
    const other = await login({ key })
    assert.equal((await request('/api/management/key/rotate', { body: {} })).status, 400)
    const rotated = await request('/api/management/key/rotate', { body: { confirm: true } })
    assert.equal(rotated.status, 200)
    const nextKey = (await rotated.json()).key
    assert.notEqual(nextKey, key)
    assert.equal(getKey(), nextKey)
    assert.equal((await request('/api/management/summary', { cookie: other })).status, 401)
    assert.equal((await request('/api/management/summary')).status, 200)
    assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).status, 401)
    assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${nextKey}` } })).status, 200)
    assert.equal((await request('/api/management/session', { cookie: '', body: { key } })).status, 401)
    key = nextKey
  })
  await check('after session expiry and logout, management data cannot be read', async () => {
    const nativeNow = Date.now
    const started = nativeNow()
    try {
      Date.now = () => started + 8 * 60 * 60_000 + 1000
      assert.equal((await request('/api/management/summary')).status, 401)
    } finally { Date.now = nativeNow }
    cookie = await login({ key })
    const response = await request('/api/management/logout', { body: {} })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal((await request('/api/management/summary')).status, 401)
    cookie = await login({ key })
  })
  await check('a restart keeps settings and the key but clears sessions; the new login link is generated independently', async () => {
    const oldUrl = service.managementUrl
    const previousPort = service.port
    await service.close()
    service = await startStandalone({ dataDir, refresh: false, logger: { warn() {} } })
    assert.equal(service.port, previousPort)
    assert.equal(getKey(), key)
    assert.notEqual(service.managementUrl, oldUrl)
    assert.equal(service.runtime.state().settings.defaultMaxTokens, 8192)
    assert.equal(service.runtime.state().settings.standaloneProbe, true)
    assert.deepEqual(service.runtime.state().settings.hiddenModelIds, [model])
    assert.equal(service.runtime.state().settings.hideEacModels, true)
    assert.equal(service.runtime.state().settings.hideFreeModels, false)
    assert.equal((await request('/api/management/summary')).status, 401)
    const token = new URLSearchParams(new URL(service.managementUrl).hash.slice(1)).get('login')
    const nativeNow = Date.now
    const started = nativeNow()
    try {
      Date.now = () => started + 10 * 60_000 + 1000
      assert.equal((await request('/api/management/session', { cookie: '', body: { bootstrapToken: token } })).status, 401)
    } finally { Date.now = nativeNow }
    cookie = await login({ key })
    const visible = await (await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).json()
    assert.equal(visible.data.some(row => row.id === model), false)
    assert.equal((await request('/api/management/settings', { body: { hiddenModelIds: [], hideEacModels: false } })).status, 200)
    assert.equal((await (await request('/v1/models', { headers: { authorization: `Bearer ${key}` } })).json()).data.some(row => row.id === model), true)
  })
  await check('a settings change reschedules periodic tasks and --no-refresh keeps automatic requests off', async () => {
    const nativeTimeout = globalThis.setTimeout
    let scheduled
    globalThis.setTimeout = (callback, delay, ...args) => {
      const handle = nativeTimeout(callback, delay, ...args)
      if ([12, 5].some(minutes => minutes * 60_000 === delay)) scheduled = { handle, delay }
      return handle
    }
    try {
      const before = calls
      assert.equal((await request('/api/management/settings', { body: { probeIntervalMinutes: 5 } })).status, 200)
      assert.equal(scheduled, undefined)
      assert.equal(calls, before)
      await service.close()
      service = await startStandalone({ dataDir, refresh: true, logger: { warn() {} } })
      await service.ready
      cookie = await login({ key })
      assert.equal(scheduled.delay, 5 * 60_000)
      const oldHandle = scheduled.handle
      assert.equal((await request('/api/management/settings', { body: { probeIntervalMinutes: 12, standaloneProbe: false } })).status, 200)
      assert.equal(scheduled.delay, 12 * 60_000)
      assert.equal(oldHandle._destroyed, true)
    } finally {
      globalThis.setTimeout = nativeTimeout
    }
  })
} finally {
  await service?.close()
  upstream.closeAllConnections()
  await new Promise(resolve => upstream.close(resolve))
  const cleanupTarget = fs.realpathSync(scratch)
  assert.ok(cleanupTarget.startsWith(fs.realpathSync(os.tmpdir()) + path.sep))
  fs.rmSync(cleanupTarget, { recursive: true, force: true })
}
console.log(`\nstandalone-management: ${checks - failures}/${checks} checks passed`)
process.exitCode = failures ? 1 : 0
