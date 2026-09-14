import { browser } from 'wxt/browser'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, detectUiLocale, migrateSettings, resetToDefaults, type TranslationSettings } from '../core/settings'
import { isPublicSettingsUpdate, type PublicSettingsResponse } from '../core/messages'

/** 本机同步开关的存储键：保存在 local（每台设备独立），不进同步的设置数据本身。 */
const SYNC_ENABLED_STORAGE_KEY = 'aifanyi.settingsSyncEnabled.v1'

/** 本机是否参与设置同步；未设置时默认开启。 */
async function loadSyncEnabled(): Promise<boolean> {
  try {
    const record = await browser.storage.local.get(SYNC_ENABLED_STORAGE_KEY)
    return record[SYNC_ENABLED_STORAGE_KEY] !== false
  } catch {
    return true
  }
}

async function saveSyncEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [SYNC_ENABLED_STORAGE_KEY]: enabled })
}

async function readSettingsFrom(area: 'sync' | 'local'): Promise<TranslationSettings | null> {
  try {
    const record = await browser.storage[area].get(SETTINGS_STORAGE_KEY)
    const raw = record[SETTINGS_STORAGE_KEY]
    return raw === undefined ? null : migrateSettings(raw)
  } catch {
    return null
  }
}

/** 浏览器界面语言；取不到时按英文兜底。 */
function getBrowserLanguage(): string {
  try {
    return navigator.language || 'en'
  } catch {
    return 'en'
  }
}

async function loadSettings(): Promise<TranslationSettings> {
  const syncEnabled = await loadSyncEnabled()
  if (syncEnabled) {
    const fromSync = await readSettingsFrom('sync')
    if (fromSync) return fromSync
  }
  const fromLocal = await readSettingsFrom('local')
  if (fromLocal) {
    // 一次性迁移：同步区为空而本机有旧数据时推送到 sync（失败静默，下次保存再试）；关闭同步的设备不推送
    if (syncEnabled) void browser.storage.sync.set({ [SETTINGS_STORAGE_KEY]: fromLocal }).catch(() => undefined)
    return fromLocal
  }
  // 全新安装：界面语言跟随浏览器，非中英文一律英文
  const fresh = migrateSettings(undefined)
  fresh.uiLocale = detectUiLocale(getBrowserLanguage())
  return fresh
}

async function saveSettings(settings: TranslationSettings): Promise<void> {
  const value = migrateSettings(settings)
  // 本地镜像兜底（无配额限制）；关闭同步的设备只写本机
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: value })
  if (await loadSyncEnabled()) {
    // sync 写失败向上抛，由状态栏提示
    await browser.storage.sync.set({ [SETTINGS_STORAGE_KEY]: value })
  }
}

async function resetSettings(): Promise<TranslationSettings> {
  const next = resetToDefaults(await loadSettings())
  // 恢复默认时界面语言重新跟随浏览器判定
  next.uiLocale = detectUiLocale(getBrowserLanguage())
  await saveSettings(next)
  return next
}

function watchSettings(callback: (settings: TranslationSettings) => void): () => void {
  const listener = async (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
    if ((areaName !== 'sync' && areaName !== 'local') || !changes[SETTINGS_STORAGE_KEY]) return
    // 关闭同步的设备忽略 sync 区变更（来自其他设备的写入），只响应本机 local 写入
    if (areaName === 'sync' && !(await loadSyncEnabled())) return
    callback(migrateSettings(changes[SETTINGS_STORAGE_KEY].newValue))
  }
  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

export function createBrowserSettingsStorage() {
  return {
    load: loadSettings,
    save: saveSettings,
    reset: resetSettings,
    subscribe: watchSettings,
    loadSyncEnabled,
    saveSyncEnabled,
  }
}

/**
 * Content scripts only need interaction and visual settings. Keeping schemes
 * out of this snapshot prevents provider credentials from entering webpage
 * execution contexts, even though the content script itself is isolated.
 */
export async function loadContentSettings(): Promise<TranslationSettings> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'settings.public.request' }) as PublicSettingsResponse
    return toContentSettings(migrateSettings(response?.settings))
  } catch {
    return toContentSettings(DEFAULT_SETTINGS)
  }
}

export function watchContentSettings(callback: (settings: TranslationSettings) => void): () => void {
  const listener = (message: unknown) => {
    if (isPublicSettingsUpdate(message)) callback(toContentSettings(migrateSettings(message.settings)))
  }
  browser.runtime.onMessage.addListener(listener)
  return () => browser.runtime.onMessage.removeListener(listener)
}

export function toContentSettings(settings: TranslationSettings): TranslationSettings {
  const snapshot = structuredClone(settings)
  snapshot.schemes = []
  return snapshot
}
