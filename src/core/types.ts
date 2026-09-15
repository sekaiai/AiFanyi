type BubbleSide = 'top' | 'bottom' | 'left' | 'right'
type BubbleAlign = 'start' | 'center' | 'end'
type BubbleTextAlign = 'left' | 'center' | 'right'
type BubbleFontFamily = 'system' | 'serif' | 'mono'
type BubbleShadow = 'none' | 'soft' | 'medium' | 'strong'
export type BubbleColorPreset = 'paper' | 'warm' | 'mint' | 'sky' | 'night' | 'custom'

export interface BubbleSettings {
  side: BubbleSide
  align: BubbleAlign
  gap: number
  offsetX: number
  offsetY: number
  showArrow: boolean
  showOriginal: boolean
  colorPreset: BubbleColorPreset
  background: string
  textColor: string
  borderColor: string
  /** 悬停单词时单词下方高亮的背景色（8 位 hex，自带透明度，独立于颜色预设）。 */
  highlightColor: string
  borderWidth: number
  radius: number
  shadow: BubbleShadow
  padding: number
  fontFamily: BubbleFontFamily
  fontSize: number
  fontWeight: '400' | '500' | '600'
  lineHeight: number
  textAlign: BubbleTextAlign
}

export type SchemeType = 'deepl' | 'google' | 'googleCloud' | 'baidu' | 'baiduAi' | 'volcengine' | 'ai' | 'baiduWeb' | 'bing' | 'tencent' | 'youdao' | 'mymemory' | 'yandex' | 'reverso'

interface SchemeBase {
  id: string
  type: SchemeType
  enabled: boolean
}

export interface DeeplSchemeSettings extends SchemeBase {
  type: 'deepl'
  authKey: string
  endpoint: 'free' | 'pro'
}

export interface GoogleSchemeSettings extends SchemeBase {
  type: 'google'
}

export interface GoogleCloudSchemeSettings extends SchemeBase {
  type: 'googleCloud'
  apiKey: string
}

export interface BaiduSchemeSettings extends SchemeBase {
  type: 'baidu'
  appId: string
  secretKey: string
}

export interface BaiduAiSchemeSettings extends SchemeBase {
  type: 'baiduAi'
  appId: string
  secretKey: string
  modelType: 'llm' | 'nmt'
}

export interface BaiduWebSchemeSettings extends SchemeBase {
  type: 'baiduWeb'
}

export interface BingSchemeSettings extends SchemeBase {
  type: 'bing'
}

export interface TencentSchemeSettings extends SchemeBase {
  type: 'tencent'
}

export interface YoudaoSchemeSettings extends SchemeBase {
  type: 'youdao'
}

export interface MyMemorySchemeSettings extends SchemeBase {
  type: 'mymemory'
}

export interface YandexSchemeSettings extends SchemeBase {
  type: 'yandex'
}

export interface ReversoSchemeSettings extends SchemeBase {
  type: 'reverso'
}

export interface VolcengineSchemeSettings extends SchemeBase {
  type: 'volcengine'
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export interface AiSchemeSettings extends SchemeBase {
  type: 'ai'
  /** 自定义标题：用于方案列表与气泡中的显示名，留空回退为「自定义 AI」。 */
  label: string
  apiUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type SchemeSettings = DeeplSchemeSettings | GoogleSchemeSettings | GoogleCloudSchemeSettings | BaiduSchemeSettings | BaiduAiSchemeSettings | BaiduWebSchemeSettings | BingSchemeSettings | TencentSchemeSettings | YoudaoSchemeSettings | MyMemorySchemeSettings | YandexSchemeSettings | ReversoSchemeSettings | VolcengineSchemeSettings | AiSchemeSettings

export type WordSourceId = 'youdao' | 'bing' | 'google' | 'freedictionaryapi'
export type WordAccent = 'us' | 'uk'

export type SchemeOrder = 'random' | 'sequential'

export interface WordQuerySettings {
  /** 单词卡片是否显示原词与音标（含朗读按钮）；句子气泡的原文由 bubble.showOriginal 控制，两者独立。 */
  showOriginal: boolean
  speakEnabled: boolean
  accent: WordAccent
  sources: Record<WordSourceId, boolean>
}

/** 设置页界面语言：中文 / 英文。 */
export type UiLocale = 'zh' | 'en'

export interface TranslationSettings {
  version: 2
  /** 界面语言；仅设置页与演示页使用，跟随浏览器语言判定，非中英文一律英文。 */
  uiLocale: UiLocale
  enabled: boolean
  siteBlacklist: string[]
  hoverEnabled: boolean
  selectionEnabled: boolean
  hoverDelayMs: number
  targetLanguage: string
  schemeOrder: SchemeOrder
  bubble: BubbleSettings
  schemes: SchemeSettings[]
  word: WordQuerySettings
}

export interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
}
