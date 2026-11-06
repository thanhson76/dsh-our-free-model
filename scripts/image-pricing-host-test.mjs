/**
 * Run the real spill-policy against the specified host dependencies; installs nothing, reads no real accounts and calls no upstream.
 * node scripts/image-pricing-host-test.mjs <directory containing the host node_modules>
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { FreeModelAdapter, ROUTE_MAIN, ROUTE_REGION } from '../src/adapter.js'

if (!process.argv[2]) throw new Error('Please provide an isolated directory containing the host node_modules')
const require = createRequire(import.meta.url)
const resolve = name => require.resolve(name, { paths: [path.resolve(process.argv[2])] })
const llmUrl = pathToFileURL(resolve('@deepseek-ai/dsh-llm')).href
const { LlmRuntime } = await import(llmUrl)
const { apply: applySpill } = await import(pathToFileURL(resolve('@deepseek-ai/dsh-spill-policy')).href)
const version = JSON.parse(fs.readFileSync(resolve('@deepseek-ai/dsh-spill-policy/package.json'), 'utf8')).version
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-image-pricing-'))
process.env.DSH_HOME = home
process.env.DSH_CHANNEL_PACK_STATE_DIR = home
process.env.DSH_OPENAI_GATEWAY_ENABLED = '0'
process.env.QODER_MACHINE_TOKEN_PATH = path.join(home, 'unused-token.json')
process.env.QODER_RUNTIME_INFO = path.join(home, 'missing-runtime.exe')
const imagePath = path.join(home, 'fixture.png')
fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4GQAAAAASUVORK5CYII=', 'base64'))
const kernelUrl = new URL('./lib/channel-pack-kernel.mjs', import.meta.url).href
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/vendor/channel-pack/pack.js') && specifier.startsWith('@deepseek-ai/')) {
    return { url: specifier === '@deepseek-ai/dsh-llm' ? llmUrl : kernelUrl, shortCircuit: true }
  }
  return next(specifier, context)
} })
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('External network requests are forbidden in the host image regression') }
const disposers = [], adapters = new Map()
const services = {
  profileContext: { home },
  credentials: { resolve: async () => undefined, describe: async () => undefined,
    set: async () => { throw new Error('Writing credentials is forbidden') }, unset: async () => {} },
  llm: { registerAdapter(providers, adapter) { for (const provider of providers) adapters.set(provider, adapter) },
    listProviders: () => [...adapters.keys()].map(id => ({ id })) },
  connection: { fetch: { register() {} } },
}
const ctx = {
  ...services, logger: { info() {}, warn() {}, error() {} }, get: name => services[name],
  provide(name, value) { services[name] = value; this[name] = value },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') disposers.push(cleanup) },
  inject(names, fn) { if (names.every(name => services[name] !== undefined)) fn(this) }, emit() {},
}
const text = 'Diagnostic fixture. '.repeat(25600)
const image = { type: 'image', attachment: { attachmentId: 'fixture', mediaType: 'image/png', width: 1, height: 1 } }
async function verify(provider, withImage) {
  const listeners = new Map(), warnings = [], saved = []
  const llm = { imageRequestPricing(p, m) {
    return LlmRuntime.prototype.imageRequestPricing.call({ adapters: new Map([[provider, { adapter: adapters.get(provider) }]]) }, p, m)
  } }
  const host = {
    llm, attachments: { imageHostPath: () => imagePath }, fs: { processPathFromHostPath: file => file },
    spillStore: { async saveText(input) {
      const file = path.join(home, `${provider}-${withImage}.txt`)
      fs.writeFileSync(file, input.content); saved.push(file)
      return { locator: file, bytes: Buffer.byteLength(input.content), retrievalHint: 'Read the isolated file.' }
    } },
  }
  applySpill({ on: (event, fn) => listeners.set(event, fn), get: key => host[key],
    logger: { warn: message => warnings.push(message) } }, { maxInlineTokens: 12500 })
  const exec = { name: 'diagnostic_tool', callId: 'fixture-call', agent: {
    options: { provider, model: 'deepseek-v4.1-flash' }, session: {
      header: { id: 'isolated-issue151' }, requestHeader: () => ({ config: { provider, model: 'deepseek-v4.1-flash' } }),
    },
  } }
  const content = withImage ? [{ type: 'text', text }, image] : [{ type: 'text', text }]
  const result = await listeners.get('tools/post-execute')(exec, { content, isError: false }, async () => ({ kind: 'accept' }))
  assert.equal(saved.length, 1, `${provider} must be written to disk`)
  assert.deepEqual(warnings, [], `${provider} must not trigger a pricing or storage failure`)
  const preview = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
  assert.ok(preview.includes('Full formatted result stored at:'), `${provider} must return a recoverable file hint`)
  assert.ok(Buffer.byteLength(preview) < Buffer.byteLength(text))
  const full = fs.readFileSync(saved[0], 'utf8')
  assert.ok(full.startsWith(text), 'the full text must not be lost')
  if (withImage) assert.ok(full.includes(JSON.stringify(imagePath)), 'the full result must keep the image read address')
}
try {
  const { apply } = await import('../vendor/channel-pack/pack.js')
  apply(ctx, { disableOpencode: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(adapters.size, 11)
  const free = new FreeModelAdapter({ state: () => ({ catalog: [], membership: {}, settings: {} }), recordUsage() {} })
  adapters.set(ROUTE_MAIN, free); adapters.set(ROUTE_REGION, free)
  await verify('lobsterai', false)
  for (const provider of adapters.keys()) await verify(provider, true)
  console.log(`ok  host ${version}: the 512KB image-bearing results and plain-text controls of all 13 routes were really written to disk, previews carry a recovery address, and there were no pricing failure warnings`)
} finally {
  for (const cleanup of disposers.reverse()) await cleanup()
  hooks.deregister(); globalThis.fetch = originalFetch
  fs.rmSync(home, { recursive: true, force: true })
}
