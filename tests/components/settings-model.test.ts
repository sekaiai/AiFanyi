import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsModel } from '../../src/composables/useSettingsModel'
import { cloneDefaultSettings } from '../../src/core/settings'
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
      current = cloneDefaultSettings()
      return structuredClone(current)
    }),
    subscribe: vi.fn(() => vi.fn()),
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
    return useSettingsModel(props.storage)
  },
  template: `
    <form>
      <output data-testid="status">{{ stateLabel }}</output>
      <input name="hoverDelay" type="number" v-model.number="settings.hoverDelayMs" />
      <input name="targetLanguage" v-model="settings.targetLanguage" />
      <button data-testid="reset" type="button" @click="reset">reset</button>
    </form>
  `,
})

describe('useSettingsModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.find('input[name="hoverDelay"]').setValue('500')
    await flushPromises()

    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ hoverDelayMs: 500 }))
  })

  it('shows the saved status after autosave completes', async () => {
    const { storage } = createStorage()
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.find('input[name="targetLanguage"]').setValue('English')
    await flushPromises()

    expect(wrapper.get('[data-testid="status"]').text()).toBe('已自动保存')
  })

  it('serializes rapid saves so an older write cannot overwrite a newer setting', async () => {
    let finishFirstSave: (() => void) | undefined
    const { storage } = createStorage()
    vi.mocked(storage.save)
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirstSave = resolve
      }))
      .mockResolvedValue(undefined)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.find('input[name="hoverDelay"]').setValue('300')
    await wrapper.find('input[name="hoverDelay"]').setValue('400')
    await flushPromises()

    expect(storage.save).toHaveBeenCalledTimes(1)
    finishFirstSave?.()
    await flushPromises()

    expect(storage.save).toHaveBeenCalledTimes(2)
    expect(storage.save).toHaveBeenLastCalledWith(expect.objectContaining({ hoverDelayMs: 400 }))
    expect(wrapper.get('[data-testid="status"]').text()).toBe('已自动保存')
  })

  it('restores default settings when reset is clicked', async () => {
    const initial = cloneDefaultSettings()
    initial.hoverDelayMs = 700
    const { storage } = createStorage(initial)
    const wrapper = mount(SettingsHarness, { props: { storage } })
    await flushPromises()

    await wrapper.get('[data-testid="reset"]').trigger('click')
    await flushPromises()

    expect(storage.reset).toHaveBeenCalledOnce()
    expect(
      (wrapper.find('input[name="hoverDelay"]').element as HTMLInputElement).value,
    ).toBe('200')
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
