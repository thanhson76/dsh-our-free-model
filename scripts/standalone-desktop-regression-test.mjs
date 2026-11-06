import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStandaloneEac } from '../packages/standalone/eac.mjs'
import { openExternal } from '../packages/standalone/open-external.mjs'

for (const url of ['file:///C:/Windows/notepad.exe', 'javascript:alert(1)', 'https://user:password@example.com/']) {
  assert.equal(await openExternal(url, { exec: async () => assert.fail('must not execute non-web links or links with credentials') }), false)
}
const address = "https://github.com/Ebony-Vinyl/dsh-our-free-model?quoted='&a=1"
let launch
assert.equal(await openExternal(address, { platform: 'win32', exec: async (...args) => { launch = args } }), true)
assert.match(launch[0], /powershell\.exe$/)
const script = Buffer.from(launch[1][3], 'base64').toString('utf16le')
assert.ok(script.includes("Start-Process -FilePath 'https://github.com/"))
assert.equal(script, `Start-Process -FilePath '${new URL(address).href.replaceAll("'", "''")}' -ErrorAction Stop`, 'The URL should be passed as a single PowerShell literal')
console.log('ok  the system browser only accepts HTTP(S), and special characters do not enter the command syntax')

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-desktop-regression-'))
try {
  const order = []
  const eac = createStandaloneEac({
    dataDir: directory,
    credentialOf: () => ({ mode: 'worker', base: 'https://gateway.invalid/eac/v1' }),
    fetch: async url => { assert.match(url, /\/auth\/github\/start\?link=/); order.push('registered'); return new Response(null, { status: 302 }) },
    openExternal: async url => { order.push('opened'); assert.match(url, /^https:\/\/gateway\.invalid\/eac\/auth\/github\/start\?link=/); return true },
  })
  const started = await eac.start()
  assert.equal(started.opened, true, 'The standalone app should automatically open the system browser after registering the session')
  assert.deepEqual(order, ['registered', 'opened'])
  assert.match(started.link, /^[A-Za-z0-9_-]{32}$/)
  eac.dispose()
  console.log('ok  the browser opens only after EAC registration completes, and the actual opened state is returned')

  const fallback = createStandaloneEac({
    dataDir: directory,
    credentialOf: () => ({ mode: 'worker', base: 'https://gateway.invalid/v1' }),
    fetch: async () => new Response(null, { status: 302 }),
    openExternal: async () => { throw new Error('no default browser') },
  })
  const manual = await fallback.start()
  assert.equal(manual.opened, false)
  assert.ok(manual.url && manual.link, 'A failed open still keeps an authorization session that can be opened manually')
  fallback.dispose()
  console.log('ok  authorization can continue manually if opening the browser fails')
} finally { fs.rmSync(directory, { recursive: true, force: true }) }
