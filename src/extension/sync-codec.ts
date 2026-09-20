import { DEFAULT_SETTINGS, TARGET_LANGUAGES, migrateSettings, uid } from '../core/settings'
import type { BubbleSettings, SchemeSettings, SchemeType, TranslationSettings, WordQuerySettings } from '../core/types'

const TOP_FIELDS = ['uiLocale', 'enabled', 'siteBlacklist', 'hoverEnabled', 'selectionEnabled', 'hoverDelayMs', 'targetLanguage', 'schemeOrder', 'bubble', 'schemes', 'word'] as const
const BUBBLE_FIELDS = ['side', 'align', 'gap', 'offsetX', 'offsetY', 'showArrow', 'showOriginal', 'colorPreset', 'background', 'textColor', 'borderColor', 'highlightColor', 'borderWidth', 'radius', 'shadow', 'padding', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign'] as const
const WORD_FIELDS = ['showOriginal', 'speakEnabled', 'accent', 'sources'] as const
const WORD_SOURCE_KEYS = ['youdao', 'bing', 'google', 'freedictionaryapi'] as const
const SCHEME_TYPES = ['deepl', 'google', 'googleCloud', 'baidu', 'baiduAi', 'volcengine', 'ai', 'bing', 'mymemory', 'yandex', 'reverso'] as const satisfies readonly SchemeType[]

const ENUMS = {
  uiLocale: ['zh', 'en'],
  schemeOrder: ['random', 'sequential'],
  side: ['top', 'bottom', 'left', 'right'],
  align: ['start', 'center', 'end'],
  colorPreset: ['paper', 'warm', 'mint', 'sky', 'night', 'custom'],
  shadow: ['none', 'soft', 'medium', 'strong'],
  fontFamily: ['system', 'serif', 'mono'],
  fontWeight: ['400', '500', '600'],
  textAlign: ['left', 'center', 'right'],
  accent: ['us', 'uk'],
} as const

const SCHEME_FIELDS: Record<SchemeType, readonly [string, unknown][]> = {
  deepl: [['authKey', ''], ['endpoint', 'free']],
  google: [],
  googleCloud: [['apiKey', '']],
  baidu: [['appId', ''], ['secretKey', '']],
  baiduAi: [['appId', ''], ['secretKey', ''], ['modelType', 'nmt']],
  volcengine: [['accessKeyId', ''], ['secretAccessKey', ''], ['region', 'cn-north-1']],
  ai: [['label', ''], ['apiUrl', ''], ['apiKey', ''], ['model', ''], ['timeoutMs', 20000]],
  bing: [],
  mymemory: [],
  yandex: [],
  reverso: [],
}

export const SYNC_CHUNK_MAX_BYTES = 6000
export const SYNC_TOTAL_MAX_BYTES = 90 * 1024

/** Compact, versioned wire representation. It deliberately contains no user-facing field names. */
export function encodeSyncSettings(settings: TranslationSettings): string {
  const value = migrateSettings(settings)
  const entries: [boolean, unknown][] = [
    [value.uiLocale !== DEFAULT_SETTINGS.uiLocale, enumCode('uiLocale', value.uiLocale)],
    [value.enabled !== DEFAULT_SETTINGS.enabled, value.enabled ? 1 : 0],
    [!same(value.siteBlacklist, DEFAULT_SETTINGS.siteBlacklist), value.siteBlacklist],
    [value.hoverEnabled !== DEFAULT_SETTINGS.hoverEnabled, value.hoverEnabled ? 1 : 0],
    [value.selectionEnabled !== DEFAULT_SETTINGS.selectionEnabled, value.selectionEnabled ? 1 : 0],
    [value.hoverDelayMs !== DEFAULT_SETTINGS.hoverDelayMs, value.hoverDelayMs],
    [value.targetLanguage !== DEFAULT_SETTINGS.targetLanguage, TARGET_LANGUAGES.indexOf(value.targetLanguage as never)],
    [value.schemeOrder !== DEFAULT_SETTINGS.schemeOrder, enumCode('schemeOrder', value.schemeOrder)],
    [packBubble(value.bubble)[0] !== 0, packBubble(value.bubble)],
    [!same(value.schemes, DEFAULT_SETTINGS.schemes), value.schemes.map(packScheme)],
    [packWord(value.word)[0] !== 0, packWord(value.word)],
  ]
  let mask = 0
  const packed: unknown[] = [1]
  for (const [index, [changed, encoded]] of entries.entries()) {
    if (!changed) continue
    mask |= 1 << index
    packed.push(encoded)
  }
  packed.splice(1, 0, mask)
  return JSON.stringify(packed)
}

export function decodeSyncSettings(payload: string): TranslationSettings {
  let packed: unknown
  try {
    packed = JSON.parse(payload)
  } catch {
    throw new Error('同步数据不是有效 JSON')
  }
  if (!Array.isArray(packed) || packed[0] !== 1 || !isNumber(packed[1])) throw new Error('同步数据格式不受支持')

  const raw: Record<string, unknown> = {}
  const mask = packed[1]
  let valueIndex = 2
  for (const [index, field] of TOP_FIELDS.entries()) {
    if (!(mask & (1 << index))) continue
    const value = packed[valueIndex++]
    if (field === 'uiLocale' || field === 'schemeOrder') raw[field] = enumValue(field, value)
    else if (field === 'enabled' || field === 'hoverEnabled' || field === 'selectionEnabled') raw[field] = value === 1
    else if (field === 'targetLanguage') raw[field] = TARGET_LANGUAGES[asCode(value, TARGET_LANGUAGES.length)]
    else if (field === 'bubble') raw[field] = unpackBubble(value)
    else if (field === 'schemes') raw[field] = unpackSchemes(value)
    else if (field === 'word') raw[field] = unpackWord(value)
    else raw[field] = value
  }
  return migrateSettings(raw)
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

function packBubble(value: BubbleSettings): unknown[] {
  let mask = 0
  const packed: unknown[] = [0]
  for (const [index, field] of BUBBLE_FIELDS.entries()) {
    const current = value[field]
    const fallback = DEFAULT_SETTINGS.bubble[field]
    if (current === fallback) continue
    mask |= 1 << index
    packed.push(encodeBubbleValue(field, current))
  }
  packed[0] = mask
  return packed
}

function unpackBubble(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || !isNumber(value[0])) throw new Error('同步气泡设置损坏')
  const raw: Record<string, unknown> = {}
  let valueIndex = 1
  for (const [index, field] of BUBBLE_FIELDS.entries()) {
    if (!(value[0] & (1 << index))) continue
    raw[field] = decodeBubbleValue(field, value[valueIndex++])
  }
  return raw
}

function packWord(value: WordQuerySettings): unknown[] {
  let mask = 0
  const packed: unknown[] = [0]
  const sourceBits = WORD_SOURCE_KEYS.reduce((bits, key, index) => bits | (value.sources[key] ? 1 << index : 0), 0)
  const defaultSourceBits = WORD_SOURCE_KEYS.reduce((bits, key, index) => bits | (DEFAULT_SETTINGS.word.sources[key] ? 1 << index : 0), 0)
  const entries: [boolean, unknown][] = [
    [value.showOriginal !== DEFAULT_SETTINGS.word.showOriginal, value.showOriginal ? 1 : 0],
    [value.speakEnabled !== DEFAULT_SETTINGS.word.speakEnabled, value.speakEnabled ? 1 : 0],
    [value.accent !== DEFAULT_SETTINGS.word.accent, enumCode('accent', value.accent)],
    [sourceBits !== defaultSourceBits, sourceBits],
  ]
  for (const [index, [changed, encoded]] of entries.entries()) {
    if (!changed) continue
    mask |= 1 << index
    packed.push(encoded)
  }
  packed[0] = mask
  return packed
}

function unpackWord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || !isNumber(value[0])) throw new Error('同步单词设置损坏')
  const raw: Record<string, unknown> = {}
  let valueIndex = 1
  for (const [index, field] of WORD_FIELDS.entries()) {
    if (!(value[0] & (1 << index))) continue
    const item = value[valueIndex++]
    if (field === 'accent') raw[field] = enumValue('accent', item)
    else if (field === 'sources') {
      const bits = asCode(item, 16)
      raw[field] = {
        youdao: Boolean(bits & 1),
        bing: Boolean(bits & 2),
        google: Boolean(bits & 4),
        freedictionaryapi: Boolean(bits & 8),
      }
    } else raw[field] = item === 1
  }
  return raw
}

