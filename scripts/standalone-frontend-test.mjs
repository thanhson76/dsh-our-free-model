import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { buildStats } from '../src/core/stats.js'
import { filterModels } from '../packages/standalone/frontend/models-data.mjs'
import { usageDays, usageModels } from '../packages/standalone/frontend/usage-data.mjs'
import { settingsDraft, settingsChanged, syncSettings, validateSettingsDraft } from '../packages/standalone/frontend/settings-data.mjs'
import { verifySettingsHost } from './standalone-settings-host-test.mjs'
import { verifyModelOperation } from './standalone-model-operation-test.mjs'
import { verifyChannelFilters } from './standalone-channel-filter-test.mjs'
import { spawnSync } from 'node:child_process'

const web = new URL('../packages/standalone/web/', import.meta.url)
const assets = JSON.parse(fs.readFileSync(new URL('assets.json', web), 'utf8'))
assert.equal(new Set(assets).size, assets.length)
assert.ok(assets.includes('app.js') && assets.includes('app.css'))
assert.ok(assets.every(name => /^[\w-]+\.(js|css)$/.test(name)))
for (const name of assets) assert.ok(fs.statSync(new URL(name, web)).size > 0)
const html = fs.readFileSync(new URL('index.html', web), 'utf8')
const themeSource = fs.readFileSync(new URL('../packages/standalone/frontend/theme.mjs', import.meta.url), 'utf8')
for (const [saved, prefersDark, expected, storageUnavailable] of [
  ['dark', false, 'dark'],
  ['light', true, 'light'],
  [null, true, 'dark'],
  [null, false, 'light'],
  ['invalid', true, 'dark'],
  [null, true, 'dark', true],
]) {
  const document = { documentElement: { dataset: {} } }
  vm.runInNewContext(themeSource, {
    document,
    localStorage: { getItem() { if (storageUnavailable) throw new Error('storage unavailable'); return saved } },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  })
  assert.equal(document.documentElement.dataset.theme, expected,
    `Theme initialization: saved value=${saved}, system dark=${prefersDark}, storage unavailable=${!!storageUnavailable}`)
}
assert.match(html, /type="module".+src="\/assets\/app.js"/)
// The sidebar sticks via position: sticky in the base layer. If the theme layer ([data-theme] prefix) adds a position for it,
// its higher specificity overrides sticky, and in dark mode the whole sidebar scrolls away with the main content.
// Only the base layer and the narrow-screen breakpoint may declare position for .sidebar; the theme layer never may.
const sheet = fs.readFileSync(new URL('app.css', web), 'utf8')
const rules = [...sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.trim(), body }))
// Only consider selectors acting on the sidebar element itself; the position of decorative pseudo-elements such as ::before is unaffected.
const isSidebarElement = selectors => selectors.split(',')
  .map(part => part.replace(/\[[^\]]*\]/g, '').trim())
  .some(part => part === '.sidebar' || part.endsWith('> .sidebar'))
