import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { createBrowserSettingsStorage } from '../../src/extension/storage'
import { SETTINGS_STORAGE_KEY, cloneDefaultSettings, migrateSettings } from '../../src/core/settings'
import type { TranslationSettings } from '../../src/core/types'

const KEY = SETTINGS_STORAGE_KEY

describe('browser settings storage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await browser.storage.local.clear()
    await browser.storage.sync.clear()
  })

  it('reads settings from sync first even when local has data', async () => {
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 111 } })
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 222 } })

    const loaded = await createBrowserSettingsStorage().load()

    expect(loaded.hoverDelayMs).toBe(222)
  })

  it('migrates local-only settings into sync once when sync is empty', async () => {
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 333, targetLanguage: 'English' } })

    const loaded = await createBrowserSettingsStorage().load()
    expect(loaded.hoverDelayMs).toBe(333)

    await vi.waitFor(async () => {
      const synced = (await browser.storage.sync.get(KEY))[KEY]
      expect(synced).toBeDefined()
      expect(migrateSettings(synced).hoverDelayMs).toBe(333)
    })
  })

  it('falls back to defaults when both areas are empty', async () => {
    const loaded = await createBrowserSettingsStorage().load()

    expect(loaded).toEqual(cloneDefaultSettings())
  })

  it('writes settings to both local and sync', async () => {
    const value = cloneDefaultSettings()
    value.hoverDelayMs = 123

    await createBrowserSettingsStorage().save(value)

    const localRaw = (await browser.storage.local.get(KEY))[KEY]
    const syncRaw = (await browser.storage.sync.get(KEY))[KEY]
    expect(migrateSettings(localRaw).hoverDelayMs).toBe(123)
    expect(migrateSettings(syncRaw).hoverDelayMs).toBe(123)
  })

  it('keeps the local mirror when the sync write fails and surfaces the error', async () => {
    const setSpy = vi.spyOn(browser.storage.sync, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'))
    const value = cloneDefaultSettings()
    value.hoverDelayMs = 456

    await expect(createBrowserSettingsStorage().save(value)).rejects.toThrow('QUOTA_BYTES exceeded')

    expect(setSpy).toHaveBeenCalledOnce()
    const localRaw = (await browser.storage.local.get(KEY))[KEY]
    expect(migrateSettings(localRaw).hoverDelayMs).toBe(456)
  })

  it('notifies subscribers for settings writes in both sync and local areas', async () => {
    const seen: TranslationSettings[] = []
    const unsubscribe = createBrowserSettingsStorage().subscribe((settings) => seen.push(settings))

    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 700 } })
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 900 } })
    // 同区但不同 key 的写入不触发
    await browser.storage.local.set({ unrelated: true })
    // 监听器是异步的（sync 区要先读取同步开关），等一个宏任务让回调跑完
    await new Promise((resolve) => setTimeout(resolve, 0))

    unsubscribe()

    expect(seen).toHaveLength(2)
    expect(seen[0]?.hoverDelayMs).toBe(700)
    expect(seen[1]?.hoverDelayMs).toBe(900)
  })

  it('reset keeps schemes, target language and word settings while restoring form defaults', async () => {
    const initial = cloneDefaultSettings()
    initial.targetLanguage = 'English'
    initial.word.accent = 'uk'
    initial.schemes.push({
      id: 'ai-x',
      type: 'ai',
      enabled: true,
      label: '我的智谱',
      apiUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 8000,
    })
    await browser.storage.sync.set({ [KEY]: initial })

    const next = await createBrowserSettingsStorage().reset()

    expect(next.hoverDelayMs).toBe(200)
    expect(next.targetLanguage).toBe('English')
    expect(next.word.accent).toBe('uk')
    expect(next.schemes).toHaveLength(2)
    expect(next.schemes[1]).toMatchObject({ type: 'ai', label: '我的智谱' })
    // 重置结果已写回双区
    const syncRaw = (await browser.storage.sync.get(KEY))[KEY]
    expect(migrateSettings(syncRaw).targetLanguage).toBe('English')
    const localRaw = (await browser.storage.local.get(KEY))[KEY]
    expect(migrateSettings(localRaw).targetLanguage).toBe('English')
  })

  it('treats the sync switch as enabled when it has never been set', async () => {
    await expect(createBrowserSettingsStorage().loadSyncEnabled()).resolves.toBe(true)
  })

  it('reads local settings and skips the sync migration while the switch is off', async () => {
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 111 } })
    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 222 } })
    const storage = createBrowserSettingsStorage()
    await storage.saveSyncEnabled(false)

    const loaded = await storage.load()

    expect(loaded.hoverDelayMs).toBe(111)
    // 关闭同步时不再向 sync 区推送迁移
    const synced = (await browser.storage.sync.get(KEY))[KEY]
    expect(migrateSettings(synced).hoverDelayMs).toBe(222)
  })

  it('writes settings to local only while the switch is off', async () => {
    const value = cloneDefaultSettings()
    value.hoverDelayMs = 123
    const storage = createBrowserSettingsStorage()
    await storage.saveSyncEnabled(false)

    await storage.save(value)

    const localRaw = (await browser.storage.local.get(KEY))[KEY]
    expect(migrateSettings(localRaw).hoverDelayMs).toBe(123)
    expect((await browser.storage.sync.get(KEY))[KEY]).toBeUndefined()
  })

  it('ignores sync-area changes but reacts to local writes while the switch is off', async () => {
    const storage = createBrowserSettingsStorage()
    await storage.saveSyncEnabled(false)
    const seen: TranslationSettings[] = []
    const unsubscribe = storage.subscribe((settings) => seen.push(settings))

    await browser.storage.sync.set({ [KEY]: { hoverDelayMs: 900 } })
    await browser.storage.local.set({ [KEY]: { hoverDelayMs: 700 } })
    // 监听器是异步的（sync 区要先读取同步开关），等一个宏任务让回调跑完
    await new Promise((resolve) => setTimeout(resolve, 0))

    unsubscribe()

    expect(seen).toHaveLength(1)
    expect(seen[0]?.hoverDelayMs).toBe(700)
  })
})
