import assert from 'node:assert/strict'
import fs from 'node:fs'

/** Mounts the actual shared channel card and checks batch operations plus the loading, failure and repeated-click paths. */
export async function verifyChannelModelActions() {
  let bundle
  const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    .replace('exports.__test = {', 'exports.__test = { ChannelCard, DICT,')
  const window = { __ModuleLoader__: { load: value => { bundle = value } } }
  new Function('window', source)(window)
  let cursor = 0
  const cells = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: 'fragment',
    useState(initial) {
      const index = cursor++
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
      return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      return cells[index] ??= { current: initial }
    },
    useEffect() {},
    useMemo: callback => callback(),
    useCallback: callback => callback,
  }
  const { ChannelCard, DICT } = bundle.factory(() => react).__test
  let rows = [{ id: 'one', disabled: false }, { id: 'two', disabled: true }]
  let changed = 0
  const calls = [], errors = []
  let fail = false, release
  let hold = false
  const props = {
    channel: { id: 'lobsterai', name: 'LobsterAI', org: 'Test', accent: '#C7000B' },
    status: { accounts: { total: 0, enabled: 0 }, models: { total: 2, disabled: 1 } },
    t: key => DICT.zh[key],
    onChanged: () => { changed++ },
    onError: (_channel, error) => errors.push(error.message),
    rpc: async (method, payload) => {
      calls.push({ method, payload })
      if (method === 'model.setAllDisabled') {
        if (hold) await new Promise(resolve => { release = resolve })
        if (fail) throw new Error('bulk update failed')
        rows = rows.map(row => ({ ...row, disabled: payload.disabled }))
        return {}
      }
      assert.equal(method, 'model.list')
      return { models: rows }
    },
  }
  const render = () => { cursor = 0; return ChannelCard(props) }
  render()
  cells[0] = 'models'
  cells[2] = rows
  const buttons = tree => {
    const result = []
    const visit = node => {
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (!node || typeof node !== 'object') return
      if (node.type === 'button') result.push(node)
      visit(node.children)
    }
    visit(tree)
    return result
  }
  const button = (label, tree = render()) => buttons(tree).find(node => node.children.includes(label))
  const settle = () => new Promise(resolve => setImmediate(resolve))
  assert.equal(button('全部开启').props.disabled, false)
  assert.equal(button('全部关闭').props.disabled, false)
  assert.ok(button('开启') && button('关闭'), 'the single-model button should state the action it will perform, not disguise the action as the current state')
  hold = true
  button('全部关闭').props.onClick()
  button('全部开启').props.onClick()
  assert.equal(calls.length, 1, 'repeated clicks before the same batch operation completes may send only one request')
  assert.deepEqual(calls[0], { method: 'model.setAllDisabled', payload: { provider: 'lobsterai', disabled: true } })
  const busy = render()
  assert.ok(buttons(busy).every(node => node.props.className === 'ofm_foldtoggle' || node.props.disabled),
    'single-model and other write buttons are disabled while a batch request is in flight')
  assert.equal(button('全部关闭', busy).props['aria-busy'], 'true')
  release()
  await settle()
  assert.ok(cells[2].every(row => row.disabled === true))
  assert.equal(changed, 1)
  assert.equal(calls.filter(call => call.method === 'model.list').length, 1)
  assert.equal(button('全部关闭').props.disabled, false)
  hold = false
  button('全部开启').props.onClick()
  await settle()
  assert.ok(cells[2].every(row => row.disabled === false))
  assert.equal(changed, 2)
  assert.equal(calls.filter(call => call.method === 'model.setDisabled').length, 0, 'looping writes per model are forbidden')
  fail = true
  button('全部关闭').props.onClick()
  await settle()
  assert.deepEqual(errors, ['bulk update failed'])
  assert.ok(cells[2].every(row => row.disabled === false), 'after a failure, a new toggle state must not be fabricated')
  assert.equal(changed, 2)
  assert.equal(button('全部开启').props.disabled, false, 'operability is restored after a failure')
  cells[2] = undefined
  assert.equal(button('全部开启'), undefined, 'no batch changes while loading')
  cells[2] = []
  assert.equal(button('全部关闭'), undefined, 'no batch changes for an empty catalog')
}
