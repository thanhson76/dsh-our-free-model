import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { foldForwardOutcome } from '../../../src/core/completion.js'
import { recordTurn, recordUsage } from '../../../src/store.js'

/** One Worker per instance, so the original channel business's module singletons cannot mix directories or accounts. */
export async function createChannelRuntime({ dataDir, logger = console, stats }) {
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
    workerData: { dataDir },
    execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
  })
  const pending = new Map()
  let sequence = 0
  let closed = false
  let closing
  let rows = []
  let providers = []
  let refreshing
  let refreshTimer
  let finishClose
  let failed
  let readyResolve, readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const rejectAll = error => {
    failed = error
    readyReject(error)
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
  }
  worker.on('error', rejectAll)
  worker.on('exit', code => {
    if (!closed) rejectAll(new Error(`The channel process has exited (${code})`))
    finishClose?.()
  })
  worker.on('message', message => {
    if (message.type === 'ready') { providers = message.providers; readyResolve(); return }
    if (message.type === 'log') { logger[message.level]?.(message.message); return }
    if (message.type === 'closed') { finishClose?.(); return }
    if (message.type === 'changed') {
      if (closed) return
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { void refresh().catch(error => logger.warn?.(`Channel directory refresh failed: ${error.message}`)) }, 200)
      refreshTimer.unref?.()
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    if (message.type === 'chunk') {
      try { entry.onChunk?.(message.chunk) } catch (error) { entry.reject(error); worker.postMessage({ type: 'cancel', id: message.id }) }
    } else if (message.type === 'error') entry.reject(Object.assign(new Error(message.message), { statusCode: message.statusCode }))
    else entry.resolve(message.value)
  })
  function call(type, payload = {}, signal, onChunk, timeoutMs = 120000) {
    if (closed || failed) return Promise.reject(failed ?? new Error('The channel has been stopped'))
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('The request was cancelled'))
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const finish = fn => value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); fn(value) }
      const abort = () => {
        worker.postMessage({ type: 'cancel', id })
        entry.reject(signal?.reason ?? new Error('The channel request timed out or was cancelled'))
      }
      const timer = setTimeout(abort, timeoutMs)
      timer.unref?.()
      const entry = { resolve: finish(resolve), reject: finish(reject), onChunk }
      pending.set(id, entry)
      signal?.addEventListener('abort', abort, { once: true })
      worker.postMessage({ type, id, ...payload })
    })
  }
  function refresh({ report = false } = {}) {
    if (!refreshing) {
      refreshing = call('models').then(value => { rows = value.rows; return value }).finally(() => { refreshing = undefined })
    }
    return report ? refreshing : refreshing.then(value => value.rows)
  }
  const runtime = {
    get providers() { return providers },
    state() { return { state: failed ? 'failed' : 'ready', error: failed ? failed.message : '' } },
    publicModelRows: () => rows,
    refresh,
    handles: model => providers.some(provider => model.startsWith(`${provider}/`)),
    async rpc(body, signal) {
      if (typeof body?.method !== 'string' || !Object.hasOwn(body, 'payload')) throw Object.assign(new Error('The channel request is missing method or payload'), { statusCode: 400 })
      return call('rpc', { call: { method: body.method, payload: body.payload } }, signal, undefined, 10 * 60000)
    },
    async complete(request, onChunk) {
      const outcome = { text: '', toolCalls: [], usage: undefined, truncated: false, error: undefined }
      const started = Date.now()
      let first = 0
      let ok = false
      try {
        const { signal, ...wire } = request
        await call('complete', { request: wire }, signal, chunk => {
          if (!first) first = Date.now()
          foldForwardOutcome(outcome, chunk)
          onChunk?.(chunk)
        }, 30 * 60000)
        ok = outcome.error === undefined
        return outcome
      } finally {
        if (!closed && stats) {
          const usage = outcome.usage
          recordUsage(stats, {
            model: request.model, at: Date.now(), input: usage?.prompt_tokens ?? 0, output: usage?.completion_tokens ?? 0,
            reasoning: usage?.completion_tokens_details?.reasoning_tokens ?? 0, cacheRead: usage?.prompt_tokens_details?.cached_tokens ?? 0,
            ok, origin: 'forward', ttftMs: first ? first - started : undefined,
            decodeMs: first ? Date.now() - first : 0, decodeTokens: usage?.completion_tokens ?? 0,
            noUsage: usage === undefined, elapsedMs: Date.now() - started, aborted: request.signal?.aborted === true,
          })
          recordTurn(stats, { model: request.model, ok, recovered: false })
        }
      }
    },
    close() {
      if (closing) return closing
      closed = true
      clearTimeout(refreshTimer)
      rejectAll(new Error('The channel is stopping'))
      closing = (async () => {
        let timer
        await new Promise(resolve => {
          finishClose = resolve
          worker.postMessage({ type: 'close' })
          timer = setTimeout(resolve, 1500)
        })
        clearTimeout(timer)
        await worker.terminate()
      })()
      return closing
    },
  }
  try {
    const timeout = setTimeout(() => readyReject(new Error('Channel initialization timed out')), 30000)
    try { await ready } finally { clearTimeout(timeout) }
    runtime.ready = refresh().catch(error => { if (!closed) logger.warn?.(`Channel startup roster refresh failed: ${error.message}`) })
    return runtime
  } catch (error) { await runtime.close(); throw error }
}
