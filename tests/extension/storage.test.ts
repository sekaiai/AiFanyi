import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { createBrowserSettingsStorage } from '../../src/extension/storage'
import { SETTINGS_STORAGE_KEY, cloneDefaultSettings, migrateSettings } from '../../src/core/settings'
import type { TranslationSettings } from '../../src/core/types'
import { byteSize, encodeSyncSettings, splitSyncPayload } from '../../src/extension/sync-codec'

const KEY = SETTINGS_STORAGE_KEY

async function setRemoteSettings(settings: TranslationSettings, revision: string, uploadedAt = 1): Promise<void> {
  const payload = encodeSyncSettings(settings)
  const checksum = await sha256(payload)
  const chunks = splitSyncPayload(payload)
  const values: Record<string, unknown> = {
    'af:s:m': [1, revision, chunks.length, byteSize(payload), checksum],
    'af:s:i': [revision, uploadedAt],
  }
  for (const [index, chunk] of chunks.entries()) values[`af:s:c:${index}`] = chunk
  await browser.storage.sync.set(values)
}

describe('browser settings storage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await browser.storage.local.clear()
    await browser.storage.sync.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads local settings even when browser sync has different data', async () => {
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 111 } })
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 222 } })
    expect((await createBrowserSettingsStorage().load()).hoverDelayMs).toBe(111)
  })

  it('saves settings locally without an automatic sync upload', async () => {
    const value = cloneDefaultSettings()
    value.hoverDelayMs = 123
    await createBrowserSettingsStorage().save(value)
    expect(migrateSettings((await browser.storage.local.get(KEY))[KEY]).hoverDelayMs).toBe(123)
    expect((await browser.storage.sync.get(KEY))[KEY]).toBeUndefined()
  })

  it('uploads compact settings and downloads the same configuration', async () => {
    const value = cloneDefaultSettings()
    value.hoverDelayMs = 456
    value.schemes.push({ id: 'd3c7b5d8-1cb1-4af3-af20-f00f00f00f00', type: 'ai', enabled: true, label: '测试', apiUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'gpt', timeoutMs: 9000 })
    const storage = createBrowserSettingsStorage()
    await storage.upload(value)
    expect((await browser.storage.sync.get('af:s:m'))['af:s:m']).toBeDefined()
    expect((await storage.download()).settings).toEqual(value)
    expect((await storage.inspectSyncState(value)).kind).toBe('upToDate')
    expect((await browser.storage.sync.get('af:s:i'))['af:s:i']).toEqual(expect.arrayContaining([expect.any(String), expect.any(Number)]))
  })

  it('reads legacy sync settings for a one-time manual migration', async () => {
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 333, targetLanguage: 'English' } })
    const remote = await createBrowserSettingsStorage().download()
    expect(remote.settings.hoverDelayMs).toBe(333)
    expect(remote.settings.targetLanguage).toBe('English')
    expect((await createBrowserSettingsStorage().inspectSyncState(remote.settings)).kind).toBe('different')
  })

  it('notifies subscribers only for local writes', async () => {
    const seen: TranslationSettings[] = []
    const unsubscribe = createBrowserSettingsStorage().subscribe((settings) => seen.push(settings))
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 700 } })
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 900 } })
    unsubscribe()
    expect(seen).toHaveLength(1)
    expect(seen[0]?.hoverDelayMs).toBe(700)
  })

  it('resets local settings without changing the uploaded configuration', async () => {
    const uploaded = cloneDefaultSettings()
    uploaded.hoverDelayMs = 800
    const storage = createBrowserSettingsStorage()
    await storage.upload(uploaded)
    await storage.save({ ...cloneDefaultSettings(), hoverDelayMs: 600 })
    const next = await storage.reset()
    expect(next.hoverDelayMs).toBe(200)
    expect((await storage.download()).settings.hoverDelayMs).toBe(800)
  })

  it('reports when local and cloud data differ', async () => {
    const storage = createBrowserSettingsStorage()
    const shared = cloneDefaultSettings()
    await storage.upload(shared)

    const local = { ...shared, hoverDelayMs: 500 }
    expect((await storage.inspectSyncState(local)).kind).toBe('different')

    const remote = { ...shared, hoverDelayMs: 700 }
    await setRemoteSettings(remote, 'remote-update', 123)
    expect((await storage.inspectSyncState(shared)).kind).toBe('different')
  })

  it('reports an empty sync area and watches remote metadata changes', async () => {
    const storage = createBrowserSettingsStorage()
    expect((await storage.inspectSyncState(cloneDefaultSettings())).kind).toBe('notUploaded')
    const callback = vi.fn()
    const unwatch = storage.subscribeSyncState(callback)
    await browser.storage.local.set({ unrelated: true })
    await browser.storage.sync.set({ 'af:s:i': ['revision', 1] })
    unwatch()
    expect(callback).toHaveBeenCalledOnce()
  })
})

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
