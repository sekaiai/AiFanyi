import type { DictionaryResult } from './dictionary'
import type { TranslationSettings } from './types'

export type RequestId = string | number

export type ExtensionMessage =
  | { type: 'translation.request'; requestId: RequestId; text: string }
  | { type: 'translation.cancel'; requestId: RequestId }
  | { type: 'settings.testScheme'; requestId: RequestId; schemeId: string }

export type PublicSettingsRequest = { type: 'settings.public.request' }
export type PublicSettingsUpdate = { type: 'settings.public.update'; settings: TranslationSettings }
export type PublicSettingsResponse = { type: 'settings.public.response'; settings: TranslationSettings }

export type ExtensionResponse =
  | { ok: true; requestId: RequestId; kind: 'dictionary'; result: DictionaryResult }
  | { ok: true; requestId: RequestId; kind: 'text'; result: string }
  | { ok: true; requestId: RequestId; kind: 'cancelled' | 'tested' }
  | { ok: false; requestId: RequestId; error: DisplayError }

export interface DisplayError {
  code: 'cancelled' | 'bad_config' | 'disabled' | 'blacklisted' | 'http' | 'timeout' | 'empty' | 'parse' | 'network' | 'unknown'
  message: string
  retryable: boolean
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  if (typeof message.requestId !== 'string' && typeof message.requestId !== 'number') return false
  if (message.type === 'translation.cancel') return true
  if (message.type === 'settings.testScheme') return typeof message.schemeId === 'string'
  return message.type === 'translation.request' && typeof message.text === 'string'
}

export function isPublicSettingsRequest(value: unknown): value is PublicSettingsRequest {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).type === 'settings.public.request'
}

export function isPublicSettingsUpdate(value: unknown): value is PublicSettingsUpdate {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).type === 'settings.public.update'
}

export function toDisplayError(error: unknown): DisplayError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'cancelled', message: '请求已取消', retryable: false }
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { code: 'timeout', message: '请求超时，请稍后重试', retryable: true }
  }
  const raw = error instanceof Error ? error.message : '未知错误'
  const message = raw.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [redacted]')
  if (message.startsWith('HTTP')) return { code: 'http', message, retryable: true }
  if (message.includes('JSON') || message.includes('为空')) return { code: 'parse', message, retryable: true }
  if (message.includes('填写') || message.includes('地址')) return { code: 'bad_config', message, retryable: false }
  return { code: 'network', message, retryable: true }
}
