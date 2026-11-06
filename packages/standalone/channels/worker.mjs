import { parentPort, workerData } from 'node:worker_threads'
import { createCredentials } from './credentials.mjs'
import { attachments } from './images.mjs'
import { toChatMessages, toToolDefs } from '../../../src/messages.js'
import {
  apply, toGenerateOptions, toResponsesGenerateOptions, normalizeReasoningEffort,
  responsesReasoningEffort, normalizeMaxTokens, responsesMaxOutputTokens, markGatewayChannel,
  collectGatewayModels, collectGatewayEffortViews, toOpenAiModels,
} from './business.mjs'

const cleanups = []
const adapters = new Map()
const routes = new Map()
const controllers = new Map()
let closed = false
const send = message => parentPort.postMessage(message)
const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, message => send({ type: 'log', level, message: String(message) })]))
const credentials = createCredentials(workerData.dataDir)
const ctx = {
  platform: { channelHome: workerData.dataDir }, credentials, logger, attachments,
  connection: { fetch: { register(route) { routes.set(route.path, route) } } },
  get(name) { return this[name] },
  provide(name, value) {
    if (Object.hasOwn(this, name)) throw new Error(`Service registered twice: ${name}`)
    this[name] = value
  },
  effect(body) {
    const cleanup = body()
    if (typeof cleanup === 'function') {
      if (closed) void cleanup()
      else cleanups.push(cleanup)
    }
    return cleanup
  },
  inject(names, body) { if (names.every(name => this[name] !== undefined)) return body(this) },
  emit() { send({ type: 'changed' }) },
  llm: {
    registerAdapter(providers, adapter) {
      for (const provider of providers) {
        if (adapters.has(provider)) throw new Error(`Channel registered twice: ${provider}`)
        adapters.set(provider, adapter)
      }
    },
    listProviders() { return [...adapters.keys()].map(id => ({ id })) },
    async listModels(provider) { return await adapters.get(provider)?.listModels(provider) ?? [] },
    async resolveModel(provider, model, signal) {
      const adapter = adapters.get(provider)
      if (!adapter) throw Object.assign(new Error('The channel does not exist'), { statusCode: 404 })
      return adapter.resolveModel(provider, model, signal)
    },
    async resolveModelInfo(provider, model, signal) { return this.resolveModel(provider, model, signal) },
    async *stream(options) {
      const adapter = adapters.get(options.provider)
      if (!adapter) throw Object.assign(new Error('The channel does not exist'), { statusCode: 404 })
      const call = await adapter.prepareCall(options.provider, options.model, options.signal)
      yield* call.stream(options)
    },
  },
}

async function models() {
  const sources = Object.fromEntries([...adapters.keys()].map(provider => [provider, { ok: false, count: 0 }]))
  const onError = (provider, error) => logger.warn(`${provider} model directory read failed: ${error.message}`)
  const groups = (await Promise.all([...adapters.keys()].map(provider => collectGatewayModels({
    listProviders: () => [{ id: provider }],
    listModels: id => ctx.llm.listModels(id),
  }, onError)))).flat()
  for (const { provider, models } of groups) sources[provider] = { ok: true, count: models.length }
  const infos = new Map()
  const views = await collectGatewayEffortViews({
    async resolveModelInfo(provider, model) {
      const info = await ctx.llm.resolveModel(provider, model)
      infos.set(`${provider}/${model}`, info)
      return info
    },
  }, groups, onError)
  const rows = toOpenAiModels(groups, views).map(row => ({
    ...row, channel: row.owned_by, vision: row.input?.includes('image') === true,
    context_window: row.context_window ?? infos.get(row.id)?.context?.contextWindow,
    max_tokens: row.max_tokens ?? infos.get(row.id)?.defaultMaxTokens,
  }))
  return { rows, sources }
}

