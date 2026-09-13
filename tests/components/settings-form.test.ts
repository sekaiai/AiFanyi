import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import SchemesSection from '../../src/components/SchemesSection.vue'
import SettingsForm from '../../src/components/SettingsForm.vue'
import ColorField from '../../src/components/ColorField.vue'
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
    const failure = ref('')
    const calls = ref(0)
    const testScheme = async () => {
      calls.value += 1
      if (failure.value) throw new Error(failure.value)
      return '方案配置可用'
    }
    return { settings, testScheme, failure, calls }
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
    const colorField = wrapper.findComponent(ColorField)

    colorField.vm.$emit('update:modelValue', '#123456')
    await flushPromises()

    expect(wrapper.vm.settings.bubble.colorPreset).toBe('custom')
    expect(wrapper.vm.settings.bubble.background).toBe('#123456')
  })

  it('adds scheme cards with per-type defaults', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('ai')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="https://api.example.com/v1/chat/completions"]').setValue('https://api.example.com/v1/chat/completions')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="gpt-4o-mini"]').setValue('gpt-4o-mini')
    await wrapper.get('[data-testid="scheme-editor"] input[type="password"]').setValue('sk-test')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['ai', 'google'])
    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'ai', timeoutMs: 20000 })
  })

  it('adds and edits a Baidu scheme', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('baidu')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译 AppID"]').setValue('app-id')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译密钥"]').setValue('secret-key')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    const card = wrapper.get('[data-testid="scheme-card-baidu"]')
    expect(card.text()).not.toContain('app-id')
    expect(card.text()).not.toContain('secret-key')

    await card.get('button[title="编辑"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译 AppID"]').setValue('app-id-edited')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'baidu', appId: 'app-id-edited', secretKey: 'secret-key' })
  })

  it('adds and edits a Volcengine scheme without exposing credentials in the card', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('volcengine')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="火山引擎 Access Key ID"]').setValue('ak-id')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="火山引擎 Secret Access Key"]').setValue('secret-key')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    const card = wrapper.get('[data-testid="scheme-card-volcengine"]')
    expect(card.text()).not.toContain('ak-id')
    expect(card.text()).not.toContain('secret-key')

    await card.get('button[title="编辑"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="cn-north-1"]').setValue('cn-beijing')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'volcengine', accessKeyId: 'ak-id', secretAccessKey: 'secret-key', region: 'cn-beijing' })
  })

  it('shows provider-specific beginner guidance in the editor modal', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    // jsdom 的 getComputedStyle 对 display 返回空串，wrapper.isVisible() 在这里不可靠，
    // 因此直接断言 v-show 写入的内联样式。
    const isGuideCollapsed = () => (wrapper.get('[data-testid="scheme-guide-body"]').attributes('style') ?? '').includes('display: none')

    const toggle = wrapper.get('[data-testid="scheme-guide-toggle"]')
    expect(toggle.text()).toContain('新手指南')
    expect(toggle.text()).toContain('DeepL配置步骤与官方入口')
    expect(toggle.text()).toContain('密钥仅本地保存')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(isGuideCollapsed()).toBe(false)

    const guideText = wrapper.get('[data-testid="scheme-guide-body"]').text()
    expect(guideText).toContain('句子和段落读起来更自然 · 每月 50 万字符免费')
    expect(guideText).toContain('怎么用')
    expect(guideText).toContain('官方入口')
    expect(guideText).toContain('申请 API 账户')
    expect(guideText.indexOf('怎么用')).toBeLessThan(guideText.indexOf('官方入口'))
    expect(guideText).not.toContain('优点')
    expect(guideText).not.toContain('注意事项')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(isGuideCollapsed()).toBe(true)

    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('volcengine')
    const editorText = wrapper.get('[data-testid="scheme-editor"]').text()
    expect(editorText).toContain('火山引擎配置步骤与官方入口')
    expect(editorText).toContain('密钥管理页面（拿 AK/SK）')
    expect(editorText).toContain('国内接入顺畅')
    // 切换方案类型后指南回到默认的展开态
    expect(wrapper.get('[data-testid="scheme-guide-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(isGuideCollapsed()).toBe(false)
  })

  it('reorders, toggles and removes scheme cards', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="DeepL-Auth-Key"]').setValue('deepl-key')
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
    await flushPromises()
    await wrapper.get('[data-testid="scheme-test-google"]').trigger('click')
    await flushPromises()

    const status = wrapper.get('[data-testid="scheme-card-google"] .settings-status')
    expect(status.text()).toMatch(/^成功 · \d+ ms$/)
    expect(status.classes()).toContain('fast')
  })

  it('keeps the editor open and shows the reason when the pre-save test fails', async () => {
    const wrapper = mount(TestHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('google')
    wrapper.vm.failure = 'HTTP 401'
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.calls).toBe(1)
    expect(wrapper.vm.settings.schemes).toHaveLength(0)
    expect(wrapper.find('[data-testid="scheme-editor"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="scheme-editor-error"]').text()).toBe('接口测试未通过：HTTP 401')

    wrapper.vm.failure = ''
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.calls).toBe(2)
    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['google'])
    expect(wrapper.find('[data-testid="scheme-editor"]').exists()).toBe(false)
  })

  it('reports missing fields before calling the test endpoint', async () => {
    const wrapper = mount(TestHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="scheme-editor-error"]').text()).toBe('请填写 Auth Key')
    expect(wrapper.vm.calls).toBe(0)
    expect(wrapper.vm.settings.schemes).toHaveLength(0)
  })
})
