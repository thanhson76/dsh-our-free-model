import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, CircleAlert, Layers3, RefreshCw, Search, RotateCcw, X } from 'lucide-react'
import { Badge, Button, Card, Input } from './components/ui'
import { usageDays, usageModels } from './usage-data.mjs'
import type { Host, Stats, UsageModel } from './types'
import './usage.css'

const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
const compact = (value: number) => value >= 1e6 ? `${Number((value / 1e6).toFixed(1))}M`
  : value >= 1e3 ? `${Number((value / 1e3).toFixed(1))}K` : number(value)
const measured = (value?: number | null) => value != null && Number.isFinite(value) ? number(value) : '—'

export function Usage({ stats, host, active }: { stats: Stats; host: Host; active: boolean }) {
  const [period, setPeriod] = useState(14)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('calls')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refreshingRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    if (!active) {
      generation.current++
      refreshingRef.current = false
      setRefreshing(false); setMessage(''); setError('')
    }
    return () => { generation.current++ }
  }, [active])
  const days: { day: string; total: number }[] = usageDays(stats.days, period)
  const windowTotal = days.reduce((sum, day) => sum + day.total, 0)
  const max = Math.max(1, ...days.map(day => day.total))
  const models: { total: number; pages: number; page: number; rows: UsageModel[] } = usageModels(stats.models, { search, sort, page })
  useEffect(() => { if (page !== models.page) setPage(models.page) }, [page, models.page])
  const hasHistory = stats.requests > 0 || stats.turns > 0 || stats.models.length > 0 || stats.days.length > 0
  const metrics = [
    { name: 'User turns', value: stats.turns, detail: 'One user request counts as one turn', icon: Layers3 },
    { name: 'Physical requests', value: stats.requests, detail: 'Includes retries and extra requests for interrupted-stream recovery', icon: Activity },
    { name: 'Input tokens', value: stats.grand.input, detail: 'Based on reported usage', icon: ArrowDownToLine },
    { name: 'Output tokens', value: stats.grand.output, detail: 'Based on reported usage', icon: ArrowUpFromLine },
    { name: 'Failed turns', value: stats.failedTurns, detail: 'User turns that ultimately did not complete', icon: CircleAlert },
    { name: 'Recovered turns', value: stats.recoveredTurns, detail: 'User turns completed after recovery', icon: RotateCcw },
  ]
  const refresh = async () => {
    if (refreshingRef.current || !activeRef.current) return
    const started = ++generation.current
    const isCurrent = () => started === generation.current && activeRef.current
    refreshingRef.current = true
    setRefreshing(true); setMessage(''); setError('')
    try {
      await host.refresh()
      if (isCurrent()) setMessage('Statistics updated')
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.name === 'TimeoutError' ? 'Refreshing timed out. Please try again.'
        : reason instanceof TypeError && /fetch/i.test(reason.message) ? 'Cannot reach the local service. Make sure it is running and try again.'
        : reason.message : 'Refreshing statistics failed. Please try again.')
    } finally {
      if (isCurrent()) { refreshingRef.current = false; setRefreshing(false) }
    }
  }
  if (!active) return null
  return <div className="usage-browser" data-testid="usage-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / USAGE</div>
      <h1>Usage statistics</h1><p>View cumulative usage and daily trends on this machine.</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => { void refresh() }}>
        <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? 'Updating' : 'Update statistics'}
      </Button>
    </header>
    {message && <p className="usage-feedback" role="status">{message}</p>}
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span>
      <Button variant="ghost" aria-label="Dismiss statistics error" onClick={() => setError('')}><X size={15} /></Button></div>}
    <div className="usage-metrics">{metrics.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong title={number(metric.value)} data-metric={metric.name}>{metric.name.includes('Token') ? compact(metric.value) : number(metric.value)}</strong><p>{metric.detail}</p>
    </Card>)}</div>
    <div className="usage-scope"><span>Cumulative statistics · Not affected by the trend range below</span>
      <span>Failed physical requests <strong data-testid="usage-request-failures">{number(stats.requestFailures)}</strong></span>
      <span>Reasoning tokens <strong>{number(stats.grand.reasoning)}</strong></span></div>
    {(stats.logicalEstimated || stats.requestFailuresEstimated) && <p className="usage-estimated" role="note">
      <CircleAlert size={15} /><span>Historical statistics include estimates:
        {stats.logicalEstimated && 'Pre-migration user turns are estimated from historical requests.'}
        {stats.requestFailuresEstimated && 'Some failed physical requests are estimated from retained records.'}
        New records use separate request and turn statistics.</span></p>}
    <Card className="usage-trend">
      <div className="card-heading"><div><h2>Daily token usage</h2><p>Last {period} days · Input and output combined</p></div>
        <div className="channel-filters" role="group" aria-label="Trend time range">{[7, 14, 30].map(count =>
          <button key={count} aria-pressed={period === count} onClick={() => setPeriod(count)}>{count} days</button>)}</div>
      </div>
      <div className="usage-window-total"><strong data-testid="usage-window-total">{number(windowTotal)}</strong><span>Tokens / selected period</span></div>
      <p className="usage-scroll-hint">Swipe sideways to see all dates.</p>
      <div className="usage-trend-scroll"><div className="usage-trend-chart" style={{ minWidth: period * 35 }}
        role="img" aria-label={`Token usage for the last ${period} days: ${days.map(day => `${day.day} ${number(day.total)}`).join('; ')}`}>
        {days.map(day => <div className="usage-day" key={day.day} tabIndex={0} title={`${day.day} · ${number(day.total)} Token`}
          aria-label={`${day.day}: ${number(day.total)} tokens`}>
          <div className="usage-day-track"><div className={`usage-day-bar ${day.total ? '' : 'zero'}`} style={{ height: `${Math.max(1, day.total / max * 100)}%` }} /></div>
          <span>{day.day.slice(5).replace('-', '/')}</span>
        </div>)}
      </div></div>
      {windowTotal === 0 && <p className="usage-window-empty" role="status">{hasHistory ? 'No token usage was recorded in the selected period; the cumulative statistics still retain the historical records.' : 'No calls recorded yet. Once a client is connected, usage will appear here.'}</p>}
      <div className="card-foot"><span>{days[0].day} — {days[days.length - 1].day} · Local calendar days</span><span>Unreported usage is not automatically estimated as actual tokens</span></div>
    </Card>
    <Card className="usage-model-panel">
      <div className="card-heading"><div><h2>Statistics by model</h2><p>Cumulative records · Up to 20 models per page</p></div>
        <Badge>{number(stats.models.length)} models</Badge></div>
      <div className="usage-model-filters"><div className="usage-model-search"><Search size={16} />
        <Input type="search" aria-label="Search model statistics" placeholder="Search model name or ID…" value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
        <select aria-label="Sort model statistics" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
          <option value="calls">Most physical requests</option><option value="tokens">Most token usage</option>
          <option value="failedTurns">Most failed turns</option><option value="name">Model name</option>
        </select>
        {search && <Button variant="ghost" onClick={() => { setSearch(''); setPage(1) }}><X size={14} />Clear search</Button>}
      </div>
      {models.total ? <><p className="usage-scroll-hint">Swipe sideways to see the full statistics.</p>
      <div className="usage-model-scroll" tabIndex={0} role="region" aria-label="Cumulative statistics by model, scrollable horizontally">
        <table className="usage-model-table"><thead><tr>
          <th scope="col">Model / ID</th><th scope="col">User turns</th><th scope="col">Physical requests</th><th scope="col">Input tokens</th>
          <th scope="col">Output tokens</th><th scope="col">Failed turns</th><th scope="col">Recovered turns</th><th scope="col">Time to first token</th><th scope="col">Generation speed</th>
        </tr></thead><tbody>{models.rows.map(model => <tr key={model.model} data-usage-model={model.model}>
          <td><strong>{model.name}</strong><code>{model.model}</code></td><td>{number(model.turns)}</td>
          <td>{number(model.calls)}<small>Failed {number(model.failed)}</small></td>
          <td>{number(model.input)}</td><td>{number(model.output)}</td><td>{number(model.failedTurns)}</td>
          <td>{number(model.recoveredTurns)}</td><td>{measured(model.avgTtftMs)}<small>ms</small></td><td>{measured(model.tps)}<small>Token/s</small></td>
        </tr>)}</tbody></table>
      </div></> : <div className="usage-empty"><Activity size={25} /><h3>{search.trim() ? 'No matching models' : 'No model usage records yet'}</h3>
        <p>{search.trim() ? 'Try another name or ID, or clear the search.' : 'After connecting a client and sending a message, model statistics will appear here.'}</p></div>}
      <div className="usage-pagination"><span data-testid="usage-model-count">{number(models.total)} / {number(stats.models.length)} models</span>
        <span>Page {models.page} / {models.pages}</span><Button variant="outline" aria-label="Previous page of model statistics" disabled={models.page === 1}
          onClick={() => setPage(models.page - 1)}><ChevronLeft size={15} />Previous</Button>
        <Button variant="outline" aria-label="Next page of model statistics" disabled={models.page === models.pages}
          onClick={() => setPage(models.page + 1)}>Next<ChevronRight size={15} /></Button></div>
    </Card>
    <p className="footnote">Statistics record usage and performance only; prompts and answers are not stored. Time to first token and generation speed are based on retained measurable samples; “—” is shown when nothing was measured.</p>
  </div>
}
