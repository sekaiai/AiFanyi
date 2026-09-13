import { validateAiUrl } from './settings'
import type { AiSchemeSettings } from './types'
import { normalizeSourceText } from './text'
import { buildPrompt } from './prompt'
import { readRecord } from './read'

export async function requestAiTranslation(text: string, settings: AiSchemeSettings, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const source = normalizeSourceText(text)
  if (!source) throw new Error('翻译内容为空。')
  if (!settings.apiKey.trim()) throw new Error('请填写 API 密钥。')
  if (!settings.model.trim()) throw new Error('请填写模型。')

  const endpoint = validateAiUrl(settings.apiUrl)
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), settings.timeoutMs)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: buildPrompt(`请把下面内容翻译成${targetLanguage}，只返回译文，不要解释：\n\n{text}`, source) }],
        temperature: 0.1,
        stream: false,
      }),
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('application/json')) throw new Error('AI 返回不是 JSON。')
    const result = readAssistantContent(await response.json().catch(() => null))
    if (!result) throw new Error('AI 返回内容为空。')
    return result
  } finally {
    clearTimeout(timeoutId)
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