function packScheme(value: SchemeSettings): unknown[] {
  const fields = SCHEME_FIELDS[value.type]
  let mask = 0
  const packed: unknown[] = [SCHEME_TYPES.indexOf(value.type), packId(value.id, value.type), value.enabled ? 0 : 1, 0]
  for (const [index, [field, fallback]] of fields.entries()) {
    const current = (value as unknown as Record<string, unknown>)[field]
    if (current === fallback) continue
    mask |= 1 << index
    packed.push(current)
  }
  packed[3] = mask
  return packed
}

function unpackSchemes(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('同步翻译方案损坏')
  return value.map((item) => {
    if (!Array.isArray(item) || !isNumber(item[0]) || !isNumber(item[2]) || !isNumber(item[3])) throw new Error('同步翻译方案损坏')
    const type = SCHEME_TYPES[asCode(item[0], SCHEME_TYPES.length)]!
    const raw: Record<string, unknown> = { type, id: unpackId(item[1], type), enabled: item[2] !== 1 }
    let valueIndex = 4
    for (const [index, [field]] of SCHEME_FIELDS[type].entries()) {
      if (!(item[3] & (1 << index))) continue
      raw[field] = item[valueIndex++]
    }
    return raw
  })
}

function packId(id: string, type: SchemeType): string | null {
  if (id === `default-${type}`) return null
  const uuid = id.match(/^([\da-f]{8})-([\da-f]{4})-([\da-f]{4})-([\da-f]{4})-([\da-f]{12})$/i)
  if (!uuid) return id.startsWith('!') ? `!${id}` : id
  const bytes = new Uint8Array(id.replaceAll('-', '').match(/.{2}/g)!.map((value) => Number.parseInt(value, 16)))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `!${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

function unpackId(value: unknown, type: SchemeType): string {
  if (value === null) return `default-${type}`
  if (typeof value !== 'string') return uid()
  if (value.startsWith('!!')) return value.slice(1)
  if (!/^![\w-]{22}$/.test(value)) return value
  try {
    const binary = atob(value.slice(1).replaceAll('-', '+').replaceAll('_', '/'))
    if (binary.length !== 16) return uid()
    const hex = [...binary].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return uid()
  }
}

function encodeBubbleValue(field: typeof BUBBLE_FIELDS[number], value: unknown): unknown {
  if (field === 'showArrow' || field === 'showOriginal') return value ? 1 : 0
  if (field in ENUMS) return enumCode(field as keyof typeof ENUMS, value as never)
  return value
}

function decodeBubbleValue(field: typeof BUBBLE_FIELDS[number], value: unknown): unknown {
  if (field === 'showArrow' || field === 'showOriginal') return value === 1
  if (field in ENUMS) return enumValue(field as keyof typeof ENUMS, value)
  return value
}

function enumCode<Key extends keyof typeof ENUMS>(key: Key, value: typeof ENUMS[Key][number]): number {
  const index = (ENUMS[key] as readonly string[]).indexOf(value)
  if (index < 0) throw new Error('同步枚举值无效')
  return index
}

function enumValue<Key extends keyof typeof ENUMS>(key: Key, value: unknown): typeof ENUMS[Key][number] {
  return ENUMS[key][asCode(value, ENUMS[key].length)]!
}

function asCode(value: unknown, length: number): number {
  if (!isNumber(value) || !Number.isInteger(value) || value < 0 || value >= length) throw new Error('同步数据编码无效')
  return value
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
