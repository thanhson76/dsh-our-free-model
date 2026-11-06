import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

// Run the component's actual async operation functions, simulating Host responses and state updates, without duplicating business logic.
const source = fs.readFileSync(new URL('../packages/standalone/frontend/models.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  const run = async')
const end = source.indexOf('  const cancel =', start)
assert.ok(start >= 0 && end > start, 'the model operation functions must be locatable')
const operationSource = stripTypeScriptTypes(source.slice(start, end))
const model = { id: 'fixture/model', name: 'Test model' }
const result = { ok: true, text: 'Successful answer', latencyMs: 10 }
function operation(host) {
  const state = { test: undefined, operation: undefined, error: '', message: '' }
  const pending = { current: undefined }
  const activeRef = { current: true }
  const context = {
    host, pending, activeRef, AbortController, Error,
    setTest: value => { state.test = typeof value === 'function' ? value(state.test) : value },
    setOperation: value => { state.operation = value },
    setError: value => { state.error = value },
    setMessage: value => { state.message = value },
  }
  const run = vm.runInNewContext(operationSource + '\nrun', context)
  return { run, state, pending, activeRef }
}

export async function verifyModelOperation() {
  const refreshFailed = operation({
    testModel: async () => result,
    refresh: async () => { throw new Error('Summary temporarily unavailable') },
  })
  await refreshFailed.run('test', model)
  assert.equal(refreshFailed.state.test.state, 'success', 'a failed summary refresh must not overwrite a successful test')
  assert.equal(refreshFailed.state.test.result, result, 'the successful answer must be preserved')
  assert.match(refreshFailed.state.error, /Summary temporarily unavailable/, 'a summary error should be reported separately')
  assert.equal(refreshFailed.state.operation, undefined)
  assert.equal(refreshFailed.pending.current, undefined)

  let refreshed = false
  const testFailed = operation({
    testModel: async () => { throw new Error('Inference failed') },
    refresh: async () => { refreshed = true },
  })
  await testFailed.run('test', model)
  assert.equal(testFailed.state.test.state, 'error')
  assert.equal(testFailed.state.test.error, 'Inference failed')
  assert.equal(refreshed, false)
  assert.equal(testFailed.state.operation, undefined)

  const succeeded = operation({ testModel: async () => result, refresh: async () => {} })
  await succeeded.run('test', model)
  assert.equal(succeeded.state.test.state, 'success')
  assert.equal(succeeded.state.error, '')

  const probeFailed = operation({ refreshModels: async () => { throw new Error('Probing failed') } })
  await probeFailed.run('probe')
  assert.equal(probeFailed.state.error, 'Probing failed')
  assert.equal(probeFailed.state.test, undefined)
  assert.equal(probeFailed.state.operation, undefined)

  let rejectRefresh
  let notifyRefresh
  const refreshStarted = new Promise(resolve => { notifyRefresh = resolve })
  const cancelled = operation({
    testModel: async () => result,
    refresh: () => new Promise((_resolve, reject) => { rejectRefresh = reject; notifyRefresh() }),
  })
  const running = cancelled.run('test', model)
  await refreshStarted
  assert.equal(cancelled.state.test.state, 'success')
  cancelled.activeRef.current = false
  cancelled.pending.current.abort()
  cancelled.pending.current = undefined
  rejectRefresh(new Error('Late error after leaving the page'))
  await running
  assert.equal(cancelled.state.error, '', 'an error after leaving the page must not update state')
}
