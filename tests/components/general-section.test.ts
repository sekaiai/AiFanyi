import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { provideUiLocale } from '../../src/composables/useUiLocale'
import GeneralSection from '../../src/components/GeneralSection.vue'
import { cloneDefaultSettings } from '../../src/core/settings'

const GeneralHarness = defineComponent({
  components: { GeneralSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    return { settings }
  },
  template: `<GeneralSection v-model:ui-locale="settings.uiLocale" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" />`,
})

const GeneralSyncHarness = defineComponent({
  components: { GeneralSection },
  setup() {
    const defaults = cloneDefaultSettings()
    const uiLocale = ref(defaults.uiLocale)
    const targetLanguage = ref(defaults.targetLanguage)
    const schemeOrder = ref(defaults.schemeOrder)
    const syncEnabled = ref(true)
    const toggles: boolean[] = []
    const toggleSync = (enabled: boolean) => {
      syncEnabled.value = enabled
      toggles.push(enabled)
    }
    return { uiLocale, targetLanguage, schemeOrder, syncEnabled, toggleSync, toggles }
  },
  template: `<GeneralSection v-model:ui-locale="uiLocale" v-model:target-language="targetLanguage" v-model:scheme-order="schemeOrder" show-sync :sync-enabled="syncEnabled" @toggle-sync="toggleSync" />`,
})

const EnGeneralHarness = defineComponent({
  components: { GeneralSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    settings.value.uiLocale = 'en'
    provideUiLocale(computed(() => settings.value.uiLocale))
    return { settings }
  },
  template: `<GeneralSection v-model:ui-locale="settings.uiLocale" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" />`,
})

describe('GeneralSection', () => {
  it('defaults the three selects and two-way binds them', async () => {
    const wrapper = mount(GeneralHarness)

    const localeSelect = wrapper.get('[data-testid="ui-locale"]')
    expect((localeSelect.element as HTMLSelectElement).value).toBe('zh')
    expect(localeSelect.findAll('option').map((option) => option.text())).toEqual(['中文', 'English'])

    const languageSelect = wrapper.get('[data-testid="target-language"]')
    expect((languageSelect.element as HTMLSelectElement).value).toBe('简体中文')

    const orderSelect = wrapper.get('[data-testid="scheme-order"]')
    expect((orderSelect.element as HTMLSelectElement).value).toBe('random')
    expect(orderSelect.findAll('option').map((option) => option.text())).toEqual(['随机', '依次使用'])

    await localeSelect.setValue('en')
    expect(wrapper.vm.settings.uiLocale).toBe('en')
    await languageSelect.setValue('English')
    expect(wrapper.vm.settings.targetLanguage).toBe('English')
    await orderSelect.setValue('sequential')
    expect(wrapper.vm.settings.schemeOrder).toBe('sequential')
  })

  it('switches the order hint with the selected mode', async () => {
    const wrapper = mount(GeneralHarness)

    expect(wrapper.get('.section-hint').text()).toContain('随机挑选可用方案')

    await wrapper.get('[data-testid="scheme-order"]').setValue('sequential')
    expect(wrapper.get('.section-hint').text()).toContain('按顺序依次尝试')
  })

  it('shows the sync toggle with a title and emits its state changes', async () => {
    const wrapper = mount(GeneralSyncHarness)

    const toggle = () => wrapper.get('[data-testid="sync-toggle"]')
    expect((toggle().element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.sync-field').text()).toContain('所有设置同步到浏览器账号')
    expect(wrapper.get('.sync-field').attributes('title')).toContain('取消勾选后设置仅保存在本机')

    await toggle().setValue(false)
    expect(wrapper.vm.toggles).toEqual([false])
    expect((toggle().element as HTMLInputElement).checked).toBe(false)

    await toggle().setValue(true)
    expect(wrapper.vm.toggles).toEqual([false, true])
  })

  it('hides the sync toggle when the sync state is not provided', () => {
    const wrapper = mount(GeneralHarness)

    expect(wrapper.find('[data-testid="sync-toggle"]').exists()).toBe(false)
  })

  it('translates through the provided UI locale context', () => {
    const wrapper = mount(EnGeneralHarness)

    expect(wrapper.get('.section-title').text()).toBe('General')
    expect((wrapper.get('[data-testid="ui-locale"]').element as HTMLSelectElement).value).toBe('en')
  })
})
