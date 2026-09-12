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

export type SchemeType = 'deepl' | 'google' | 'googleCloud' | 'ai'

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

export interface AiSchemeSettings extends SchemeBase {
  type: 'ai'
  apiUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type SchemeSettings = DeeplSchemeSettings | GoogleSchemeSettings | GoogleCloudSchemeSettings | AiSchemeSettings

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
}

export interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
}
