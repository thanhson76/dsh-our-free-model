import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import { Boxes, Check, CircleAlert, CircleCheck, Copy, Eye, EyeOff, LoaderCircle, Play, RefreshCw, Search, SlidersHorizontal, Square, X } from 'lucide-react'
import { providers } from 'ofm-provider-list'
import { Badge, Button, Input } from './components/ui'
import { filterModels } from './models-data.mjs'
import { visibilityCopy } from './visibility-data.mjs'
import type { Host, Model, ModelTestResult, ServiceSettings, Summary } from './types'
import './models.css'

const availabilityNames: Record<string, string> = {
  available: 'Available (probed)', listed: 'Listed in catalog', unknown: 'Not probed',
  unavailable: 'Unavailable', throttled: 'Rate limited', 'region-blocked': 'Region restricted',
}
const sourceNames: Record<string, string> = { anonymous: 'Anonymous models', kilo: 'Kilo free pool', eac: 'EAC co-paid' }
const channelName = (id: string) => sourceNames[id]
  ?? providers.find(provider => provider.id === id)?.name ?? id
const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
const capacity = (value?: number) => value && Number.isFinite(value) && value > 0
  ? value >= 1000 ? `${Number((value / 1000).toFixed(1))}K` : number(value) : 'Unknown'
const initialFilters = { search: '', channel: 'all', capability: 'all', availability: 'all', access: 'all' }
type Operation = 'refresh' | 'probe' | 'test'
type TestState = { model: Model; state: 'pending' | 'success' | 'error' | 'cancelled'; result?: ModelTestResult; error?: string }

