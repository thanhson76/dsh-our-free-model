import { Coffee, Activity, Boxes, Cable, ChevronRight, Handshake, LayoutDashboard, LogOut, Moon, Network, Settings2, ShieldCheck, Sun, Monitor, PanelsTopLeft, LibraryBig, Route, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { Badge, Button } from './ui'
import type { Host, Page, Summary } from '../types'
import { hasDesktopBridge } from '../desktop-update'

const navigation = [
  { label: 'Workspace', items: [
    { id: 'overview', name: 'Overview', icon: LayoutDashboard },
    { id: 'workspace', name: 'Model workbench', icon: PanelsTopLeft },
    { id: 'agents', name: 'Clients and subscriptions', icon: Monitor },
    { id: 'models', name: 'Model catalog', icon: Boxes },
    { id: 'usage', name: 'Usage statistics', icon: Activity },
    { id: 'library', name: 'Library', icon: LibraryBig },
  ] },
  { label: 'Channels and connections', items: [
    { id: 'providers', name: 'Aggregate channels', icon: PanelsTopLeft },
    { id: 'routing', name: 'Routing groups', icon: Route },
    { id: 'channels', name: 'EAC router', icon: Network },
    { id: 'eac', name: 'EAC co-paid channel', icon: Handshake },
    { id: 'connection', name: 'API access', icon: Cable },
  ] },
  { label: 'Management', items: [{ id: 'settings', name: 'Service settings', icon: Settings2 }, { id: 'updates', name: 'App updates', icon: RotateCw }] },
  { label: 'Project support', items: [{ id: 'sponsor', name: 'Ads from sponsors', icon: Coffee }] },
] as const

/**
 * Every page the sidebar can reach, in sidebar order.
 *
 * `App` uses it as a navigation allowlist: a page not on this list is **silently dropped** by `host.navigate`.
 * Previously `app.tsx` kept its own copy of the same array, and when the two drifted apart the “Model workbench”
 * item stopped responding to clicks — the sidebar had the item but the allowlist did not, so `navigate('workspace')` was
 * short-circuited by `includes`, with no error, no loading and no switch of the content area (#678).
 *
 * Deriving it from the sidebar rather than restating it is the only way to make sure the two can never drift apart again.
 */
export const navigationPages: Page[] = navigation.flatMap(group => group.items.map(item => item.id))

type Origin = { x: number; y: number }

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const apply = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ofm-theme', next) } catch { /* If storage is unavailable, it applies to this session only */ }
    setTheme(next)
  }
  const toggle = (origin?: Origin) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // With no View Transition, or when the user prefers reduced motion, switch directly without the spread effect.
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return }
    const root = document.documentElement
    // Take the radius as the distance from the button centre to the farthest viewport corner, so the disc always covers the whole screen.
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
    root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)
    // Disable the 300 ms background-colour transition while spreading, otherwise the “new theme” snapshot would capture an in-between colour.
    root.classList.add('theme-transitioning')
    const transition = document.startViewTransition(() => { flushSync(() => apply(next)) })
    const finish = () => {
      root.classList.remove('theme-transitioning')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    }
    transition.finished.then(finish, finish)
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'
  return <Button variant="ghost" className="theme-toggle" aria-label={label} title={theme === 'dark' ? 'Light' : 'Dark'}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={16} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={16} /></span>
    </span>
  </Button>
}

export const pageNames: Record<Page, string> = {
  overview: 'Overview', workspace: 'Model workbench', models: 'Model catalog', usage: 'Usage statistics', channels: 'EAC router',
  agents: 'Clients and subscriptions', providers: 'Aggregate channels', library: 'Library', routing: 'Routing groups',
  eac: 'EAC co-paid channel', settings: 'Service settings', updates: 'App updates', connection: 'API access', sponsor: 'Ads from sponsors',
}

export function Sidebar({ page, summary, host, onDisclaimer }: { page: Page; summary?: Summary; host: Host; onDisclaimer(): void }) {
  return <>
    <a className="console-brand" href="/" aria-label="Our Free Model home">
      <img className="console-mark" src={brandMark} alt="" width={34} height={36} />
      <span>Our Free Model<small>Local model workbench</small></span>
    </a>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={17} /></span>
      <span>Personal workspace<small>Standalone local service</small></span><Badge>This machine</Badge>
    </div>
    <nav className="console-nav" aria-label="Management navigation">{navigation.map(group => <div className="nav-group" key={group.label}>
      <span className="nav-group-label">{group.label}</span>
      {group.items.filter(item => item.id !== 'updates' || hasDesktopBridge()).map(item => <button key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined} className={`console-nav-item ${item.id === 'sponsor' ? 'ofm-sponsor-nav' : ''} ${page === item.id ? 'selected' : ''}`}
        aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
        <span className="console-nav-indicator" aria-hidden="true" />
        <item.icon size={18} strokeWidth={1.7} /><span>{item.name}</span>
        {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
      </button>)}
    </div>)}</nav>
    <div className="sidebar-support"><ShieldCheck size={17} /><div><strong>Standalone local storage</strong><p>Runs on this machine / listens on loopback addresses only</p></div></div>
    <div className="console-sidebar-footer"><div><span className="status-dot" />Local service online<small>v{summary?.version ?? '—'}</small></div>
      <ThemeToggle /><Button variant="ghost" aria-label="Exit management" title="Exit management" onClick={() => { void host.logout().catch(host.error) }}><LogOut size={16} /></Button></div>
    <button type="button" className="sidebar-disclaimer" onClick={onDisclaimer}>Usage notes and disclaimer</button>
  </>
}
export function Topbar({ page, summary }: { page: Page; summary?: Summary }) {
  return <><div className="console-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong key={page} className="console-breadcrumb-current">{pageNames[page]}</strong></div>
    <div className="console-topbar-status"><span className="status-dot" /><span>{summary?.settings.enabled === false ? 'Inference paused' : 'Local service'}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
