import type {
  AiSchemeSettings,
  BaiduAiSchemeSettings,
  BaiduSchemeSettings,
  BubbleColorPreset,
  BubbleSettings,
  DeeplSchemeSettings,
  GoogleCloudSchemeSettings,
  GoogleSchemeSettings,
  SchemeOrder,
  SchemeSettings,
  SchemeType,
  TranslationSettings,
  UiLocale,
  VolcengineSchemeSettings,
  WordAccent,
  WordQuerySettings,
} from './types'
import { WORD_SOURCE_IDS } from './word-sources'

export type { TranslationSettings } from './types'

export const SETTINGS_STORAGE_KEY = 'aifanyi.settings.v1'
export const MAX_TRANSLATION_TEXT_LENGTH = 5000
/** 可选目标语言（各方案按自己的支持范围映射，不支持的方案会显式报错顺延）。 */
export const TARGET_LANGUAGES = [
  '简体中文',
  '繁體中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Deutsch',
  'Español',
  'Português',
  'Italiano',
  'Русский',
  'Nederlands',
  'Polski',
  'Türkçe',
  'العربية',
  'ไทย',
  'Tiếng Việt',
  'Bahasa Indonesia',
  'Bahasa Melayu',
  'Ελληνικά',
  'Svenska',
  'Dansk',
  'Suomi',
  'Norsk',
  'Čeština',
  'Magyar',
  'Română',
  'Українська',
  'हिन्दी',
] as const

export const COLOR_PRESETS: Record<Exclude<BubbleColorPreset, 'custom'>, Pick<BubbleSettings, 'background' | 'textColor' | 'borderColor' | 'highlightColor'>> = {
  paper: { background: '#fbfbfc', textColor: '#30323a', borderColor: '#d6dae1', highlightColor: '#4f84e81c' },
  warm: { background: '#fff8df', textColor: '#352b17', borderColor: '#ead38f', highlightColor: '#e8964f1c' },
  mint: { background: '#effcf6', textColor: '#18352a', borderColor: '#a8dfc5', highlightColor: '#3fae7f1c' },
  sky: { background: '#eff7ff', textColor: '#1d3047', borderColor: '#a9caeb', highlightColor: '#4f84e81c' },
  night: { background: '#20242d', textColor: '#f2f5f8', borderColor: '#495160', highlightColor: '#6f9ff21c' },
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

/** 单词翻译的最低触发延迟：无论悬停延迟设为多少，查单词至少等 300ms，避免扫过单词时连环打接口。 */
const WORD_LOOKUP_MIN_DELAY_MS = 300

/** 单词翻译的实际触发延迟：遵守悬停延迟设置，但不低于 300ms 下限。 */
export function wordLookupDelay(hoverDelayMs: number): number {
  return Math.max(hoverDelayMs, WORD_LOOKUP_MIN_DELAY_MS)
}

export const DEFAULT_GOOGLE_SCHEME: GoogleSchemeSettings = { id: 'default-google', type: 'google', enabled: true }

export const DEFAULT_SETTINGS: TranslationSettings = {
  version: 2,
  uiLocale: 'zh',
  enabled: true,
  siteBlacklist: [],
  hoverEnabled: true,
  selectionEnabled: true,
  hoverDelayMs: 200,
  targetLanguage: '简体中文',
  schemeOrder: 'random',
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
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 1.55,
    textAlign: 'left',
  },
  schemes: [DEFAULT_GOOGLE_SCHEME],
  word: {
    showOriginal: true,
    speakEnabled: true,
    accent: 'us',
    sources: { youdao: true, bing: true, google: false, freedictionaryapi: false },
  },
}

export function cloneDefaultSettings(): TranslationSettings {
  return structuredClone(DEFAULT_SETTINGS)
}

