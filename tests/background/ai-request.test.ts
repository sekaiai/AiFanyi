import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAssistantContent, requestAiTranslation } from '../../src/core/ai'
import type { AiSchemeSettings } from '../../src/core/types'

const settings: AiSchemeSettings = {
  id: 'ai-1',
  type: 'ai',
  enabled: true,
  label: '',
  apiUrl: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk-private',
  model: 'test-model',
  timeoutMs: 5000,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AI requests', () => {
  it('uses the configured authorization header and OpenAI-compatible body', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-private')
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'test-model',
        messages: [{ role: 'user', content: '请把下面内容翻译成English，只返回译文，不要解释：\n\nHello world' }],
      })
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好，世界' } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestAiTranslation('Hello world', settings, 'English')).resolves.toBe('你好，世界')
    expect(fetchMock).toHaveBeenCalledWith(settings.apiUrl, expect.objectContaining({ method: 'POST' }))
  })

  it('rejects non-JSON, empty, and HTTP error responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } })))
    await expect(requestAiTranslation('hello', settings, 'English')).rejects.toThrow('不是 JSON')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { headers: { 'content-type': 'application/json' } })))
    await expect(requestAiTranslation('hello', settings, 'English')).rejects.toThrow('内容为空')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    await expect(requestAiTranslation('hello', settings, 'English')).rejects.toThrow('HTTP 429')
  })

  it('supports cancellation without exposing credentials in errors', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))
    const result = requestAiTranslation('hello', settings, 'English', controller.signal)
    controller.abort(new DOMException('Cancelled', 'AbortError'))
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('AI response parsing', () => {
  it('reads string and multipart assistant content', () => {
    expect(readAssistantContent({ choices: [{ message: { content: '  result  ' } }] })).toBe('result')
    expect(readAssistantContent({ choices: [{ message: { content: [{ text: 'part ' }, { text: 'two' }] } }] })).toBe('part two')
    expect(readAssistantContent({ unexpected: true })).toBe('')
  })
})
