import { validateAiUrl } from './settings'
import type { AiSettings } from './types'
import { normalizeSourceText } from './text'
import { buildPrompt } from './prompt'

export { buildPrompt } from './prompt'

export async function requestAiTranslation(text: string, settings: AiSettings, signal?: AbortSignal): Promise<string> {
  const source = normalizeSourceText(text)
  if (!source) throw new Error('翻译内容为空。')
  if (!settings.apiKey.trim()) throw new Error('请填写 API Key。')
  if (!settings.model.trim()) throw new Error('请填写模型。')

  const endpoint = validateAiUrl(settings.apiUrl)
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort('timeout'), settings.timeoutMs)
  const merged = mergeSignals(signal, timeout.signal)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: buildPrompt(settings.prompt, source) }],
        temperature: 0.1,
        stream: false,
      }),
      signal: merged.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('application/json')) throw new Error('AI 返回不是 JSON。')
    const result = readAssistantContent(await response.json().catch(() => null))
    if (!result) throw new Error('AI 返回内容为空。')
    return result
  } finally {
    clearTimeout(timeoutId)
    merged.dispose()
  }
}

export function readAssistantContent(payload: unknown): string {
  const root = readRecord(payload)
  const choices = Array.isArray(root.choices) ? root.choices : []
  for (const rawChoice of choices) {
    const choice = readRecord(rawChoice)
    const message = readRecord(choice.message)
    const content = message.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    if (Array.isArray(content)) {
      const text = content
        .map(readRecord)
        .map((part) => typeof part.text === 'string' ? part.text : '')
        .join('')
        .trim()
      if (text) return text
    }
  }
  return ''
}

function mergeSignals(parent?: AbortSignal, timeout?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason ?? new DOMException('Cancelled', 'AbortError'))
  const abortFromTimeout = () => controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  parent?.addEventListener('abort', abortFromParent, { once: true })
  timeout?.addEventListener('abort', abortFromTimeout, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      parent?.removeEventListener('abort', abortFromParent)
      timeout?.removeEventListener('abort', abortFromTimeout)
    },
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}