const themedSidebarPosition = rules.filter(rule =>
  /\[data-theme/.test(rule.selectors) && isSidebarElement(rule.selectors) && /position\s*:/.test(rule.body))
assert.deepEqual(themedSidebarPosition.map(rule => rule.selectors), [],
  'The theme layer must not declare position for .sidebar, or it will override the base layer sticky')
const baseSidebar = rules.find(rule => rule.selectors === '.sidebar' && /position\s*:\s*sticky/.test(rule.body))
assert.ok(baseSidebar, 'The sidebar must be kept at position: sticky by the base layer')
// The build minifies selectors (`.app-shell > *:not(.sidebar)` becomes `.app-shell>:not(.sidebar)`),
// so judge semantically: any positioning rule in the theme layer covering direct children of .app-shell must exclude the sidebar.
const themedShellChild = rules.filter(rule =>
  /\[data-theme/.test(rule.selectors) && /\.app-shell\s*:?\s*>/.test(rule.selectors) && /position\s*:/.test(rule.body))
assert.ok(themedShellChild.length > 0, 'The theme layer fix for the stacking of .app-shell children should be retained')
for (const rule of themedShellChild) {
  assert.ok(/not\(\s*\.sidebar\s*\)/.test(rule.selectors),
    `When the theme layer overrides positioning of .app-shell children, it must exclude the sidebar: ${rule.selectors.slice(0, 90)}`)
}
assert.ok(/::view-transition-new\(root\)/.test(sheet), 'Theme switching must have a spreading layer for the new theme')
assert.ok(/clip-path:\s*circle\(/.test(sheet), 'The spread must use a circular clip-path')
assert.ok(!html.includes('channels-'), 'Channels should not be preloaded on the login first screen')
assert.ok(!html.includes('models-'), 'The models page should not be preloaded on the login first screen')
assert.ok(!html.includes('usage-'), 'The usage page should not be preloaded on the login first screen')
assert.ok(!html.includes('settings-'), 'The settings page should not be preloaded on the login first screen')
assert.ok(!html.includes('app.tsx'), 'Only compiled assets are served')
assert.ok(!fs.existsSync(new URL('channels.js', web)), 'It does not also carry a second React channels bundle')
const app = fs.readFileSync(new URL('app.js', web), 'utf8')
const channel = assets.find(name => name.startsWith('channels-'))
assert.ok(channel, 'Channels must be a separate chunk')
assert.ok(app.includes(channel) && app.includes('import('), 'The entry must dynamically import channels')
const modelsChunk = assets.find(name => name.startsWith('models-'))
assert.ok(modelsChunk && app.includes(modelsChunk), 'The entry must import the models page on demand')
const usageChunk = assets.find(name => name.startsWith('usage-'))
assert.ok(usageChunk && app.includes(usageChunk), 'The entry must import the usage page on demand')
const settingsChunk = assets.find(name => name.startsWith('settings-'))
assert.ok(settingsChunk && app.includes(settingsChunk), 'The entry must import service settings on demand')
for (const [_, name] of html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) {
  assert.ok(assets.includes(name), `HTML asset not registered: ${name}`)
}
for (const name of assets.filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(new URL(name, web), 'utf8')
  for (const [_, dependency] of source.matchAll(/(?:from|import\()\s*["']\.\/([^"']+\.js)["']/g)) {
    assert.ok(assets.includes(dependency), `Chunk dependency not registered: ${dependency}`)
  }
}
const empty = buildStats({}, [])
assert.equal(empty.turns, 0)
assert.equal(empty.requests, 0)
assert.equal(empty.recoveredTurns, 0)
assert.deepEqual(empty.samples, [])
const catalog = Array.from({ length: 1000 }, (_, index) => ({
  id: `provider/model-${index}`, name: `Test model ${index}`, channel: index % 2 ? 'lobsterai' : 'kilo',
  vision: index % 3 === 0, reasoning: index % 5 === 0, routable: index % 7 !== 0,
  availability: index % 2 ? 'listed' : 'available',
}))
const baseline = structuredClone(catalog)
assert.equal(filterModels(catalog, {}).length, 1000)
assert.equal(filterModels(catalog, { search: '  PROVIDER/MODEL-999  ' })[0].id, catalog[999].id)
assert.equal(filterModels(catalog, { search: 'Test model 999' }).length, 1)
assert.equal(filterModels(catalog, { channel: 'eac' }).length, 0)
assert.ok(filterModels(catalog, { capability: 'text' }).every(model => !model.vision))
const combined = filterModels(catalog, { channel: 'lobsterai', capability: 'reasoning', availability: 'listed', access: 'routable' })
assert.ok(combined.length > 0)
assert.ok(combined.every(model => model.channel === 'lobsterai' && model.reasoning && model.routable && model.availability === 'listed'))
assert.equal(filterModels(catalog, { channel: 'lobsterai', availability: 'available' }).length, 0)
assert.equal(filterModels(catalog, { access: 'hidden' }).length + filterModels(catalog, { access: 'routable' }).length, catalog.length)
assert.equal(filterModels([{ id: 'unknown', name: 'Unknown status', routable: false }], { availability: 'unknown' }).length, 1)
assert.deepEqual(catalog, baseline, 'View filtering must not change the catalog, public status or model toggles')
const usageRows = Array.from({ length: 47 }, (_, index) => ({
  model: `fixture/usage-${index}`, name: `Usage model ${index}`, calls: index + 1, turns: index,
  input: index * 10, output: (46 - index) * 20, failedTurns: index % 4,
}))
const usageBaseline = structuredClone(usageRows)
const first = usageModels(usageRows)
assert.equal(first.total, 47)
assert.equal(first.pages, 3)
assert.equal(first.rows.length, 20)
assert.equal(first.rows[0].model, 'fixture/usage-46')
assert.equal(usageModels(usageRows, { page: 3 }).rows.length, 7)
assert.equal(usageModels(usageRows, { page: 999 }).page, 3)
assert.equal(usageModels(usageRows, { page: -1 }).page, 1)
assert.equal(usageModels([], { page: 3 }).page, 1)
assert.equal(usageModels(usageRows, { search: '  FIXTURE/USAGE-46  ', page: 3 }).rows[0].model, 'fixture/usage-46')
assert.equal(usageModels(usageRows, { search: 'Usage model 46' }).total, 1)
assert.equal(usageModels(usageRows, { search: 'No such model' }).total, 0)
assert.equal(usageModels(usageRows, { sort: 'tokens' }).rows[0].model, 'fixture/usage-0')
assert.equal(usageModels(usageRows, { sort: 'failedTurns' }).rows[0].failedTurns, 3)
assert.equal(usageModels(usageRows, { sort: 'name' }).rows[0].name, 'Usage model 0')
assert.deepEqual(usageRows, usageBaseline, 'Filtering and sorting must not modify cumulative statistics')
const series = [{ day: '2025-12-31', total: 18 }, { day: '2026-01-02', total: 7 }, { day: '2026-01-03', total: 999 }]
const seriesBaseline = structuredClone(series)
assert.deepEqual(usageDays(series, 3, new Date(2026, 0, 2, 1)), [
  { day: '2025-12-31', total: 18 }, { day: '2026-01-01', total: 0 }, { day: '2026-01-02', total: 7 },
])
assert.deepEqual(usageDays([], 1, new Date(2026, 9, 9)), [{ day: '2026-10-09', total: 0 }])
assert.equal(usageDays(series, 30, new Date(2026, 0, 2)).length, 30)
assert.deepEqual(series, seriesBaseline)
// Do not step back by a fixed 24 hours across daylight saving changes; local dates should be consecutive and non-repeating in both time zones.
for (const timezone of ['Asia/Shanghai', 'America/New_York']) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { usageDays } from './packages/standalone/frontend/usage-data.mjs'
    assert.deepEqual(usageDays([], 3, new Date(2026, 2, 9, 1)).map(row => row.day),
      ['2026-03-07', '2026-03-08', '2026-03-09'])
  `], { cwd: new URL('../', import.meta.url), env: { ...process.env, TZ: timezone }, encoding: 'utf8' })
  assert.equal(result.status, 0, `${timezone}: ${result.stderr}`)
}
const cumulative = buildStats({
  requests: 50, failedRequests: 3, logical: { turns: 40, failed: 2, recovered: 4, estimated: true, models: {} },
  models: { old: { input: 9000, output: 1000, reasoning: 10, calls: 50, failed: 3 } },
  days: { '2026-01-01': { total: 18, models: {} } },
}, [])
assert.equal(cumulative.grand.input + cumulative.grand.output, 10000)
assert.equal(usageDays(cumulative.days, 14, new Date(2026, 9, 9)).reduce((sum, row) => sum + row.total, 0), 0)
assert.equal(cumulative.turns, 40)
assert.equal(cumulative.requests, 50)
assert.equal(cumulative.logicalEstimated, true)
assert.equal(cumulative.requestFailures, 3)
const savedSettings = {
  enabled: true, exposeRegionModels: true, streamRecovery: true, standaloneProbe: false,
  hideFreeModels: false, hideEacModels: false,
  defaultMaxTokens: 32768, probeIntervalMinutes: 15,
}
const cleanDraft = settingsDraft(savedSettings)
assert.equal(settingsChanged(cleanDraft, savedSettings), false)
assert.deepEqual(validateSettingsDraft(cleanDraft).patch, savedSettings)
for (const [field, valid, invalid] of [
  ['defaultMaxTokens', ['512', '131072', ' 8192 '], ['', ' ', '511', '131073', '512.5', 'NaN', 'Infinity']],
  ['probeIntervalMinutes', ['1', '1440', '12'], ['', ' ', '0', '1441', '1.5', 'NaN', 'Infinity']],
]) {
  for (const value of valid) {
    const result = validateSettingsDraft({ ...cleanDraft, [field]: value })
    assert.ok(result.patch, `${field}=${value} should be saveable`)
    assert.equal(result.patch[field], Number(value))
  }
  for (const value of invalid) {
    const result = validateSettingsDraft({ ...cleanDraft, [field]: value })
    assert.equal(result.patch, null, `${field}=${value} should not be submitted`)
    assert.ok(result.errors[field])
  }
}
const bothInvalid = validateSettingsDraft({ ...cleanDraft, defaultMaxTokens: '', probeIntervalMinutes: '0' })
assert.equal(Object.keys(bothInvalid.errors).length, 2)
assert.ok(!Object.hasOwn(validateSettingsDraft({ ...cleanDraft, forwardKey: 'must-not-enter-the-request' }).patch, 'forwardKey'))
const editedDraft = { ...cleanDraft, defaultMaxTokens: '8192', enabled: false }
assert.equal(settingsChanged(editedDraft, savedSettings), true)
const nextSaved = { ...savedSettings, probeIntervalMinutes: 12 }
assert.deepEqual(syncSettings({ saved: savedSettings, draft: cleanDraft }, nextSaved, false),
  { saved: nextSaved, draft: settingsDraft(nextSaved) }, 'With no edits, it follows the background value')
const synchronized = syncSettings({ saved: savedSettings, draft: editedDraft }, nextSaved, false)
assert.deepEqual(synchronized.saved, nextSaved)
assert.deepEqual(synchronized.draft, editedDraft, 'Polling updates the baseline but must not overwrite the draft')
assert.deepEqual(syncSettings({ saved: savedSettings, draft: cleanDraft }, nextSaved, true).draft,
  cleanDraft, 'During saving, polling must not overwrite the draft even if it happens to equal the old baseline')
assert.equal(settingsChanged(settingsDraft(synchronized.saved), synchronized.saved), false, 'Undo restores the latest saved value')
assert.equal(settingsChanged({ ...editedDraft, defaultMaxTokens: '32768', enabled: true }, savedSettings), false,
  'Changing back to the original value should no longer report unsaved changes')
assert.deepEqual(savedSettings, {
  enabled: true, exposeRegionModels: true, streamRecovery: true, standaloneProbe: false,
  hideFreeModels: false, hideEacModels: false,
  defaultMaxTokens: 32768, probeIntervalMinutes: 15,
}, 'Draft operations must not modify the input settings')
await verifySettingsHost()
await verifyModelOperation()
verifyChannelFilters()
console.log('standalone-frontend: asset registration, four-page chunking, model filtering, statistics date pagination, settings validation and draft sync, late summary and exit-save checks passed')
