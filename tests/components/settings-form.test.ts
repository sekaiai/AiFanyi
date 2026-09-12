import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import SchemesSection from '../../src/components/SchemesSection.vue'
import SettingsForm from '../../src/components/SettingsForm.vue'
import { cloneDefaultSettings, COLOR_PRESETS } from '../../src/core/settings'

const SettingsHarness = defineComponent({
  components: { SettingsForm, SchemesSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    return { settings }
  },
  template: `<SettingsForm v-model="settings" status="已加载" />
    <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" />`,
})

describe('SettingsForm', () => {
  it('applies a color preset without replacing the settings object', async () => {
    const wrapper = mount(SettingsHarness)
    const originalSettings = wrapper.vm.settings

    await wrapper.get('[data-testid="color-preset"]').setValue('night')
    await flushPromises()

    expect(wrapper.vm.settings).toBe(originalSettings)
    expect(wrapper.vm.settings.bubble).toMatchObject({
      colorPreset: 'night',
      ...COLOR_PRESETS.night,
    })
    expect(wrapper.get('[data-testid="bubble-preview"]').attributes('style'))
      .toContain(`--af-bubble-background: ${COLOR_PRESETS.night.background}`)
  })

  it('marks the preset as custom after a color is edited', async () => {
    const wrapper = mount(SettingsHarness)
    const colorInput = wrapper.find('input[type="color"]')

    await colorInput.setValue('#123456')
    await colorInput.trigger('input')

    expect(wrapper.vm.settings.bubble.colorPreset).toBe('custom')
    expect(wrapper.vm.settings.bubble.background).toBe('#123456')
  })

  it('adds scheme cards with per-type defaults', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="scheme-type"]').setValue('ai')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-type"]').setValue('google')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['ai', 'google'])
    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'ai', timeoutMs: 20000 })
    expect(wrapper.find('[data-testid="dictionary-fallback"]').exists()).toBe(true)
  })

  it('reorders, toggles and removes scheme cards', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="scheme-type"]').setValue('google')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-type"]').setValue('deepl')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['google', 'deepl'])

    const deeplCard = () => wrapper.get('[data-testid="scheme-card-deepl"]')
    await deeplCard().get('button[title="上移"]').trigger('click')
    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['deepl', 'google'])
    expect(deeplCard().get('button[title="上移"]').attributes('disabled')).toBeDefined()

    await deeplCard().find('input[type="checkbox"]').setValue(false)
    expect(wrapper.vm.settings.schemes[0]?.enabled).toBe(false)

    await deeplCard().get('button[title="删除"]').trigger('click')
    expect(wrapper.vm.settings.schemes).toHaveLength(1)
    expect(wrapper.find('[data-testid="scheme-card-deepl"]').exists()).toBe(false)
  })
})