export function Models({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const visibility = visibilityCopy(document.documentElement.lang)
  const [filters, setFilters] = useState(initialFilters)
  const [operation, setOperation] = useState<Operation>()
  const [test, setTest] = useState<TestState>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string>()
  const [focusedId, setFocusedId] = useState<string>()
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const visibilityPending = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pending = useRef<AbortController | undefined>(undefined)
  const activeRef = useRef(active)
  activeRef.current = active
  const models = useMemo<Model[]>(() => filterModels(summary.catalog, filters), [summary.catalog, filters])
  const channels = useMemo(() => [...new Set(['anonymous', 'kilo', 'eac', ...summary.catalog.map(model => model.channel), filters.channel])]
    .filter(id => id !== 'all'), [summary.catalog, filters.channel])
  const focusedIndex = focusedId ? models.findIndex(model => model.id === focusedId) : -1
  const rangeExtractor = useCallback((range: Range) => {
    const visible = defaultRangeExtractor(range)
    return focusedIndex >= 0 ? [...new Set([...visible, focusedIndex])].sort((a, b) => a - b) : visible
  }, [focusedIndex])
  const virtual = useVirtualizer({
    count: models.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 112, overscan: 5, enabled: active,
    getItemKey: index => models[index].id, rangeExtractor,
  })
  const changeFilters = (patch: Partial<typeof initialFilters>) => {
    // Reset the scroll natively, avoiding target-height changes from smooth scrolling during dynamic measurement.
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setFilters(previous => ({ ...previous, ...patch }))
    setFocusedId(undefined)
  }
  useEffect(() => {
    if (!active) {
      pending.current?.abort()
      pending.current = undefined
      setOperation(undefined)
      setTest(previous => previous?.state === 'pending' ? { ...previous, state: 'cancelled' } : previous)
    }
    return () => { pending.current?.abort(); pending.current = undefined }
  }, [active])
  useEffect(() => {
    if (active && scrollRef.current) {
      const max = Math.max(0, virtual.getTotalSize() - scrollRef.current.clientHeight)
      if (scrollRef.current.scrollTop > max) scrollRef.current.scrollTop = max
    }
  }, [models.length, active, virtual])

  const run = async (kind: Operation, model?: Model) => {
    if (pending.current || !activeRef.current) return
    const controller = new AbortController()
    pending.current = controller
    setOperation(kind); setError(''); setMessage('')
    if (model) setTest({ model, state: 'pending' })
    const isCurrent = () => pending.current === controller && !controller.signal.aborted && activeRef.current
    try {
      if (kind === 'test' && model) {
        const result = await host.testModel(model.id, controller.signal)
        if (!isCurrent()) return
        setTest({ model, state: 'success', result })
        try {
          await host.refresh()
        } catch (reason) {
          if (!isCurrent()) return
          const detail = reason instanceof Error ? reason.name === 'TimeoutError' ? 'The request timed out. Please try again.' : reason.message : 'The request failed. Please try again.'
          setError(`The model test succeeded, but refreshing the summary failed: ${detail}`)
        }
      } else {
        await host.refreshModels(kind === 'probe', controller.signal)
        if (!isCurrent()) return
        setMessage(kind === 'probe' ? 'Availability probing complete' : 'Model catalog updated')
      }
    } catch (reason) {
      if (!isCurrent()) return
      const detail = reason instanceof Error ? reason.name === 'TimeoutError' ? 'The request timed out. Please try again.' : reason.message : 'The operation failed. Please try again.'
      if (kind === 'test' && model) setTest({ model, state: 'error', error: detail })
      else setError(detail)
    } finally {
      if (isCurrent()) { pending.current = undefined; setOperation(undefined) }
    }
  }

  const cancel = () => {
    pending.current?.abort()
    pending.current = undefined
    setOperation(undefined)
    setTest(previous => previous ? { ...previous, state: 'cancelled' } : previous)
  }

  const copyModelId = (model: Model) => {
    void host.copy(model.id).then(() => {
      if (activeRef.current) {
        setCopied(model.id)
        setTimeout(() => { if (activeRef.current) setCopied(undefined) }, 1800)
      }
    }).catch(host.error)
  }

  const saveVisibility = async (patch: Partial<ServiceSettings>) => {
    if (visibilityPending.current || !activeRef.current) return
    visibilityPending.current = true
    setVisibilitySaving(true); setError(''); setMessage('')
    try {
      await host.saveSettings(patch)
      if (activeRef.current) setMessage(visibility.saved)
      try { await host.refresh() } catch (reason) { if (activeRef.current) host.error(reason as Error) }
    } catch (reason) {
      if (activeRef.current) setError(reason instanceof Error ? reason.message : 'Saving failed. Please try again.')
    } finally {
      visibilityPending.current = false
      setVisibilitySaving(false)
    }
  }

  if (!active) return null
  const filtered = Object.entries(filters).some(([key, value]) => value !== initialFilters[key as keyof typeof initialFilters])
  const routable = summary.catalog.filter(model => model.routable).length
  return <div className="model-browser" data-testid="models-ready">
    <header className="dashboard-heading">
      <div><div className="heading-eyebrow">WORKSPACE / MODELS</div><h1>Model catalog</h1>
        <p>{number(summary.catalog.length)} models · {number(routable)} connectable</p></div>
      <div className="actions">
        <Button variant="outline" disabled={!!operation} onClick={() => { void run('refresh') }}>
          <RefreshCw size={15} className={operation === 'refresh' ? 'spinning' : ''} />{operation === 'refresh' ? 'Refreshing' : 'Refresh catalog'}
        </Button>
        <Button disabled={!!operation || !summary.settings.enabled} title="Sends a small number of inference requests upstream"
          onClick={() => { void run('probe') }}>
          {operation === 'probe' ? <LoaderCircle size={15} className="spinning" /> : <CircleCheck size={15} />}
          {operation === 'probe' ? 'Probing' : 'Probe availability'}
        </Button>
      </div>
    </header>
    <div className="model-summary">
      <span><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? 'Inference enabled' : 'Inference paused'}</span>
      <span>Catalog updated: {summary.catalogSyncedAt ? new Date(summary.catalogSyncedAt).toLocaleString('en-US', { hour12: false }) : 'Not refreshed yet'}</span>
      <span>Active probing and testing generate inference requests</span>
    </div>
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span>
      <Button variant="ghost" aria-label="Dismiss error" title="Dismiss error" onClick={() => setError('')}><X size={15} /></Button></div>}
    {message && <p className="model-feedback" role="status"><Check size={15} />{message}</p>}
    <div className="model-filters">
      <div className="model-search"><Search size={16} /><Input type="search" aria-label="Search models" placeholder="Search model name or ID…"
        value={filters.search} onChange={event => changeFilters({ search: event.target.value })} /></div>
      <select aria-label="Filter by channel" value={filters.channel} onChange={event => changeFilters({ channel: event.target.value })}>
        <option value="all">All channels</option>{channels.map(id => <option value={id} key={id}>{channelName(id)}</option>)}
      </select>
      <select aria-label="Filter by model capability" value={filters.capability} onChange={event => changeFilters({ capability: event.target.value })}>
        <option value="all">All capabilities</option><option value="text">Text only</option><option value="vision">Vision supported</option><option value="reasoning">Reasoning supported</option>
      </select>
      <select aria-label="Filter by availability" value={filters.availability} onChange={event => changeFilters({ availability: event.target.value })}>
        <option value="all">All statuses</option>{Object.entries(availabilityNames).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
      </select>
    </div>
    <div className="model-list-toolbar">
      <div className="channel-filters" role="group" aria-label="Filter by visibility">
        {([['all', 'All models'], ['routable', 'Connectable'], ['hidden', 'Not public']] as const).map(([id, name]) =>
          <button key={id} aria-pressed={filters.access === id} onClick={() => changeFilters({ access: id })}>{name}</button>)}
      </div>
      <span role="status" data-testid="model-result-count">{number(models.length)} / {number(summary.catalog.length)} models</span>
      {filtered && <Button variant="ghost" onClick={() => changeFilters(initialFilters)}><X size={14} />Clear filters</Button>}
    </div>
    <div className="model-list-toolbar">
      <label><input type="checkbox" role="switch" checked={summary.settings.hideFreeModels === true}
        disabled={visibilitySaving} onChange={event => { void saveVisibility({ hideFreeModels: event.target.checked }) }} /> {visibility.hideFree}</label>
      <label><input type="checkbox" role="switch" checked={summary.settings.hideEacModels === true}
        disabled={visibilitySaving} onChange={event => { void saveVisibility({ hideEacModels: event.target.checked }) }} /> {visibility.hideEac}</label>
    </div>
    {test && <section className={`model-test-result model-test-${test.state}`} aria-label="Model test result" aria-live="polite">
      <div className="model-test-heading"><div><strong>
        {test.state === 'pending' ? 'Testing' : test.state === 'success' ? 'Test complete' : test.state === 'cancelled' ? 'Test cancelled' : 'Test failed'}
      </strong><span>{test.model.name}{test.result && ` · ${number(test.result.latencyMs)} ms`}</span></div>
        {test.state === 'pending' ? <Button variant="outline" onClick={cancel}><Square size={14} />Cancel test</Button>
          : <Button variant="ghost" aria-label="Dismiss test result" title="Dismiss test result" onClick={() => setTest(undefined)}><X size={15} /></Button>}
      </div>
      {test.state === 'success' && <><pre>{test.result?.text}</pre>{test.result?.persisted === false && <p role="status">The test succeeded, but the result could not be saved. Check the data directory permissions or test again.</p>}</>}
      {test.state === 'error' && <p>{test.error}</p>}
    </section>}
    {models.length ? <div className="model-table" role="table" aria-label="Model catalog" aria-rowcount={models.length + 1} aria-colcount={5}>
      <div className="model-table-header" role="row"><span role="columnheader">Model / ID</span><span role="columnheader">Channel &amp; capabilities</span>
        <span role="columnheader">Context / output</span><span role="columnheader">Availability</span><span role="columnheader">Actions</span></div>
      <div ref={scrollRef} className="model-scroll" role="rowgroup" tabIndex={0} aria-label="Scrollable model list" onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          virtual.scrollToIndex(event.key === 'Home' ? 0 : models.length - 1, { align: event.key === 'Home' ? 'start' : 'end' })
        }
      }}>
        <div className="model-virtual-content" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map(item => {
            const model = models[item.index]
            const state = model.availabilitySource === 'listing' ? 'listed' : model.availability ?? 'unknown'
            const manual = model.availabilitySource === 'manual'
            const failed = manual && state === 'unknown'
            const availabilityName = failed ? 'Measured: failed' : manual && state === 'available' ? 'Measured: available' : availabilityNames[state] ?? 'Unknown status'
            const disabledReason = !summary.settings.enabled ? 'Inference service is paused' : !model.routable && !model.hiddenByUser ? 'This model is not public yet. Check the channel account or model settings' : operation ? 'Wait for the current operation to finish' : ''
            return <div role="row" aria-rowindex={item.index + 2} key={item.key} data-index={item.index} data-model-id={model.id}
              className="model-table-row" ref={virtual.measureElement} style={{ transform: `translateY(${item.start}px)` }}
              onFocusCapture={() => setFocusedId(model.id)} onBlurCapture={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(undefined)
              }}>
              <div role="cell" className="model-identity"><strong>{model.name}</strong><code>{model.id}</code></div>
              <div role="cell" className="model-source"><span>{channelName(model.channel)}</span><div className="model-capabilities">
                <Badge>{model.vision ? 'Vision' : 'Text only'}</Badge>{model.reasoning && <Badge tone="blue">Reasoning</Badge>}</div></div>
              <div role="cell" className="model-limits"><span title={model.contextWindow ? `${model.contextWindow} Token` : undefined}>{capacity(model.contextWindow)} <small>Context</small></span>
                <span title={model.maxOutput ? `${model.maxOutput} Token` : undefined}>{capacity(model.maxOutput)} <small>Output</small></span></div>
              <div role="cell" className="model-state"><Badge tone={state === 'available' ? 'success' : failed || ['unavailable', 'throttled', 'region-blocked'].includes(state) ? 'warning' : 'neutral'}>
                {availabilityName}</Badge>
                {manual && state !== 'available' && model.detail && <small title={model.detail}
                  style={{ maxWidth: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.detail}</small>}
                {!model.routable && <small>{model.hiddenByUser ? visibility.hidden : 'Not public'}</small>}
                {model.ttftMs != null && <small>First response {number(model.ttftMs)} ms</small>}</div>
              <div role="cell" className="model-row-actions">
                {['anonymous', 'kilo', 'eac', 'aggregate', 'combo'].includes(model.channel) && <Button variant="ghost"
                  disabled={visibilitySaving || model.hiddenByGroup === true}
                  title={model.hiddenByGroup ? visibility.groupHidden : model.hiddenByUser ? visibility.show : visibility.hide}
                  aria-label={`${model.hiddenByUser ? visibility.show : visibility.hide}: ${model.id}`}
                  onClick={() => { const ids = summary.settings.hiddenModelIds ?? []; void saveVisibility({
                    hiddenModelIds: ids.includes(model.id) ? ids.filter(id => id !== model.id) : [...ids, model.id],
                  }) }}>{model.hiddenByUser ? <Eye size={16} /> : <EyeOff size={16} />}</Button>}
                <Button variant="ghost" title={`Copy ${model.id}`} aria-label={`Copy model ID: ${model.id}`} onClick={() => copyModelId(model)}
                  className={copied === model.id ? 'md-copy-done' : ''}>
                  {copied === model.id ? <Check size={16} /> : <Copy size={16} />}
                </Button>
                <Button variant="outline" disabled={!!disabledReason} title={disabledReason || `Test ${model.name}; this generates an inference request`}
                  aria-label={`Test model: ${model.id}`} onClick={() => { void run('test', model) }}
                  className={operation === 'test' && test?.model.id === model.id ? 'md-testing' : ''}>
                  {operation === 'test' && test?.model.id === model.id ? <LoaderCircle size={14} className="spinning" /> : <Play size={14} />}Test
                </Button>
              </div>
            </div>
          })}
        </div>
      </div>
    </div> : <div className="model-empty"><Boxes size={28} /><h2>{summary.catalog.length ? 'No matching models' : 'Model catalog is empty'}</h2>
      <p>{summary.catalog.length ? 'Adjust your search or clear the filters.' : 'Refresh the catalog and try again, or check the channel connection.'}</p>
      {filtered && <Button variant="outline" onClick={() => changeFilters(initialFilters)}><SlidersHorizontal size={15} />Clear filters</Button>}
    </div>}
    <p className="footnote">Being listed in the catalog does not guarantee real-time availability. The Kilo free pool may record prompts — do not send sensitive content.</p>
  </div>
}
