import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { createDesktopUpdater, selectDesktopRelease, newerVersion, installerChecksum } from '../packages/standalone/desktop-update.mjs'

// `realpath` because macOS hands out a temp dir under `/var`, which is a symlink
// to `/private/var` — the managed-storage checks reject any symlinked ancestor,
// so an unresolved path fails on macOS before a single assertion runs.
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-desktop-update-')))
const bytes = Buffer.from('Official installer download fixture; no installation is performed')
const sha = crypto.createHash('sha256').update(bytes).digest('hex')
const release = version => ({ tag_name: `v${version}`, draft: false, prerelease: false, body: 'Release notes', assets: [
  { name: `Our.Free.Model_${version}_x64-setup.exe`, size: bytes.length, browser_download_url: `https://github.com/Ebony-Vinyl/dsh-our-free-model/releases/download/v${version}/Our.Free.Model_${version}_x64-setup.exe` },
  { name: 'SHA256SUMS', browser_download_url: `https://github.com/Ebony-Vinyl/dsh-our-free-model/releases/download/v${version}/SHA256SUMS` },
] })
let mode = 'ok', requests = 0
const fixtureFetch = async (url) => {
  requests++
  if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
  if (mode === 'network') throw new TypeError('fetch failed')
  if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify([
    { tag_name: 'v2.7.9', assets: [{ name: 'dsh-our-free-model-2.7.9.tgz' }] },
    { ...release('9.0.0'), prerelease: true }, release('2.7.3'), release('2.7.1'),
  ]))
  if (url.endsWith('/SHA256SUMS')) return new Response(`${mode === 'bad-hash' ? '0'.repeat(64) : sha}  Our.Free.Model_2.7.3_x64-setup.exe\n`)
  return new Response(mode === 'oversize' ? Buffer.concat([bytes, Buffer.from('extra')]) : bytes,
    { headers: mode === 'wrong-size-header' ? { 'content-length': '99999' } : {} })
}
let checks = 0
const check = async (name, run) => { await run(); console.log(`ok ${++checks} - ${name}`) }
const manager = (name, extra = {}) => createDesktopUpdater({ dataDir: path.join(scratch, name), version: '2.7.1', platform: 'win32', arch: 'x64', fetchImpl: fixtureFetch, ...extra })
const runCheck = async updater => { updater.check(); const state = await updater.settled(); assert.equal(state.phase, 'idle'); return state }
try {
  await check('plugin-only, prerelease and older versions are skipped; the highest version is selected by the real desktop package', async () => {
    const updater = manager('versions'); const state = await runCheck(updater)
    assert.equal(state.latest.version, '2.7.3'); assert.equal(state.available, true)
    assert.equal(newerVersion('2.10.0', '2.9.9'), true)
    assert.equal(newerVersion('2.7.1', '2.7.1'), false)
    assert.equal(selectDesktopRelease([{ tag_name: 'v3.0.0', assets: [{ name: 'plugin.tgz' }] }]), null)
    assert.equal(selectDesktopRelease([release('2.7.3')], 'arm64'), null)
  })
  await check('the native install credential is generated only after SHA verification succeeds, and the configuration is kept', async () => {
    const updater = manager('download'); await runCheck(updater)
    fs.mkdirSync(path.join(scratch, 'download'), { recursive: true }); fs.writeFileSync(path.join(scratch, 'download/settings.json'), 'Existing configuration')
    assert.equal(updater.download().phase, 'downloading'); assert.equal((await updater.settled()).phase, 'ready')
    const directory = path.join(scratch, 'download/desktop-updates')
    assert.deepEqual(fs.readFileSync(path.join(directory, `installer-${sha}.exe`)), bytes)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'ready.json'))), { schemaVersion: 1, version: '2.7.3', size: bytes.length, sha256: sha })
    assert.equal(fs.readFileSync(path.join(scratch, 'download/settings.json'), 'utf8'), 'Existing configuration')
    const previous = requests; updater.download(); await updater.settled(); assert.equal(requests - previous, 1, 'a valid cache only re-reads the official checksum file')
  })
  await check('a bad digest, an oversize download and a wrong length write no install credential, and temp files are cleaned up', async () => {
    for (const failure of ['bad-hash', 'oversize', 'wrong-size-header']) {
      mode = 'ok'; const updater = manager(failure); await runCheck(updater)
      mode = failure; updater.download(); const state = await updater.settled()
      assert.equal(state.phase, 'error'); assert(state.error)
      const dir = path.join(scratch, failure, 'desktop-updates')
      assert.equal(fs.existsSync(path.join(dir, 'ready.json')), false)
      assert.equal(fs.readdirSync(dir).some(name => /\.(part|tmp)$/.test(name)), false)
    }
    mode = 'ok'
  })
  await check('a tampered download cache triggers a re-download; checking a new version invalidates the old install credential', async () => {
    const updater = manager('corrupt'); await runCheck(updater); updater.download(); await updater.settled()
    const dir = path.join(scratch, 'corrupt/desktop-updates'); fs.writeFileSync(path.join(dir, `installer-${sha}.exe`), 'Corrupt cache')
    updater.download(); assert.equal((await updater.settled()).phase, 'ready'); assert.deepEqual(fs.readFileSync(path.join(dir, `installer-${sha}.exe`)), bytes)
    await runCheck(updater); assert.equal(fs.existsSync(path.join(dir, 'ready.json')), false)
  })
  await check('duplicate operations, unchecked downloads and a closed manager are rejected', async () => {
    const updater = manager('concurrent'); assert.throws(() => updater.download(), /Check first/)
    updater.check(); assert.throws(() => updater.check(), error => error.statusCode === 409)
    await updater.settled(); updater.close(); assert.throws(() => updater.check(), /closed/)
  })
  await check('external installer URLs, non-HTTPS redirects and non-unique digests are rejected', async () => {
    const foreign = release('2.7.3'); foreign.assets[0].browser_download_url = 'https://evil.invalid/setup.exe'
    assert.throws(() => selectDesktopRelease([foreign]), /official release source/)
    assert.throws(() => installerChecksum(`${sha}  setup.exe\n${sha}  setup.exe`, 'setup.exe'), /unique/)
    mode = 'redirect'; const updater = manager('redirect'); updater.check(); assert.equal((await updater.settled()).phase, 'error'); mode = 'ok'
  })
  await check('unsupported platforms and the browser service send no update requests; the current version needs no downgrade', async () => {
    const unsupported = manager('unsupported', { platform: 'darwin' }); const previous = requests
    assert.throws(() => unsupported.check(), /Windows/); assert.equal(requests, previous)
    const browser = manager('browser', { version: undefined }); assert.equal(browser.status().supported, false)
    const latest = manager('latest', { version: '2.8.0' }); assert.equal((await runCheck(latest)).available, false); assert.throws(() => latest.download(), /Check first/)
  })
  await check('a network failure shows an error and allows re-checking to recover', async () => {
    const updater = manager('recovery'); mode = 'network'; updater.check(); assert.equal((await updater.settled()).phase, 'error')
    mode = 'ok'; assert.equal((await runCheck(updater)).available, true)
  })
  await check('the real management endpoints require a private session and same origin, and offer no HTTP install entry', async () => {
    const savedFetch = globalThis.fetch
    const previousVersion = process.env.OFM_DESKTOP_VERSION
    process.env.OFM_DESKTOP_VERSION = '2.7.1'
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? savedFetch(input, init) : fixtureFetch(url.href, init)
    }
    let service
    try {
      const { startStandalone } = await import('../packages/standalone/service.mjs')
      // The endpoint refuses to check anywhere but Windows x64, and CI is not
      // that host. Declare the host instead of skipping the flow: the point of
      // this case is the HTTP wiring, which must be exercised where CI runs.
      service = await startStandalone({ dataDir: path.join(scratch, 'http'), port: 0, refresh: false, logger: { warn() {} }, desktopPlatform: 'win32', desktopArch: 'x64' })
      const api = '/api/management/desktop-update'
      const request = (route, options = {}) => savedFetch(service.url + route, { ...options, headers: { origin: service.url, 'content-type': 'application/json', ...options.headers } })
      assert.equal((await request(api)).status, 401)
      const key = JSON.parse(fs.readFileSync(service.keyFile)).forwardKey
      assert.equal((await request(api, { headers: { authorization: `Bearer ${key}` } })).status, 403)
      const token = new URLSearchParams(new URL(service.managementUrl).hash.slice(1)).get('login')
      const login = await request('/api/management/session', { method: 'POST', body: JSON.stringify({ bootstrapToken: token }) })
      assert.equal(login.status, 200)
      const cookie = login.headers.get('set-cookie').split(';')[0]
      assert.equal((await request(api, { headers: { cookie } })).status, 200)
      assert.equal((await request(api + '/check', { method: 'POST', body: '{}', headers: { cookie, origin: 'https://foreign.invalid' } })).status, 403)
      assert.equal((await request(api + '/install', { method: 'POST', body: '{}', headers: { cookie } })).status, 404)
      assert.equal((await request(api + '/check', { method: 'POST', body: '{}', headers: { cookie } })).status, 200)
      let status
      for (let i = 0; i < 100; i++) {
        status = await (await request(api, { headers: { cookie } })).json()
        if (status.phase !== 'checking') break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.equal(status.latest.version, '2.7.3')
    } finally {
      await service?.close()
      globalThis.fetch = savedFetch
      if (previousVersion === undefined) delete process.env.OFM_DESKTOP_VERSION
      else process.env.OFM_DESKTOP_VERSION = previousVersion
    }
  })
  console.log(`${checks}/${checks} desktop update checks passed; all downloads were local fixtures and no installer was executed`)
} finally {
  assert.equal(path.dirname(scratch), fs.realpathSync(os.tmpdir()))
  fs.rmSync(scratch, { recursive: true, force: true })
}
