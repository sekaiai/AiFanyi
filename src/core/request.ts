export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function requestJson(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithTimeout(url, init, timeoutMs, signal)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !contentType.includes('application/json')) throw new Error('响应不是 JSON。')
  return await response.json().catch(() => null)
}
