import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsModel } from '../../src/composables/useSettingsModel'
import { cloneDefaultSettings, resetToDefaults } from '../../src/core/settings'
import type { TranslationSettings } from '../../src/core/types'

type FakeStorage = Parameters<typeof useSettingsModel>[0]

function createStorage(initial: TranslationSettings = cloneDefaultSettings()) {
  let current = structuredClone(initial)
  let onSyncStateChange = () => undefined
  const storage: FakeStorage = {
    load: vi.fn(async () => structuredClone(current)),
    save: vi.fn(async (settings) => { current = structuredClone(settings) }),
    reset: vi.fn(async () => {
      current = resetToDefaults(current)
      return structuredClone(current)
    }),
    subscribe: vi.fn(() => vi.fn()),
    upload: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ settings: structuredClone(initial), snapshot: null })),
    inspectSyncState: vi.fn(async () => ({ kind: 'upToDate' as const, uploadedAt: 1 })),
    subscribeSyncState: vi.fn((callback) => {
      onSyncStateChange = callback
      return vi.fn()
    }),
  }
  return { storage, triggerSyncStateChange: () => onSyncStateChange() }
}

const SettingsHarness = defineComponent({
  props: { storage: { type: Object as () => FakeStorage, required: true } },
  setup(props) {
    return useSettingsModel(props.storage)
  },
  template: `
    <form>
      <output data-testid="status">{{ stateLabel }}</output>
      <output data-testid="sync-status">{{ syncStatus }}</output>
      <output data-testid="sync-state">{{ syncState?.kind }}</output>
      <input name="hoverDelay" type="number" v-model.number="settings.hoverDelayMs" />
      <input name="targetLanguage" v-model="settings.targetLanguage" />
      <span data-testid="schemes-count">{{ settings.schemes.length }}</span>
      <button data-testid="upload" type="button" @click="upload">upload</button>
      <button data-testid="download" type="button" @click="download">download</button>
      <button data-testid="reset" type="button" @click="reset">reset</button>
    </form>
  `,
})

describe('useSettingsModel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('renders locally loaded settings', async () => {
    const initial = cloneDefaultSettings()
    initial.hoverDelayMs = 350
    const { storage } = createStorage(initial)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()
    expect(storage.load).toHaveBeenCalledOnce()
    expect((wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value).toBe('350')
  })

  it('autosaves edits locally without uploading', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.find('input[name="hoverDelay"]').setValue('500')
    await vi.advanceTimersByTimeAsync(800)
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 500 }))
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('uploads the current settings only after an explicit action', async () => {
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()
    await wrapper.find('input[name="hoverDelay"]').setValue('650')
    await wrapper.get('[data-testid="upload"]').trigger('click')
    await flushPromises()
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 650 }))
    expect(wrapper.get('[data-testid="sync-status"]').text()).toBe('同步成功')
  })

  it('downloads and replaces local settings', async () => {
    const { storage } = createStorage()
    const remote = cloneDefaultSettings()
    remote.hoverDelayMs = 900
    vi.mocked(storage.download).mockResolvedValueOnce({ settings: remote, snapshot: null })
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()
    await wrapper.get('[data-testid="download"]').trigger('click')
    await flushPromises()
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 900 }))
    expect((wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value).toBe('900')
    expect(wrapper.get('[data-testid="sync-status"]').text()).toBe('更新成功')
  })

  it('refreshes status when the sync area changes without replacing local settings', async () => {
    const { storage, triggerSyncStateChange } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()
    vi.mocked(storage.inspectSyncState).mockResolvedValueOnce({ kind: 'different', uploadedAt: 2 })
    triggerSyncStateChange()
    await flushPromises()
    expect(wrapper.get('[data-testid="sync-state"]').text()).toBe('different')
    expect(storage.download).not.toHaveBeenCalled()
  })

  it('reset keeps schemes, target language and word settings while resetting form items', async () => {
    const initial = cloneDefaultSettings()
    initial.hoverDelayMs = 700
    initial.targetLanguage = 'English'
    initial.word.accent = 'uk'
    initial.schemes.push({ id: 'ai-x', type: 'ai', enabled: true, label: '', apiUrl: 'https://api.example.com', apiKey: 'sk-x', model: 'm', timeoutMs: 8000 })
    const { storage } = createStorage(initial)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()
    await wrapper.get('[data-testid="reset"]').trigger('click')
    await flushPromises()
    expect(storage.reset).toHaveBeenCalledOnce()
    expect((wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value).toBe('200')
    expect((wrapper.find('input[name="targetLanguage"]').element as HTMLInputElement).value).toBe('English')
    expect(wrapper.get('[data-testid="schemes-count"]').text()).toBe('6')
  })
})
