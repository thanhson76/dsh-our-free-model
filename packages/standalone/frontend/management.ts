import { useCallback, useEffect, useRef, useState } from 'react'

function redact(value: string, body: unknown): string {
  const secrets: string[] = []
  const collect = (entry: unknown) => {
    if (typeof entry === 'string' && entry) secrets.push(entry)
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(collect)
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    collect(record.credentials)
    collect(record.apiKey)
  }
  return secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value)
    .replace(/\b(?:sk-|AIza|Bearer\s+)[\w.-]{8,}/gi, '[redacted]')
}

export async function management<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/management${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  })
  if (response.status === 401) window.dispatchEvent(new CustomEvent('ofm:unauthorized'))
  const value = await response.json().catch(() => { throw new Error(`The service returned an invalid response (${response.status})`) })
  if (!response.ok || value?.ok === false) {
    const reason = value?.error?.message ?? value?.error ?? value?.message
    throw new Error(redact(typeof reason === 'string' ? reason : `Request failed (${response.status})`, body))
  }
  return value as T
}

export const failureMessage = (error: unknown) => error instanceof Error
  ? error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : error.message
  : 'The operation failed. Please try again.'

export function useManagementResource<T>(path: string, active: boolean) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const live = useRef(false)
  const reload = useCallback(async () => {
    if (!live.current) return
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setLoading(true)
    try {
      const value = await management<T>(path, undefined, next.signal)
      if (!next.signal.aborted && live.current) { setData(value); setError('') }
    } catch (reason) {
      if (!next.signal.aborted && live.current) setError(failureMessage(reason))
    } finally { if (!next.signal.aborted && live.current) setLoading(false) }
  }, [path])
  useEffect(() => {
    live.current = active
    if (active) void reload()
    return () => { live.current = false; controller.current?.abort() }
  }, [active, reload])
  return { data, error, loading, reload }
}
