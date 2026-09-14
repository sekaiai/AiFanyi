import type { DictionaryResult } from './dictionary'
import type { SchemeSettings, TranslationSettings } from './types'
import type { WordProbeState } from './word-sources'

export type RequestId = string | number

export type ExtensionMessage =
  | { type: 'translation.request'; requestId: RequestId; text: string }
  | { type: 'translation.cancel'; requestId: RequestId }
  | { type: 'settings.testScheme'; requestId: RequestId; scheme: SchemeSettings }

type PublicSettingsRequest = { type: 'settings.public.request' }
export type PublicSettingsUpdate = { type: 'settings.public.update'; settings: TranslationSettings }
export type PublicSettingsResponse = { type: 'settings.public.response'; settings: TranslationSettings }

type WordSourcesMessage =
  | { type: 'wordSources.state'; requestId: RequestId }
  | { type: 'wordSources.probe'; requestId: RequestId }

export type WordSourcesResponse =
  | { type: 'wordSources.state'; requestId: RequestId; state: WordProbeState }
  | { type: 'wordSources.probe'; requestId: RequestId; state: WordProbeState }

export type ExtensionResponse =
  | { ok: true; requestId: RequestId; kind: 'dictionary'; result: DictionaryResult }
  | { ok: true; requestId: RequestId; kind: 'text'; result: string }
  | { ok: false; requestId: RequestId; error: DisplayError }

export interface DisplayError {
  message: string
  retryable: boolean
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  if (typeof message.requestId !== 'string' && typeof message.requestId !== 'number') return false
  if (message.type === 'translation.cancel') return true
  if (message.type === 'settings.testScheme') return isSchemeSettings(message.scheme)
  return message.type === 'translation.request' && typeof message.text === 'string'
}

export function isWordSourcesMessage(value: unknown): value is WordSourcesMessage {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as Record<string, unknown>).type
  return type === 'wordSources.state' || type === 'wordSources.probe'
}

function isSchemeSettings(value: unknown): value is SchemeSettings {
  if (typeof value !== 'object' || value === null) return false
  const scheme = value as Record<string, unknown>
  return typeof scheme.id === 'string' && typeof scheme.type === 'string'
}

export function isPublicSettingsRequest(value: unknown): value is PublicSettingsRequest {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).type === 'settings.public.request'
}

export function isPublicSettingsUpdate(value: unknown): value is PublicSettingsUpdate {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).type === 'settings.public.update'
}

export function toDisplayError(error: unknown): DisplayError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { message: '请求已取消', retryable: false }
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { message: '请求超时，请稍后重试', retryable: true }
  }
  const raw = error instanceof Error ? error.message : '未知错误'
  const message = raw.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [redacted]')
  if (message.startsWith('HTTP')) return { message, retryable: true }
  if (message.includes('JSON') || message.includes('为空')) return { message, retryable: true }
  if (message.includes('填写') || message.includes('地址')) return { message, retryable: false }
  return { message, retryable: true }
}
