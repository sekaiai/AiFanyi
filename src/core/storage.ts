import type { TranslationSettings } from './settings'

export interface SettingsStorageAdapter {
  load(): Promise<TranslationSettings>
  save(settings: TranslationSettings): Promise<void>
  reset(): Promise<TranslationSettings>
  subscribe(callback: (settings: TranslationSettings) => void): () => void
}
