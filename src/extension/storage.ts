import { browser } from 'wxt/browser'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, detectUiLocale, migrateSettings, resetToDefaults, type TranslationSettings } from '../core/settings'
import { isPublicSettingsUpdate, type PublicSettingsResponse } from '../core/messages'
import { SYNC_FORMAT_VERSION, SYNC_TOTAL_MAX_BYTES, byteSize, decodeSyncSettings, encodeSyncSettings, splitSyncPayload } from './sync-codec'

const SYNC_MANIFEST_KEY = 'af:s:m'
const SYNC_CHUNK_KEY = 'af:s:c:'
const SYNC_INFO_KEY = 'af:s:i'

type SyncManifest = readonly [version: number, revision: string, chunks: number, bytes: number, checksum: string]
type SyncInfo = readonly [revision: string, uploadedAt: number]

type SyncStateKind = 'notUploaded' | 'upToDate' | 'different'

export interface SyncState {
  kind: SyncStateKind
  uploadedAt: number | null
}

function getBrowserLanguage(): string {
  return navigator.language || 'en'
}

async function loadSettings(): Promise<TranslationSettings> {
  const record = await browser.storage.local.get(SETTINGS_STORAGE_KEY)
  const raw = record[SETTINGS_STORAGE_KEY]
  if (raw !== undefined) return migrateSettings(raw)
  const fresh = migrateSettings(undefined)
  fresh.uiLocale = detectUiLocale(getBrowserLanguage())
  return fresh
}

async function saveSettings(settings: TranslationSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: migrateSettings(settings) })
}

async function resetSettings(): Promise<TranslationSettings> {
  const next = resetToDefaults(await loadSettings())
  next.uiLocale = detectUiLocale(getBrowserLanguage())
  await saveSettings(next)
  return next
}

function watchSettings(callback: (settings: TranslationSettings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) return
    callback(migrateSettings(changes[SETTINGS_STORAGE_KEY].newValue))
  }
  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

export async function uploadSettingsToSync(settings: TranslationSettings): Promise<void> {
  const payload = encodeSyncSettings(settings)
  const chunks = splitSyncPayload(payload)
  const checksum = await sha256(payload)
  const revision = crypto.randomUUID()
  const manifest: SyncManifest = [SYNC_FORMAT_VERSION, revision, chunks.length, byteSize(payload), checksum]
  const uploadedAt = Date.now()
  const values: Record<string, unknown> = {
    [SYNC_MANIFEST_KEY]: manifest,
    [SYNC_INFO_KEY]: [revision, uploadedAt] satisfies SyncInfo,
  }
  for (const [index, chunk] of chunks.entries()) values[`${SYNC_CHUNK_KEY}${index}`] = chunk

  const storageBytes = Object.entries(values).reduce((total, [key, value]) => total + byteSize(key) + byteSize(JSON.stringify(value)), 0)
  if (storageBytes > SYNC_TOTAL_MAX_BYTES) throw new Error('同步配置超过浏览器可用容量')

  const existing = await browser.storage.sync.get(SYNC_MANIFEST_KEY)
  const oldManifest = parseManifest(existing[SYNC_MANIFEST_KEY])
  await browser.storage.sync.set(values)

  const obsolete = oldManifest
    ? Array.from({ length: Math.max(0, oldManifest[2] - chunks.length) }, (_, index) => `${SYNC_CHUNK_KEY}${chunks.length + index}`)
    : []
  // 旧格式仅在新格式成功写入后才移除，避免迁移失败导致远端无数据。
  if (obsolete.length || !oldManifest) {
    await browser.storage.sync.remove([...obsolete, ...(oldManifest ? [] : [SETTINGS_STORAGE_KEY])]).catch(() => undefined)
  }
}

export async function downloadSettingsFromSync(): Promise<TranslationSettings> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifestRecord = await browser.storage.sync.get([SYNC_MANIFEST_KEY, SETTINGS_STORAGE_KEY])
    const manifest = parseManifest(manifestRecord[SYNC_MANIFEST_KEY])
    if (!manifest) {
      if (manifestRecord[SETTINGS_STORAGE_KEY] === undefined) throw new Error('浏览器同步区没有可下载的配置')
      return migrateSettings(manifestRecord[SETTINGS_STORAGE_KEY])
    }

    const keys = Array.from({ length: manifest[2] }, (_, index) => `${SYNC_CHUNK_KEY}${index}`)
    const chunkRecord = await browser.storage.sync.get(keys)
    const chunks = keys.map((key) => chunkRecord[key])
    if (chunks.every((chunk): chunk is string => typeof chunk === 'string')) {
      const payload = chunks.join('')
      if (byteSize(payload) === manifest[3] && await sha256(payload) === manifest[4]) {
        return decodeSyncSettings(payload)
      }
    }
    if (attempt < 2) await delay((attempt + 1) * 100)
  }
  throw new Error('同步配置尚未完整到达，请稍后重试')
}

export async function inspectSyncState(settings: TranslationSettings): Promise<SyncState> {
  const remote = await browser.storage.sync.get([SYNC_MANIFEST_KEY, SYNC_INFO_KEY, SETTINGS_STORAGE_KEY])
  const manifest = parseManifest(remote[SYNC_MANIFEST_KEY])
  if (!manifest) {
    // 旧版仅写入 SETTINGS_STORAGE_KEY 的云端数据仍可手动下载，一并算作与本地不同。
    return { kind: remote[SETTINGS_STORAGE_KEY] === undefined ? 'notUploaded' : 'different', uploadedAt: null }
  }
  const info = parseSyncInfo(remote[SYNC_INFO_KEY])
  const uploadedAt = info?.[0] === manifest[1] ? info[1] : null
  const checksum = await sha256(encodeSyncSettings(settings))
  return { kind: checksum === manifest[4] ? 'upToDate' : 'different', uploadedAt }
}

export function watchSyncState(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, areaName: string) => {
    if (areaName === 'sync' && (changes[SYNC_MANIFEST_KEY] || changes[SYNC_INFO_KEY] || changes[SETTINGS_STORAGE_KEY])) callback()
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
    upload: uploadSettingsToSync,
    download: downloadSettingsFromSync,
    inspectSyncState,
    subscribeSyncState: watchSyncState,
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

function parseManifest(value: unknown): SyncManifest | null {
  if (!Array.isArray(value) || value.length !== 5 || value[0] !== SYNC_FORMAT_VERSION || typeof value[1] !== 'string' || !Number.isInteger(value[2]) || value[2] < 1 || !Number.isInteger(value[3]) || value[3] < 1 || typeof value[4] !== 'string') return null
  return value as unknown as SyncManifest
}

function parseSyncInfo(value: unknown): SyncInfo | null {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || !Number.isSafeInteger(value[1]) || value[1] < 0) return null
  return value as unknown as SyncInfo
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
