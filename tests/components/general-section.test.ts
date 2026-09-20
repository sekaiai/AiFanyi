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

  it('translates through the provided UI locale context', () => {
    const wrapper = mount(EnGeneralHarness)

    expect(wrapper.get('.section-title').text()).toBe('General')
    expect((wrapper.get('[data-testid="ui-locale"]').element as HTMLSelectElement).value).toBe('en')
  })
})
