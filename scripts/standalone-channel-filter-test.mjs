import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../packages/standalone/frontend/components/channel-browser.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  const connected =')
const end = source.indexOf('  return <>', start)
const label = /onClick=\{\(\) => setFilter\(id\)\}>\{label\}<span>\{(.+?)\}<\/span>/.exec(source)?.[1]
assert.ok(start >= 0 && end > start && label, 'The channel filter and actual count labels must be locatable')
const calculation = stripTypeScriptTypes(source.slice(start, end))
function filterChannels(statuses, filter, search = '') {
  return vm.runInNewContext(calculation + `\n;({
    rows, labels: ['all', 'connected', 'pending'].map(id => (${label}))
  })`, {
    statuses, filter, search, selected: undefined,
    providers: [
      { id: 'connected', name: 'Connected channel', org: 'Test' },
      { id: 'pending', name: 'Pending channel', org: 'Test' },
      { id: 'closed', name: 'Closed channel', org: 'Test' },
      { id: 'unknown', name: 'Unread channel', org: 'Test' },
    ],
  })
}
export function verifyChannelFilters() {
  const statuses = {
    connected: { accounts: { total: 1, enabled: 1 } },
    pending: { accounts: { total: 1, enabled: 0 } },
    closed: { closed: true, accounts: { total: 1, enabled: 1 } },
  }
  for (const [filter, expectedRows] of [['all', 4], ['connected', 1], ['pending', 3]]) {
    const view = filterChannels(statuses, filter)
    assert.deepEqual(Array.from(view.labels), [4, 1, 3], 'Category counts must not change with the selected filter')
    assert.equal(view.rows.length, expectedRows)
  }
  const searched = filterChannels(statuses, 'pending', 'Closed')
  assert.equal(searched.rows.length, 1)
  assert.equal(searched.rows[0].id, 'closed')
  assert.deepEqual(Array.from(searched.labels), [4, 1, 3], 'Category labels show full counts; the result count is shown by the results bar')
  assert.deepEqual(Array.from(filterChannels({}, 'all').labels), [4, 0, 4], 'Channels with no account status are also shown as not connected')
  assert.deepEqual(Array.from(filterChannels(undefined, 'all').labels), [4, '—', '—'], 'No invented category counts are shown before the status loads')
}
