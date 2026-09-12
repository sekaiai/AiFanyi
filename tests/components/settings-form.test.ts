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

const TestHarness = defineComponent({
  components: { SchemesSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    const testScheme = async () => '方案配置可用'
    return { settings, testScheme }
  },
  template: `<SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" :test-scheme="testScheme" />`,
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

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('ai')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['ai', 'google'])
    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'ai', timeoutMs: 20000 })
    expect(wrapper.find('[data-testid="dictionary-fallback"]').exists()).toBe(true)
  })

  it('adds and edits a Baidu scheme', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('baidu')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    const card = wrapper.get('[data-testid="scheme-card-baidu"]')
    expect(card.text()).not.toContain('app-id')
    expect(card.text()).not.toContain('secret-key')

    await card.get('button[title="编辑"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译 AppID"]').setValue('app-id')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译密钥"]').setValue('secret-key')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'baidu', appId: 'app-id', secretKey: 'secret-key' })
  })

  it('adds and edits a Volcengine scheme without exposing credentials in the card', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('volcengine')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    const card = wrapper.get('[data-testid="scheme-card-volcengine"]')
    expect(card.text()).not.toContain('ak-id')
    expect(card.text()).not.toContain('secret-key')

    await card.get('button[title="编辑"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="火山引擎 Access Key ID"]').setValue('ak-id')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="火山引擎 Secret Access Key"]').setValue('secret-key')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="cn-north-1"]').setValue('cn-beijing')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'volcengine', accessKeyId: 'ak-id', secretAccessKey: 'secret-key', region: 'cn-beijing' })
  })

  it('shows provider-specific beginner guidance in the editor modal', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    const deeplText = wrapper.get('[data-testid="scheme-editor"]').text()
    expect(deeplText).toContain('DeepL配置指南')
    expect(deeplText).toContain('申请 API 账户')
    expect(deeplText).toContain('每月 50 万字符')
    expect(deeplText.indexOf('优点与注意事项')).toBeLessThan(deeplText.indexOf('怎么用'))

    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('volcengine')
    const editorText = wrapper.get('[data-testid="scheme-editor"]').text()
    expect(editorText).toContain('火山引擎配置指南')
    expect(editorText).toContain('密钥管理控制台')
    expect(editorText).toContain('优点')
    expect(editorText).toContain('注意事项')
  })

  it('reorders, toggles and removes scheme cards', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
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

  it('shows latency with a speed tone after a successful scheme test', async () => {
    const wrapper = mount(TestHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="scheme-test-google"]').trigger('click')
    await flushPromises()

    const status = wrapper.get('[data-testid="scheme-card-google"] .settings-status')
    expect(status.text()).toMatch(/^成功 · \d+ ms$/)
    expect(status.classes()).toContain('fast')
  })
})
