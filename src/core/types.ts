export type BubbleSide = 'top' | 'bottom' | 'left' | 'right'
export type BubbleAlign = 'start' | 'center' | 'end'
export type BubbleTextAlign = 'left' | 'center' | 'right'
export type BubbleFontFamily = 'system' | 'serif' | 'mono'
export type BubbleShadow = 'none' | 'soft' | 'medium' | 'strong'
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

export type SchemeType = 'deepl' | 'google' | 'googleCloud' | 'baidu' | 'volcengine' | 'ai'

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

export interface VolcengineSchemeSettings extends SchemeBase {
  type: 'volcengine'
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export interface AiSchemeSettings extends SchemeBase {
  type: 'ai'
  apiUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type SchemeSettings = DeeplSchemeSettings | GoogleSchemeSettings | GoogleCloudSchemeSettings | BaiduSchemeSettings | VolcengineSchemeSettings | AiSchemeSettings

export type WordSourceId = 'youdao' | 'bing' | 'google' | 'freedictionaryapi'
export type WordAccent = 'us' | 'uk'

export interface WordQuerySettings {
  /** 启用后，划选单个单词走免费源池，不再消耗「翻译方案」额度。 */
  enabled: boolean
  speakEnabled: boolean
  accent: WordAccent
  sources: Record<WordSourceId, boolean>
}

export interface TranslationSettings {
  version: 2
  enabled: boolean
  siteBlacklist: string[]
  hoverEnabled: boolean
  selectionEnabled: boolean
  hoverDelayMs: number
  targetLanguage: string
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
