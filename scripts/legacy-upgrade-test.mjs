/** Using the unmodified historical upgrader, verify the current real release directory rather than a tiny fake package. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { publishedBytes } from './lib/published-bytes.mjs'
import { parseManifest, signManifest, verifyManifestSignature, PINNED_MANIFEST_PUBLIC_KEY } from '../src/updater.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-legacy-'))
const production = process.argv.includes('--production')
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const files = new Map()
function collect(rel) {
  const absolute = path.join(root, rel)
  if (fs.statSync(absolute).isDirectory()) {
    for (const name of fs.readdirSync(absolute)) if (!name.startsWith('.') && name !== 'node_modules') collect(`${rel}/${name}`)
  } else {
    assert(!files.has(rel), `Duplicate published file: ${rel}`)
    files.set(rel, publishedBytes(fs.readFileSync(absolute)))
  }
}
for (const rel of ['package.json', ...pkg.files]) collect(rel)
const rows = [...files].map(([path, body]) => ({ path, size: body.length, sha256: sha(body) })).sort((a, b) => a.path.localeCompare(b.path))
assert(rows.length <= 80, `the legacy version allows at most 80 files; currently ${rows.length}`)
assert(rows.every(row => row.size > 0 && row.size <= 4 * 1024 * 1024), 'a file exceeds the legacy 4 MiB limit')
const keys = crypto.generateKeyPairSync('ed25519')
const testKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
let manifest = { version: pkg.version, base: '../', publishedAt: new Date().toISOString(), notes: 'Legacy compatibility regression', files: rows }
if (production) {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'feed/manifest.json'), 'utf8'))
  assert.deepEqual(manifest.files, rows)
  assert.equal(manifest.version, pkg.version)
  assert(verifyManifestSignature(parseManifest(manifest), PINNED_MANIFEST_PUBLIC_KEY), 'the production manifest signature is invalid')
} else manifest.signature = signManifest(parseManifest(manifest), keys.privateKey)
const verifyKey = production ? PINNED_MANIFEST_PUBLIC_KEY : testKey
const old = [
  { version: '1.3.1', revision: 'f14d261557ae98e5d28eaa33f4471302cc7f35ad' },
  { version: '2.5.9', revision: '313eaa45c3abc769cd4169326b9b4e7161d141a9' },
]
let requestCount = 0
let tamperedPath = ''
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://fixture').pathname)
  if (pathname === '/feed/manifest.json') { res.end(JSON.stringify(manifest)); return }
  const rel = pathname.slice(1)
  const body = files.get(rel)
  if (!body) { res.writeHead(404); res.end(); return }
  requestCount++
  res.end(rel === tamperedPath ? Buffer.alloc(body.length) : body)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/feed/manifest.json`
let checks = 0
const check = async (name, run) => { await run(); console.log(`ok ${++checks} - ${name}`) }
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024 })
let installed
try {
  for (const historical of old) {
    const fixture = fs.readFileSync(new URL(`./fixtures/updater-${historical.version}.mjs`, import.meta.url))
    assert.deepEqual(fixture, git('show', `${historical.revision}:src/updater.js`), 'the historical upgrader fixture has been modified')
    historical.module = await import(`./fixtures/updater-${historical.version}.mjs`)
    const oldManifest = JSON.parse(git('show', `${historical.revision}:feed/manifest.json`))
    const archive = path.join(scratch, `${historical.version}.tar`)
    git('archive', '--format=tar', `--output=${archive}`, historical.revision, '--', ...oldManifest.files.map(row => row.path))
    historical.pkgDir = path.join(scratch, historical.version, 'node_modules/dsh-our-free-model')
    historical.dataDir = path.join(scratch, historical.version, 'private-data')
    fs.mkdirSync(historical.pkgDir, { recursive: true })
    fs.mkdirSync(historical.dataDir, { recursive: true })
    // bsdtar reads a drive-letter archive; an MSYS GNU tar earlier on the PATH
    // would take "D:" for a remote host and refuse the file.
    const tar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar'
    execFileSync(tar, ['-xf', archive, '-C', historical.pkgDir], { windowsHide: true })
    fs.writeFileSync(path.join(historical.dataDir, 'user-settings.json'), 'Preserved user data\n')
    await check(`the original ${historical.version} rejects the old problem fixture and accepts the current ${rows.length} files`, () => {
      historical.module.parseManifest(manifest)
      const tooMany = Array.from({ length: 93 }, (_, i) => ({ path: i === 0 ? 'package.json' : `src/f-${i}.js`, size: 1, sha256: '0'.repeat(64) }))
      assert.throws(() => historical.module.parseManifest({ ...manifest, files: tooMany }), /above the 80 cap/)
      assert.throws(() => historical.module.parseManifest({ ...manifest, files: [{ path: 'package.json', size: 68578304, sha256: '0'.repeat(64) }] }), /out-of-range size/)
    })
    const updater = new historical.module.PluginUpdater({ pkgDir: historical.pkgDir, dataDir: historical.dataDir, settings: () => ({}), defaultSources: [url], manifestPublicKey: verifyKey })
    if (historical.version === '2.5.9') {
      await check('a 2.5.9 activation failure restores all original runtime files', async () => {
        const original = new Map(oldManifest.files.map(row => [row.path, fs.readFileSync(path.join(historical.pkgDir, row.path))]))
        await assert.rejects(updater.apply({ activate: async () => ({ ok: false, error: 'Fixture refused activation', runtimeRestored: true }) }), /previous files restored/)
        for (const [rel, bytes] of original) assert.deepEqual(fs.readFileSync(path.join(historical.pkgDir, rel)), bytes, rel)
        assert.equal(fs.existsSync(path.join(historical.pkgDir, 'src/engine-parts')), true)
        assert.deepEqual(fs.readdirSync(path.join(historical.pkgDir, 'src/engine-parts')), [])
      })
      await check('2.5.9 rejects a real part tampered during download; the installed version is unchanged', async () => {
        tamperedPath = rows.find(row => row.path.endsWith('.part')).path
        // The previous round's failure kept the verified staging; use an independent upgrade data directory to verify a real bad download.
        const fresh = new historical.module.PluginUpdater({ pkgDir: historical.pkgDir, dataDir: path.join(historical.dataDir, 'tampered'), settings: () => ({}), defaultSources: [url], manifestPublicKey: verifyKey })
        await assert.rejects(fresh.apply(), /staging failed|sha256|checksum/)
        assert.equal(JSON.parse(fs.readFileSync(path.join(historical.pkgDir, 'package.json'))).version, historical.version)
        tamperedPath = ''
      })
    }
    await check(`the original ${historical.version} completes the download, install and loading of the latest plugin modules`, async () => {
      assert.equal((await updater.check()).available, true)
      await updater.apply({ activate: async () => {
        const module = await import(pathToFileURL(path.join(historical.pkgDir, 'index.js')).href)
        assert.equal(module.name, 'our-free-model')
        return { ok: true, version: JSON.parse(fs.readFileSync(path.join(historical.pkgDir, 'package.json'))).version }
      } })
      // 1.3.1 does not support activation callbacks yet; verify the real modules after the upgrade separately.
      assert.equal((await import(pathToFileURL(path.join(historical.pkgDir, 'index.js')).href)).name, 'our-free-model')
      assert.equal(JSON.parse(fs.readFileSync(path.join(historical.pkgDir, 'package.json'))).version, pkg.version)
      for (const row of rows) assert.equal(sha(fs.readFileSync(path.join(historical.pkgDir, row.path))), row.sha256, row.path)
      assert.equal(fs.readFileSync(path.join(historical.dataDir, 'user-settings.json'), 'utf8'), 'Preserved user data\n')
      installed = historical
    })
  }
  await check('the new upgrader after upgrading can re-check the same signed release without upgrading again', async () => {
    const { PluginUpdater } = await import(pathToFileURL(path.join(installed.pkgDir, 'src/updater.js')).href)
    const successor = new PluginUpdater({ pkgDir: installed.pkgDir, dataDir: installed.dataDir, settings: () => ({}), defaultSources: [url], manifestPublicKey: verifyKey })
    assert.equal((await successor.check()).available, false)
    assert.equal(successor.status().current, pkg.version)
  })
  const metadata = JSON.parse(fs.readFileSync(path.join(installed.pkgDir, 'vendor/magpie/engine.json')))
  if (metadata.binaries[`${process.platform}-${process.arch}`]) {
    await check('the real upgrade output restores the engine from parts alone and starts the authenticated management endpoints', async () => {
      assert.equal(fs.existsSync(path.join(installed.pkgDir, 'vendor/magpie/bin/magpie-win32-x64.exe')), false)
      const oldEnv = { ...process.env }
      let engine
      try {
        for (const key of Object.keys(process.env)) {
          if (/(?:_HOME|_DIR|_CONFIG|_DATA_DIR|_CONFIG_DIR|_PATH)$/.test(key) && !['SystemRoot', 'WINDIR'].includes(key)) delete process.env[key]
        }
        Object.assign(process.env, { HOME: scratch, USERPROFILE: scratch, APPDATA: scratch, LOCALAPPDATA: scratch, PATH: '', MAGPIE_NO_ACCOUNTS: '1', MAGPIE_PARTNERS: 'off', HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '127.0.0.1,localhost', DO_NOT_TRACK: '1' })
        const { createMagpieEngine } = await import(pathToFileURL(path.join(installed.pkgDir, 'src/magpie-engine.js')).href)
        engine = createMagpieEngine({ dataDir: path.join(installed.dataDir, 'native') })
        assert.equal(engine.status().available, true)
        assert.equal((await engine.start()).state, 'ready')
        assert.equal((await engine.request('GET', '/api/settings')).status, 200)
        const binary = path.join(installed.dataDir, 'native/engine-runtime', `${metadata.binaries[`${process.platform}-${process.arch}`].sha256}.exe`)
        assert.equal(sha(fs.readFileSync(binary)), metadata.binaries[`${process.platform}-${process.arch}`].sha256)
      } finally {
        await engine?.close()
        for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]
        Object.assign(process.env, oldEnv)
      }
    })
  } else console.log(`ok this machine (${process.platform}-${process.arch}) has no published native engine; skipping process startup; legacy install and module loading were verified`)
  console.log(`${checks}/${checks} legacy upgrade checks passed; ${rows.length} real files; ${requestCount} local file requests; ${production ? 'production signature' : 'one-off test signature'}; no upstream calls`)
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  if (!path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Cleanup path out of bounds')
  fs.rmSync(scratch, { recursive: true, force: true })
}
