import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import SettingsForm from '../../src/components/SettingsForm.vue'
import { cloneDefaultSettings, COLOR_PRESETS } from '../../src/core/settings'

const SettingsHarness = defineComponent({
  components: { SettingsForm },
  setup() {
    const settings = ref(cloneDefaultSettings())
    return { settings }
  },
  template: '<SettingsForm v-model="settings" status="已加载" />',
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
})
