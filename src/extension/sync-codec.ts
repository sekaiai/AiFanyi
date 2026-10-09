import { migrateSettings } from '../core/settings'
import type { TranslationSettings } from '../core/types'

const SYNC_FORMAT_VERSION = 1

export const SYNC_CHUNK_MAX_BYTES = 6000
export const SYNC_TOTAL_MAX_BYTES = 90 * 1024

/** Versioned wire representation of the full settings object. */
export function encodeSyncSettings(settings: TranslationSettings): string {
  return JSON.stringify({ v: SYNC_FORMAT_VERSION, s: migrateSettings(settings) })
}

export function decodeSyncSettings(payload: string): TranslationSettings {
  let packed: unknown
  try {
    packed = JSON.parse(payload)
  } catch {
    throw new Error('同步数据不是有效 JSON')
  }
  if (typeof packed !== 'object' || packed === null || Array.isArray(packed) || (packed as Record<string, unknown>).v !== SYNC_FORMAT_VERSION) {
    throw new Error('同步数据格式不受支持')
  }
  return migrateSettings((packed as Record<string, unknown>).s)
}

/** Produces strings whose JSON storage value stays within the per-item quota. */
export function splitSyncPayload(payload: string): string[] {
  const chunks: string[] = []
  for (let start = 0; start < payload.length;) {
    let end = Math.min(payload.length, start + 900)
    if (end < payload.length && isHighSurrogate(payload.charCodeAt(end - 1))) end--
    while (end > start && byteSize(JSON.stringify(payload.slice(start, end))) > SYNC_CHUNK_MAX_BYTES) end--
    if (end === start) throw new Error('同步数据分片失败')
    chunks.push(payload.slice(start, end))
    start = end
  }
  return chunks
}

export function byteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff
}