import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// This suite compiles the TSX page source in-process, so it needs esbuild — a
// `packages/standalone` devDependency. The offline CI job installs nothing by
// design (see .github/workflows/test.yml), so the check skips when the compiler
// is absent, the same way the release-preparation suite skips its Windows-only
// symlink check. Locally, where the devDependency is installed, it runs.
let transformSync
try {
  const standaloneRequire = createRequire(new URL('../packages/standalone/package.json', import.meta.url))
  ;({ transformSync } = standaloneRequire('esbuild'))
} catch {
  console.log('ok  standalone-page-lifecycle skipped: esbuild is not installed (the offline job installs nothing)')
  process.exit(0)
}

const source = fs.readFileSync(new URL('../packages/standalone/frontend/app.tsx', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('function App()'), source.indexOf('createRoot(document'))
const slots = [], effects = []
let index = 0
const react = {
  useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value }] },
  useRef(value) { const at = index++; return slots[at] ??= { current: value } },
  useMemo(factory) { index++; return factory() },
  useEffect(effect, deps) { const at = index++, previous = slots[at]; if (previous?.deps?.length === deps?.length && deps?.every((value, i) => value === previous.deps[i])) return; slots[at] = { deps }; effects.push(effect) },
}
const settings = { enabled: true }
const summary = { settings, catalog: [], networkMode: 'fixture' }
const context = {
  ...react, h: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }), Fragment: 'fragment',
  Sidebar: 'Sidebar', Topbar: 'Topbar', SponsorNotice: 'SponsorNotice', Overview: 'Overview', Workspace: 'Workspace', Connection: 'Connection', ChannelMount: 'ChannelMount', LazyPage: 'LazyPage', LoadingScreen: 'LoadingScreen', LoginScreen: 'LoginScreen', AlertCircle: 'AlertCircle', DisclaimerDialog: 'DisclaimerDialog',
  // `App` navigates against the sidebar-derived list (`navigationPages`), so that
  // is the name this sandbox has to supply. The value only needs to cover the
  // pages this suite walks through — the sidebar/type agreement itself is
  // pinned by `standalone-nav-test.mjs`.
  navigationPages: ['overview', 'workspace', 'models', 'usage', 'channels', 'eac', 'settings', 'connection'], API: '/api/management',
  messageOf: error => error.message, AbortSignal, URLSearchParams, location: { hash: '' }, history: {},
  window: { scrollTo() {}, addEventListener() {}, removeEventListener() {}, setInterval() { return 1 }, clearInterval() {} },
  document: { hidden: false }, navigator: { clipboard: { writeText: async () => {} } },
  fetch: async url => ({ ok: true, json: async () => url.endsWith('/summary') ? summary : { models: [], days: [] } }),
}
vm.createContext(context)
vm.runInContext(transformSync(code + '\nglobalThis.testApp = App', { loader: 'tsx', jsxFactory: 'h', jsxFragment: 'Fragment' }).code, context)
const render = () => { index = 0; return context.testApp() }
const all = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(all)] : []
const flush = async () => { for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)) }
render(); await flush()
let tree = render()
const host = () => all(tree).find(node => node.type === 'Sidebar').props.host
// #678: the sidebar listed "Model workbench" but the allowlist did not, so
// `navigate('workspace')` was silently dropped by `includes` — clicking did
// nothing: no reaction, no error, no loading. The allowlist is now derived
// from the sidebar; this pins down "a page the sidebar has really switches when clicked".
host().navigate('workspace'); tree = render()
assert.ok(all(tree).some(node => node.type === 'Workspace'), '"Model workbench" must be reachable and really switch pages when clicked (#678)')
host().navigate('settings'); tree = render()
assert.ok(all(tree).some(node => node.type === 'LazyPage' && node.props.name === 'settings'))
host().navigate('models'); tree = render()
assert.ok(all(tree).some(node => node.type === 'LazyPage' && node.props.name === 'settings' && node.props.active === false), 'switching pages keeps the settings component and its draft, but stops inactive-page tasks')
assert.ok(all(tree).some(node => node.type === 'LazyPage' && node.props.name === 'models' && node.props.active === true))
host().navigate('usage'); tree = render()
assert.ok(all(tree).some(node => node.type === 'LazyPage' && node.props.name === 'models' && node.props.active === false), 'model filter state is kept after switching pages')
assert.ok(!all(tree).some(node => node.type === 'Connection'), 'the key page unmounts after leaving, clearing the displayed key')
host().navigate('channels'); tree = render()
assert.equal(all(tree).find(node => node.type === 'ChannelMount').props.key, 'channels', 'the account channels use an independent nested root container')
host().navigate('eac'); tree = render()
assert.equal(all(tree).find(node => node.type === 'ChannelMount').props.key, 'eac', 'switching to EAC replaces the container, so an old React root cannot overwrite the new page')
let releaseOldKey
context.fetch = async url => url.endsWith('/key') ? new Promise(resolve => { releaseOldKey = resolve }) : { ok: true, json: async () => ({}) }
const oldKey = host().getApiKey().catch(error => error)
await host().logout(); tree = render()
assert.equal(tree.type, 'LoginScreen')
context.fetch = async url => ({ ok: true, json: async () => url.endsWith('/summary') ? summary : { models: [], days: [] } })
await tree.props.request('/session', { key: 'test' }); tree = render()
assert.equal(tree.props.id, 'app')
releaseOldKey({ ok: false, status: 401, json: async () => ({ error: 'Old session expired' }) })
await oldKey; tree = render()
assert.equal(tree.props.id, 'app', 'a late 401 from an old session must not log out the new session')
console.log('ok  page switching keeps the settings draft and model filters, inactive pages pause their tasks, exit removes the workspace')