async function rpc(call, signal) {
  const route = routes.get('/api/channel-pack')
  if (!route) throw new Error('The channel management endpoint is not registered')
  const response = await route.fetch(new Request('http://localhost/api/channel-pack', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ type: 'client-request', rpcId: 'standalone', method: 'channel-pack', payload: call }),
  }))
  const reply = await response.json()
  return reply.result
}

/**
 * Project the Anthropic/harness request shape onto the OpenAI body the channel
 * adapters parse. `/v1/messages` hands over harness messages and flat tools,
 * not an `openAi` body; without this the adapter rejects the turn for having no
 * messages and silently loses tools, max_tokens and temperature.
 */
function harnessBody(request) {
  const body = { messages: toChatMessages(Array.isArray(request.messages) ? request.messages : []) }
  if (Array.isArray(request.tools) && request.tools.length > 0) body.tools = toToolDefs(request.tools)
  if (typeof request.maxTokens === 'number') body.max_tokens = request.maxTokens
  if (typeof request.temperature === 'number') body.temperature = request.temperature
  if (typeof request.reasoningEffort === 'string' && request.reasoningEffort !== '') body.reasoning_effort = request.reasoningEffort
  return body
}

async function complete(request, id, signal) {
  const slash = request.model.indexOf('/')
  const provider = request.model.slice(0, slash)
  const model = request.model.slice(slash + 1)
  // Disabled models and providers must also affect the unified API, not just be hidden from the page.
  if (!(await ctx.llm.listModels(provider)).some(row => row.id === model)) throw Object.assign(new Error('The model does not exist or has been disabled'), { statusCode: 404 })
  const body = { ...(request.responsesBody ?? request.openAi ?? harnessBody(request)), model: request.model }
  const resolved = await ctx.llm.resolveModel(provider, model, signal)
  const effort = normalizeReasoningEffort(request.responses ? responsesReasoningEffort(body) : body.reasoning_effort, resolved, provider, model,
    notice => logger.info(`${request.model}: thinking level ${notice.requested} ${notice.applied ? `mapped to ${notice.applied}` : 'using the model default'}`))
  const requested = request.responses ? responsesMaxOutputTokens(body) : body.max_completion_tokens ?? body.max_tokens
  const maxTokens = typeof requested === 'number' ? normalizeMaxTokens(requested, provider, model) : undefined
  const convert = request.responses ? toResponsesGenerateOptions : toGenerateOptions
  const options = await convert(body, signal, effort, maxTokens, { bridge: attachments }, dropped => logger.warn(`Ignoring a tool type that cannot be expressed: ${dropped.type}`))
  options.sessionId = `standalone:${String(body.user ?? body.conversation ?? 'shared')}`
  for await (const chunk of ctx.llm.stream(markGatewayChannel(options))) {
    if (signal.aborted) throw new Error('The request was cancelled')
    send({ type: 'chunk', id, chunk })
  }
}

parentPort.on('message', async message => {
  if (message.type === 'cancel') { controllers.get(message.id)?.abort(); return }
  if (message.type === 'close') {
    closed = true
    for (const controller of controllers.values()) controller.abort()
    credentials.dispose()
    for (const cleanup of cleanups.reverse()) { try { await cleanup() } catch {} }
    send({ type: 'closed' })
    return
  }
  const { id, type } = message
  const controller = new AbortController()
  controllers.set(id, controller)
  try {
    if (closed) throw new Error('The channel has been stopped')
    if (type === 'models') send({ type: 'result', id, value: await models() })
    else if (type === 'rpc') send({ type: 'result', id, value: await rpc(message.call, controller.signal) })
    else if (type === 'complete') { await complete(message.request, id, controller.signal); send({ type: 'result', id }) }
    else throw new Error('Unknown channel operation')
  } catch (error) {
    send({ type: 'error', id, message: error.message, statusCode: error.statusCode ?? error.status })
  } finally { controllers.delete(id) }
})

apply(ctx, { disableOpencode: true })
send({ type: 'ready', providers: [...adapters.keys()] })
