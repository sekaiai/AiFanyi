import { browser } from 'wxt/browser'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, migrateSettings, sanitizeSettings, type TranslationSettings } from '../core/settings'
import type { SettingsStorageAdapter } from '../core/storage'

export async function loadSettings(): Promise<TranslationSettings> {
  const record = await browser.storage.local.get(SETTINGS_STORAGE_KEY)
  return migrateSettings(record[SETTINGS_STORAGE_KEY])
}

export async function saveSettings(settings: TranslationSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: sanitizeSettings(settings) })
}

export async function resetSettings(): Promise<TranslationSettings> {
  await saveSettings(DEFAULT_SETTINGS)
  return loadSettings()
}

export function watchSettings(callback: (settings: TranslationSettings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
    if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) return
    callback(migrateSettings(changes[SETTINGS_STORAGE_KEY].newValue))
  }
  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

export function createBrowserSettingsStorage(): SettingsStorageAdapter {
  return {
    load: loadSettings,
    save: saveSettings,
    reset: resetSettings,
    subscribe: watchSettings,
  }
}
