import { cloneDefaultSettings, migrateSettings, type TranslationSettings } from './settings'

export interface SettingsStorageAdapter {
  load(): Promise<TranslationSettings>
  save(settings: TranslationSettings): Promise<void>
  reset(): Promise<TranslationSettings>
  subscribe(callback: (settings: TranslationSettings) => void): () => void
}

export function createMemorySettingsStorage(initial?: TranslationSettings): SettingsStorageAdapter {
  let current = migrateSettings(initial)
  const listeners = new Set<(settings: TranslationSettings) => void>()
  return {
    async load() {
      return structuredClone(current)
    },
    async save(settings) {
      current = migrateSettings(settings)
      listeners.forEach((listener) => listener(structuredClone(current)))
    },
    async reset() {
      current = cloneDefaultSettings()
      listeners.forEach((listener) => listener(structuredClone(current)))
      return structuredClone(current)
    },
    subscribe(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}
