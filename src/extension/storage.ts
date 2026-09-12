import { browser } from 'wxt/browser'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, migrateSettings, type TranslationSettings } from '../core/settings'
import { isPublicSettingsUpdate, type PublicSettingsResponse } from '../core/messages'
import type { SettingsStorageAdapter } from '../core/storage'

export async function loadSettings(): Promise<TranslationSettings> {
  const record = await browser.storage.local.get(SETTINGS_STORAGE_KEY)
  return migrateSettings(record[SETTINGS_STORAGE_KEY])
}

export async function saveSettings(settings: TranslationSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: migrateSettings(settings) })
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

/**
 * Content scripts only need interaction and visual settings. Keeping schemes
 * out of this snapshot prevents provider credentials from entering webpage
 * execution contexts, even though the content script itself is isolated.
 */
export function createContentSettingsStorage(): SettingsStorageAdapter {
  return {
    load: async () => {
      try {
        const response = await browser.runtime.sendMessage({ type: 'settings.public.request' }) as PublicSettingsResponse
        return toContentSettings(migrateSettings(response?.settings))
      } catch {
        return toContentSettings(DEFAULT_SETTINGS)
      }
    },
    save: async () => undefined,
    reset: async () => toContentSettings(DEFAULT_SETTINGS),
    subscribe: (callback) => {
      const listener = (message: unknown) => {
        if (isPublicSettingsUpdate(message)) callback(toContentSettings(migrateSettings(message.settings)))
      }
      browser.runtime.onMessage.addListener(listener)
      return () => browser.runtime.onMessage.removeListener(listener)
    },
  }
}

export function toContentSettings(settings: TranslationSettings): TranslationSettings {
  const snapshot = structuredClone(settings)
  snapshot.schemes = []
  return snapshot
}
