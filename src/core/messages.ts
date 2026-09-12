import type { DictionaryResult } from './dictionary'

export type RequestId = string | number

export type ExtensionMessage =
  | { type: 'dictionary.lookup'; requestId: RequestId; text: string }
  | { type: 'translation.request'; requestId: RequestId; text: string }
  | { type: 'translation.cancel'; requestId: RequestId }
  | { type: 'settings.testAi'; requestId: RequestId }

export type ExtensionRequest = ExtensionMessage

export type ExtensionResponse =
  | { ok: true; requestId: RequestId; kind: 'dictionary'; result: DictionaryResult }
  | { ok: true; requestId: RequestId; kind: 'ai'; result: string }
  | { ok: true; requestId: RequestId; kind: 'cancelled' | 'tested' }
  | { ok: false; requestId: RequestId; error: DisplayError }

export type ExtensionMessageResponse = ExtensionResponse

export interface DisplayError {
  code: 'cancelled' | 'bad_config' | 'disabled' | 'blacklisted' | 'http' | 'timeout' | 'empty' | 'parse' | 'network' | 'unknown'
  message: string
  retryable: boolean
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  if (typeof message.requestId !== 'string' && typeof message.requestId !== 'number') return false
  if (message.type === 'translation.cancel' || message.type === 'settings.testAi') return true
  return (message.type === 'dictionary.lookup' || message.type === 'translation.request')
    && typeof message.text === 'string'
}
