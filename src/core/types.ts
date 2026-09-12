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

export interface AiSettings {
  apiUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs: number
}

export interface TranslationSettings {
  version: 1
  enabled: boolean
  siteBlacklist: string[]
  hoverEnabled: boolean
  selectionEnabled: boolean
  hoverDelayMs: number
  targetLanguage: string
  bubble: BubbleSettings
  ai: AiSettings
}

export interface DictionaryMeaning {
  partOfSpeech: string
  translations: string[]
}

export interface DictionaryResult {
  source: string
  pronunciation: string
  meanings: DictionaryMeaning[]
}

export interface TranslationError {
  code: 'bad_config' | 'blacklisted' | 'cancelled' | 'disabled' | 'empty' | 'http' | 'network' | 'parse' | 'timeout' | 'unknown'
  message: string
  retryable: boolean
}

export interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
}
