import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsModel } from '../../src/composables/useSettingsModel'
import { cloneDefaultSettings, resetToDefaults } from '../../src/core/settings'
import type { TranslationSettings } from '../../src/core/types'

type FakeStorage = Parameters<typeof useSettingsModel>[0]

function createStorage(initial: TranslationSettings = cloneDefaultSettings()) {
  let current = structuredClone(initial)
  const storage: FakeStorage = {
    load: vi.fn(async () => structuredClone(current)),
    save: vi.fn(async (settings) => {
      current = structuredClone(settings)
    }),
    reset: vi.fn(async () => {
      current = resetToDefaults(current)
      return structuredClone(current)
    }),
    subscribe: vi.fn(() => vi.fn()),
    loadSyncEnabled: vi.fn(async () => true),
    saveSyncEnabled: vi.fn(async () => undefined),
  }
  return { storage }
}

const SettingsHarness = defineComponent({
  props: {
    storage: {
      type: Object as () => FakeStorage,
      required: true,
    },
  },
  setup(props) {
    const model = useSettingsModel(props.storage)
    const onSyncToggle = (event: Event) => {
      void model.toggleSync((event.target as HTMLInputElement).checked)
    }
    return { ...model, onSyncToggle }
  },
  template: `
    <form>
      <output data-testid="status">{{ stateLabel }}</output>
      <input name="hoverDelay" type="number" v-model.number="settings.hoverDelayMs" />
      <input name="targetLanguage" v-model="settings.targetLanguage" />
      <span data-testid="schemes-count">{{ settings.schemes.length }}</span>
      <label>
        <input data-testid="sync-toggle" type="checkbox" :checked="syncEnabled" @change="onSyncToggle" />
      </label>
      <button data-testid="reset" type="button" @click="reset">reset</button>
    </form>
  `,
})

describe('useSettingsModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loaded settings in a component', async () => {
    const initial = cloneDefaultSettings()
    initial.hoverDelayMs = 350
    const { storage } = createStorage(initial)

    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    expect(storage.load).toHaveBeenCalledOnce()
    expect(
      (wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value,
    ).toBe('350')
  })

  it('autosaves after a user changes a setting', async () => {
    // flushPromises 依赖 setImmediate，fake timers 会劫持它导致挂起，改用时钟推进刷新微任务
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.find('input[name="hoverDelay"]').setValue('500')
    await vi.advanceTimersByTimeAsync(800)

    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 500 }))
  })

  it('shows the saved status after autosave completes', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.find('input[name="targetLanguage"]').setValue('English')
    await vi.advanceTimersByTimeAsync(800)

    expect(wrapper.get('[data-testid="status"]').text()).toBe('已自动保存')
  })

  it('serializes rapid saves so an older write cannot overwrite a newer setting', async () => {
    vi.useFakeTimers()
    let finishFirstSave: (() => void) | undefined
    const { storage } = createStorage()
    vi.mocked(storage.save)
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirstSave = resolve
      }))
      .mockResolvedValue(undefined)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.find('input[name="hoverDelay"]').setValue('300')
    await vi.advanceTimersByTimeAsync(800)

    expect(storage.save).toHaveBeenCalledTimes(1)

    await wrapper.find('input[name="hoverDelay"]').setValue('400')
    finishFirstSave?.()
    await vi.advanceTimersByTimeAsync(800)

    expect(storage.save).toHaveBeenCalledTimes(2)
    expect(storage.save).toHaveBeenLastCalledWith(expect.objectContaining({ hoverDelayMs: 400 }))
    expect(wrapper.get('[data-testid="status"]').text()).toBe('已自动保存')
  })

  it('flushes pending debounced changes when the component unmounts', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.find('input[name="hoverDelay"]').setValue('600')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 600 }))
  })

  it('saving the sync switch off only persists the flag without writing settings', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.get('[data-testid="sync-toggle"]').setValue(false)
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.saveSyncEnabled).toHaveBeenCalledWith(false)
    expect(storage.save).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="status"]').text()).toBe('已关闭同步，设置仅保存在本机')
  })

  it('pushes current settings immediately when sync is re-enabled', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.get('[data-testid="sync-toggle"]').setValue(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(storage.save).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="sync-toggle"]').setValue(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.saveSyncEnabled).toHaveBeenLastCalledWith(true)
    expect(storage.save).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="status"]').text()).toBe('已开启同步')
  })

  it('rolls back the switch and surfaces an error when saving the sync flag fails', async () => {
    vi.useFakeTimers()
    const { storage } = createStorage()
    vi.mocked(storage.saveSyncEnabled).mockRejectedValueOnce(new Error('storage unavailable'))
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.get('[data-testid="sync-toggle"]').setValue(false)
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.vm.syncEnabled).toBe(true)
    expect(wrapper.get('[data-testid="status"]').text()).toBe('同步设置保存失败，请稍后重试')
  })

  it('reset keeps schemes, target language and word settings while resetting form items', async () => {
    const initial = cloneDefaultSettings()
    initial.hoverDelayMs = 700
    initial.targetLanguage = 'English'
    initial.word.accent = 'uk'
    initial.schemes.push({
      id: 'ai-x',
      type: 'ai',
      enabled: true,
      label: '',
      apiUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-x',
      model: 'm',
      timeoutMs: 8000,
    })
    const { storage } = createStorage(initial)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.get('[data-testid="reset"]').trigger('click')
    await flushPromises()

    expect(storage.reset).toHaveBeenCalledOnce()
    expect(
      (wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value,
    ).toBe('200')
    expect(
      (wrapper.find('input[name="targetLanguage"]').element as HTMLInputElement).value,
    ).toBe('English')
    expect(wrapper.get('[data-testid="schemes-count"]').text()).toBe('6')
  })

  it('keeps defaults and reports a load failure', async () => {
    const { storage } = createStorage()
    vi.mocked(storage.load).mockRejectedValueOnce(new Error('storage unavailable'))

    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    expect(wrapper.get('[data-testid="status"]').text()).toBe('设置加载失败，已使用默认设置')
    expect((wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value).toBe('200')
  })

  it('reports a reset failure without leaving the form in a loading state', async () => {
    const { storage } = createStorage()
    vi.mocked(storage.reset).mockRejectedValueOnce(new Error('storage unavailable'))
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.get('[data-testid="reset"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="status"]').text()).toBe('恢复默认失败，请稍后重试')
  })
})
