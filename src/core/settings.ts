import type { BubbleColorPreset, BubbleSettings, TranslationSettings } from './types'

export type { BubbleSettings as BubbleVisualSettings, TranslationSettings } from './types'

export const SETTINGS_STORAGE_KEY = 'aifanyi.settings.v1'
export const MAX_TRANSLATION_TEXT_LENGTH = 5000

export const COLOR_PRESETS: Record<Exclude<BubbleColorPreset, 'custom'>, Pick<BubbleSettings, 'background' | 'textColor' | 'borderColor'>> = {
  paper: { background: '#fbfbfc', textColor: '#30323a', borderColor: '#d6dae1' },
  warm: { background: '#fff8df', textColor: '#352b17', borderColor: '#ead38f' },
  mint: { background: '#effcf6', textColor: '#18352a', borderColor: '#a8dfc5' },
  sky: { background: '#eff7ff', textColor: '#1d3047', borderColor: '#a9caeb' },
  night: { background: '#20242d', textColor: '#f2f5f8', borderColor: '#495160' },
}

export const FONT_STACKS: Record<BubbleSettings['fontFamily'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
}

export const SHADOWS: Record<BubbleSettings['shadow'], string> = {
  none: 'none',
  soft: '0 6px 20px rgba(27, 34, 46, 0.12)',
  medium: '0 10px 30px rgba(27, 34, 46, 0.18)',
  strong: '0 16px 44px rgba(27, 34, 46, 0.26)',
}

export const DEFAULT_SETTINGS: TranslationSettings = {
  version: 1,
  enabled: true,
  siteBlacklist: [],
  hoverEnabled: true,
  selectionEnabled: true,
  hoverDelayMs: 200,
  targetLanguage: '简体中文',
  bubble: {
    side: 'top',
    align: 'start',
    gap: 8,
    offsetX: 0,
    offsetY: 0,
    showArrow: false,
    showOriginal: true,
    colorPreset: 'paper',
    ...COLOR_PRESETS.paper,
    borderWidth: 1,
    radius: 8,
    shadow: 'soft',
    padding: 10,
    fontFamily: 'system',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 1.55,
    textAlign: 'left',
  },
  ai: {
    apiUrl: '',
    apiKey: '',
    model: '',
    prompt: '请把下面内容翻译成简体中文，只返回译文，不要解释：\n\n{text}',
    timeoutMs: 20000,
  },
}

export function cloneDefaultSettings(): TranslationSettings {
  return structuredClone(DEFAULT_SETTINGS)
}

export function cloneSettings(settings: TranslationSettings = DEFAULT_SETTINGS): TranslationSettings {
  return structuredClone(settings)
}

export function sanitizeSettings(value: unknown): TranslationSettings {
  return migrateSettings(value)
}

export function migrateSettings(value: unknown): TranslationSettings {
  const input = isRecord(value) ? value : {}
  const rawBubble = isRecord(input.bubble) ? input.bubble : {}
  const rawAi = isRecord(input.ai) ? input.ai : {}
  const defaults = cloneDefaultSettings()
  const bubble = { ...defaults.bubble, ...rawBubble } as BubbleSettings
  const preset = bubble.colorPreset !== 'custom' && bubble.colorPreset in COLOR_PRESETS
    ? COLOR_PRESETS[bubble.colorPreset as Exclude<BubbleColorPreset, 'custom'>]
    : null

  return {
    ...defaults,
    ...input,
    version: 1,
    enabled: readBoolean(input.enabled, defaults.enabled),
    hoverEnabled: readBoolean(input.hoverEnabled, defaults.hoverEnabled),
    selectionEnabled: readBoolean(input.selectionEnabled, defaults.selectionEnabled),
    hoverDelayMs: clampNumber(input.hoverDelayMs, 0, 1000, defaults.hoverDelayMs),
    targetLanguage: readString(input.targetLanguage, defaults.targetLanguage),
    siteBlacklist: Array.isArray(input.siteBlacklist)
      ? input.siteBlacklist.map((item) => String(item).trim()).filter(Boolean)
      : defaults.siteBlacklist,
    bubble: {
      ...bubble,
      ...(preset ?? {}),
      side: readEnum(bubble.side, ['top', 'bottom', 'left', 'right'], defaults.bubble.side),
      align: readEnum(bubble.align, ['start', 'center', 'end'], defaults.bubble.align),
      gap: clampNumber(bubble.gap, 0, 48, defaults.bubble.gap),
      offsetX: clampNumber(bubble.offsetX, -160, 160, defaults.bubble.offsetX),
      offsetY: clampNumber(bubble.offsetY, -160, 160, defaults.bubble.offsetY),
      showArrow: readBoolean(bubble.showArrow, defaults.bubble.showArrow),
      showOriginal: readBoolean(bubble.showOriginal, defaults.bubble.showOriginal),
      borderWidth: clampNumber(bubble.borderWidth, 0, 6, defaults.bubble.borderWidth),
      radius: clampNumber(bubble.radius, 0, 32, defaults.bubble.radius),
      padding: clampNumber(bubble.padding, 2, 28, defaults.bubble.padding),
      fontSize: clampNumber(bubble.fontSize, 10, 28, defaults.bubble.fontSize),
      lineHeight: clampNumber(bubble.lineHeight, 1, 2.4, defaults.bubble.lineHeight),
    },
    ai: {
      ...defaults.ai,
      ...rawAi,
      apiUrl: readString(rawAi.apiUrl, defaults.ai.apiUrl),
      apiKey: readString(rawAi.apiKey, defaults.ai.apiKey),
      model: readString(rawAi.model, defaults.ai.model),
      prompt: readString(rawAi.prompt, defaults.ai.prompt),
      timeoutMs: clampNumber(rawAi.timeoutMs, 5000, 60000, defaults.ai.timeoutMs),
    },
  }
}

export function applyColorPreset(settings: TranslationSettings, preset: BubbleColorPreset): TranslationSettings {
  const next = structuredClone(settings)
  next.bubble.colorPreset = preset
  if (preset !== 'custom') Object.assign(next.bubble, COLOR_PRESETS[preset])
  return next
}

export function validateAiUrl(url: string): string {
  const value = url.trim()
  if (!value) throw new Error('请填写 AI 地址')
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('AI 地址必须是 http 或 https')
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error('AI 地址格式不安全')
  return parsed.toString()
}

export function validateAiEndpoint(url: string): string {
  try {
    validateAiUrl(url)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : 'AI 地址格式不正确'
  }
}

export function isInjectableUrl(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isSiteBlocked(pageUrl: string, blacklist: string[]): boolean {
  if (!blacklist.length) return false
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return false
  }
  return blacklist.some((rule) => {
    const item = rule.trim().toLowerCase()
    if (!item) return false
    if (item === url.hostname.toLowerCase()) return true
    if (item.startsWith('*.')) return url.hostname.toLowerCase().endsWith(item.slice(1))
    return url.href.toLowerCase().includes(item)
  })
}

export const isSiteBlacklisted = isSiteBlocked

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readEnum<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
