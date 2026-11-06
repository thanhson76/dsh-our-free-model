import { useEffect, useRef, useState } from 'react'
import { providers } from 'ofm-provider-list'
import { Activity, ArrowRight, ArrowUpRight, Boxes, Check, CircleCheck, Copy, Handshake, Layers3, Network, RefreshCw, Terminal, Zap } from 'lucide-react'
import { Badge, Button, Card } from './ui'
import '../usage.css'
import type { Host, Snapshot } from '../types'

const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : number(value)

export function Overview({ summary, stats, host }: Snapshot & { host: Host }) {
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const metricRows = [
    { name: 'Routable models', value: number(summary.catalog.filter(model => model.routable).length), icon: Boxes, detail: 'The currently published model catalog' },
    { name: 'User turns', value: number(stats.turns), icon: Layers3, detail: `${number(stats.requests)} physical requests` },
    { name: 'Total tokens', value: compact(stats.grand.input + stats.grand.output), icon: Zap, detail: `Input ${compact(stats.grand.input)} · Output ${compact(stats.grand.output)}` },
    { name: 'Recovered turns', value: number(stats.recoveredTurns), icon: Activity, detail: `${number(stats.failedTurns)} turns ultimately unfinished` },
  ]
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(today); at.setDate(at.getDate() - 6 + index)
    const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    return { id, value: stats.days.find(row => row.day === id)?.total ?? 0 }
  })
  const total = days.reduce((sum, row) => sum + row.value, 0)
  const max = Math.max(1, ...days.map(row => row.value))
  const failures = [...stats.samples].reverse().filter(row => row.ok === false).slice(0, 4)
  const sources = [
    { name: 'Anonymous and Kilo', sub: 'Free models that need no account', icon: Zap, count: summary.catalog.filter(row => row.channel === 'anonymous' || row.channel === 'kilo').length, page: 'models' as const },
    { name: 'EAC router', sub: `${providers.length} providers, separate account pool`, icon: Network, count: summary.catalog.filter(row => !['anonymous', 'kilo', 'eac'].includes(row.channel)).length, page: 'channels' as const },
    { name: 'EAC co-paid channel', sub: summary.eacAuth?.local ? 'Local authorization saved' : 'No local authorization saved yet', icon: Handshake, count: summary.catalog.filter(row => row.channel === 'eac').length, page: 'eac' as const },
  ]

  const copyEndpoint = () => {
    void host.copy(`${summary.baseUrl}/v1`).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    }).catch(host.error)
  }

  return <div className="dashboard" data-testid="overview-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / OVERVIEW</div><h1>Workspace overview</h1><p>See your model connections and runtime status.</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => {
        setRefreshing(true); void host.refresh().catch(host.error).finally(() => setRefreshing(false))
      }}><RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? 'Refreshing' : 'Refresh status'}</Button></header>

    <div className="dashboard-metrics">{metricRows.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong>{metric.value}</strong><p>{metric.detail}</p>
    </Card>)}</div>

    <div className="dashboard-main-grid">
      <Card className="usage-panel ov-chart-panel">
        <div className="card-heading"><div><h2>Token usage</h2><p>Input and output over the last 7 days</p></div><Badge>Last 7 days</Badge></div>
        <div className="usage-total ov-chart-total">{compact(total)} <span>Token</span></div>
        <div className="dashboard-chart ov-chart" role="img" aria-label={`Token usage over the last seven days: ${days.map(day => `${day.id} ${day.value}`).join('; ')}`}>
          <div className="chart-grid-lines"><span /><span /><span /><span /></div>
          {days.map(day => <div className="dashboard-chart-column ov-chart-col" key={day.id} title={`${day.id} · ${number(day.value)} Token`}>
            <div className={`dashboard-chart-bar ${day.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(2, day.value / max * 80)}%` }} />
            <span>{day.id.slice(5).replace('-', '/')}</span>
          </div>)}
          {total === 0 && <div className="chart-empty ov-chart-empty"><Activity size={22} /><span>No call records yet</span><small>Once a client is connected, usage will appear here</small></div>}
        </div>
        <div className="card-foot"><span>Counted from actual request records</span><button onClick={() => host.navigate('usage')}>View all usage <ArrowRight size={14} /></button></div>
      </Card>

      <Card className="quick-connect ov-quick">
        <div className="quick-icon ov-quick-icon"><Terminal size={20} /></div>
        <h2>API access</h2><p>OpenAI-compatible · Chat Completions / Responses</p>
        <label>API BASE URL</label>
        <div className="quick-endpoint ov-endpoint"><code>{summary.baseUrl}/v1</code>
          <Button variant="ghost" aria-label="Copy API address" onClick={copyEndpoint} title="Copy API address"
            className={copied ? 'ov-copied' : ''}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
        </div>
        {copied && <span className="copy-feedback" role="status">Address copied</span>}
        <div className="connect-steps"><span>Management session: separate local session</span><span>Inference authentication: Bearer API Key</span><span>Listen scope: loopback addresses only</span></div>
        <Button className="connect-button" onClick={() => host.navigate('connection')}>View connection configuration <ArrowUpRight size={16} /></Button>
        <div className="connection-footnote"><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? 'Inference service enabled' : 'Inference service paused'}</div>
      </Card>
    </div>

    <div className="dashboard-bottom-grid">
      <Card className="ov-sources">
        <div className="card-heading"><div><h2>Model sources</h2><p>All channels share a single access address</p></div><Network size={18} /></div>
        <div className="source-list ov-source-list">{sources.map((source, index) => <button className="source-row ov-source-row" key={source.name} onClick={() => host.navigate(source.page)}
          style={{ animationDelay: `${index * 60}ms` }}>
          <span className="source-icon"><source.icon size={18} /></span>
          <span><strong>{source.name}</strong><small>{source.sub}</small></span>
          <Badge>{source.count} models</Badge><ArrowRight size={14} />
        </button>)}</div>
      </Card>

      <Card className="ov-failures">
        <div className="card-heading"><div><h2>Runtime checks</h2><p>The service and recent failed requests</p></div>
          <Badge tone={failures.length ? 'warning' : 'success'}>{failures.length ? 'Failures recorded' : 'No failures recorded'}</Badge></div>
        <div className="runtime-check"><CircleCheck size={17} /><span>Channel module</span><strong>{summary.channels.state === 'ready' ? 'Ready' : summary.channels.state === 'failed' ? 'Failed to load' : 'Initializing'}</strong></div>
        <div className="runtime-check"><RefreshCw size={17} /><span>Automatic model refresh</span><strong>{summary.automaticRefresh ? `Every ${summary.settings.probeIntervalMinutes} minutes` : 'Paused'}</strong></div>
        {failures.length ? <div className="failure-list ov-failure-list">{failures.map((row, index) =>
          <div key={`${row.at}-${index}`} className="ov-failure-row">
            <span>{row.model ?? 'Unknown model'}</span>
            <small>{row.at ? new Date(row.at).toLocaleTimeString('en-US') : 'Unknown time'} · Request did not complete</small>
          </div>)}</div>
          : <div className="runtime-empty ov-runtime-empty"><CircleCheck size={18} /><span>No failures in the recent request samples</span></div>}
        <div className="card-foot"><span title={summary.dataDir}>Data is stored only in a separate directory on this machine</span><button onClick={() => host.navigate('settings')}>Service settings <ArrowRight size={14} /></button></div>
      </Card>
    </div>
  </div>
}