/** 根据浏览器语言判定界面语言：zh 开头用中文，其余（含无法识别）一律英文。 */
export function detectUiLocale(language: string): UiLocale {
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** 恢复默认：仅重置右侧表单项（启用/黑名单/触发/气泡/文字），保留句子翻译与单词翻译两张卡片的全部配置。 */
export function resetToDefaults(current: TranslationSettings): TranslationSettings {
  // 经 migrateSettings 深拷贝为纯数据，剥离 Vue 响应式代理
  const preserved = migrateSettings(current)
  return {
    ...cloneDefaultSettings(),
    schemes: preserved.schemes,
    targetLanguage: preserved.targetLanguage,
    schemeOrder: preserved.schemeOrder,
    word: preserved.word,
    uiLocale: preserved.uiLocale,
  }
}

export function uid(): string {
  return crypto.randomUUID()
}

const BUBBLE_KEYS = [
  'side', 'align', 'gap', 'offsetX', 'offsetY', 'showArrow', 'showOriginal',
  'colorPreset', 'background', 'textColor', 'borderColor', 'highlightColor',
  'borderWidth', 'radius', 'shadow', 'padding', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign',
] as const

function pickBubbleFields(raw: Record<string, unknown>): Partial<BubbleSettings> {
  const picked: Record<string, unknown> = {}
  for (const key of BUBBLE_KEYS) {
    if (key in raw) picked[key] = raw[key]
  }
  return picked as Partial<BubbleSettings>
}

const PRESET_COLOR_KEYS = ['background', 'textColor', 'borderColor', 'highlightColor'] as const

/** 按四项颜色反推配色预设归属：与某预设完全一致归该预设，否则视为自定义。 */
function inferColorPreset(bubble: BubbleSettings): BubbleColorPreset {
  const match = (Object.keys(COLOR_PRESETS) as Exclude<BubbleColorPreset, 'custom'>[])
    .find((key) => PRESET_COLOR_KEYS.every((field) => bubble[field] === COLOR_PRESETS[key][field]))
  return match ?? 'custom'
}

export function migrateSettings(value: unknown): TranslationSettings {
  const input = isRecord(value) ? value : {}
  const rawBubble = isRecord(input.bubble) ? input.bubble : {}
  const defaults = cloneDefaultSettings()
  const bubble = { ...defaults.bubble, ...pickBubbleFields(rawBubble) } as BubbleSettings
  // 旧版高亮色为 6 位 hex（渲染时固定附加约 22% 透明度）：迁移补上 alpha 位，让选择器显示与实际渲染一致。
  if (typeof bubble.highlightColor === 'string' && /^#[0-9a-f]{6}$/i.test(bubble.highlightColor)) bubble.highlightColor += '38'
  // 预设判定用存档原值：旧版存档没有 colorPreset 字段（会被缺省补成 paper），不得因此吞掉手改的高亮；
  // 仅当存档显式选择了某个预设时，高亮才随预设配色一起刷新。
  const rawPreset = typeof rawBubble.colorPreset === 'string' ? rawBubble.colorPreset : ''
  const preset = rawPreset !== 'custom' && rawPreset in COLOR_PRESETS
    ? COLOR_PRESETS[rawPreset as Exclude<BubbleColorPreset, 'custom'>]
    : null
  // colorPreset 归属必须幂等：content script 会把 background 已迁移的结果再迁移一次。
  // 存档未显式选预设时不沿用缺省补全的 paper，而是按颜色反推归属（custom 不会被预设覆盖），
  // 否则二次迁移会把第一次迁移保下来的手改高亮刷成预设色。
  const colorPreset = rawPreset === 'custom' || rawPreset in COLOR_PRESETS
    ? rawPreset as BubbleColorPreset
    : inferColorPreset(bubble)

  return {
    version: 2,
    uiLocale: readEnum<UiLocale>(input.uiLocale, ['zh', 'en'], defaults.uiLocale),
    enabled: readBoolean(input.enabled, defaults.enabled),
    hoverEnabled: readBoolean(input.hoverEnabled, defaults.hoverEnabled),
    selectionEnabled: readBoolean(input.selectionEnabled, defaults.selectionEnabled),
    hoverDelayMs: clampNumber(input.hoverDelayMs, 0, 5000, defaults.hoverDelayMs),
    targetLanguage: readEnum(input.targetLanguage, TARGET_LANGUAGES, defaults.targetLanguage),
    schemeOrder: readEnum<SchemeOrder>(input.schemeOrder, ['random', 'sequential'], defaults.schemeOrder),
    siteBlacklist: Array.isArray(input.siteBlacklist)
      ? input.siteBlacklist.map((item) => String(item).trim()).filter(Boolean)
      : defaults.siteBlacklist,
    bubble: {
      ...bubble,
      ...(preset ?? {}),
      colorPreset,
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
      fontSize: clampNumber(bubble.fontSize, 14, 28, defaults.bubble.fontSize),
      lineHeight: clampNumber(bubble.lineHeight, 1, 2.4, defaults.bubble.lineHeight),
    },
    schemes: readSchemes(input, defaults.schemes),
    word: readWordSettings(input.word, defaults.word),
  }
}

function readWordSettings(value: unknown, fallback: WordQuerySettings): WordQuerySettings {
  const raw = isRecord(value) ? value : {}
  const rawSources = isRecord(raw.sources) ? raw.sources : {}
  const sources = Object.fromEntries(
    WORD_SOURCE_IDS.map((key) => [key, readBoolean(rawSources[key], fallback.sources[key])]),
  ) as WordQuerySettings['sources']
  return {
    showOriginal: readBoolean(raw.showOriginal, fallback.showOriginal),
    speakEnabled: readBoolean(raw.speakEnabled, fallback.speakEnabled),
    accent: readEnum<WordAccent>(raw.accent, ['us', 'uk'], fallback.accent),
    sources,
  }
}

function readSchemes(input: Record<string, unknown>, fallback: SchemeSettings[]): SchemeSettings[] {
  if (Array.isArray(input.schemes)) {
    return input.schemes
      .map((item) => sanitizeScheme(item))
      .filter((scheme): scheme is SchemeSettings => scheme !== null)
  }
  const rawAi = isRecord(input.ai) ? input.ai : null
  if (!rawAi) return fallback
  const apiUrl = readString(rawAi.apiUrl, '')
  const apiKey = readString(rawAi.apiKey, '')
  if (!apiUrl.trim() && !apiKey.trim()) return fallback
  const scheme: AiSchemeSettings = {
    id: uid(),
    type: 'ai',
    enabled: true,
    label: readString(rawAi.label, '').trim().slice(0, 50),
    apiUrl,
    apiKey,
    model: readString(rawAi.model, ''),
    timeoutMs: clampNumber(rawAi.timeoutMs, 5000, 60000, 20000),
  }
  return [scheme]
}

function sanitizeScheme(value: unknown): SchemeSettings | null {
  if (!isRecord(value)) return null
  const type = readSchemeType(value.type)
  if (!type) return null
  const id = readString(value.id, '').trim() || uid()
  const enabled = readBoolean(value.enabled, true)
  if (type === 'deepl') {
    const scheme: DeeplSchemeSettings = {
      id,
      type,
      enabled,
      authKey: readString(value.authKey, ''),
      endpoint: value.endpoint === 'pro' ? 'pro' : 'free',
    }
    return scheme
  }
  if (type === 'googleCloud') {
    const scheme: GoogleCloudSchemeSettings = {
      id,
      type,
      enabled,
      apiKey: readString(value.apiKey, ''),
    }
    return scheme
  }
  if (type === 'baidu') {
    const scheme: BaiduSchemeSettings = {
      id,
      type,
      enabled,
      appId: readString(value.appId, ''),
      secretKey: readString(value.secretKey, ''),
    }
    return scheme
  }
  if (type === 'baiduAi') {
    const scheme: BaiduAiSchemeSettings = {
      id,
      type,
      enabled,
      appId: readString(value.appId, ''),
      secretKey: readString(value.secretKey, ''),
      modelType: value.modelType === 'llm' ? 'llm' : 'nmt',
    }
    return scheme
  }
  if (type === 'volcengine') {
    const scheme: VolcengineSchemeSettings = {
      id,
      type,
      enabled,
      // 控制台复制常带尾随空白，参与签名的凭证必须干净，否则会报 SignatureDoesNotMatch。
      accessKeyId: readString(value.accessKeyId, '').trim(),
      secretAccessKey: readString(value.secretAccessKey, '').trim(),
      region: readString(value.region, 'cn-north-1').trim() || 'cn-north-1',
    }
    return scheme
  }
  if (type === 'ai') {
    const scheme: AiSchemeSettings = {
      id,
      type,
      enabled,
      label: readString(value.label, '').trim().slice(0, 50),
      apiUrl: readString(value.apiUrl, ''),
      apiKey: readString(value.apiKey, ''),
      model: readString(value.model, ''),
      timeoutMs: clampNumber(value.timeoutMs, 5000, 60000, 20000),
    }
    return scheme
  }
  return { id, type, enabled }
}

function readSchemeType(value: unknown): SchemeType | null {
  return value === 'deepl' || value === 'google' || value === 'googleCloud' || value === 'baidu' || value === 'baiduAi' || value === 'baiduWeb' || value === 'bing' || value === 'tencent' || value === 'volcengine' || value === 'ai' ? value : null
}

export function validateAiUrl(url: string): string {
  const value = url.trim()
  if (!value) throw new Error('请填写 AI 地址')
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('AI 地址必须是 http 或 https')
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error('AI 地址格式不安全')
  return parsed.toString()
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
