import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import SchemesSection from '../../src/components/SchemesSection.vue'
import SettingsForm from '../../src/components/SettingsForm.vue'
import ColorField from '../../src/components/ColorField.vue'
import { cloneDefaultSettings, COLOR_PRESETS } from '../../src/core/settings'
import type { UsageStats } from '../../src/core/usage'

const SettingsHarness = defineComponent({
  components: { SettingsForm, SchemesSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    return { settings }
  },
  template: `<SettingsForm v-model="settings" status="已加载" />
    <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" />`,
})

const TestHarness = defineComponent({
  components: { SchemesSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    const failure = ref('')
    const calls = ref(0)
    const usage = shallowRef<UsageStats | null>(null)
    const testScheme = async () => {
      calls.value += 1
      if (failure.value) throw new Error(failure.value)
      return '方案配置可用'
    }
    return { settings, testScheme, failure, calls, usage }
  },
  template: `<SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" :usage="usage" :test-scheme="testScheme" />`,
})

const SyncHarness = defineComponent({
  components: { SchemesSection },
  setup() {
    const settings = ref(cloneDefaultSettings())
    const syncEnabled = ref(true)
    const toggles: boolean[] = []
    const toggleSync = (enabled: boolean) => {
      syncEnabled.value = enabled
      toggles.push(enabled)
    }
    return { settings, syncEnabled, toggleSync, toggles }
  },
  template: `<SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" show-sync :sync-enabled="syncEnabled" @toggle-sync="toggleSync" />`,
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

  it('binds the sentence show-original checkbox to the bubble settings', async () => {
    const wrapper = mount(SettingsHarness)

    const toggle = wrapper.get('[data-testid="show-original"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(toggle.element.closest('label')?.textContent).toContain('句子显示原文')

    await toggle.setValue(false)

    expect(wrapper.vm.settings.bubble.showOriginal).toBe(false)
  })

  it('shows the sync toggle with a title and emits its state changes', async () => {
    const wrapper = mount(SyncHarness)

    const toggle = () => wrapper.get('[data-testid="sync-toggle"]')
    expect((toggle().element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.sync-field').text()).toContain('同步到浏览器账号')
    expect(wrapper.get('.sync-field').attributes('title')).toContain('取消勾选后设置仅保存在本机')

    await toggle().setValue(false)
    expect(wrapper.vm.toggles).toEqual([false])
    expect((toggle().element as HTMLInputElement).checked).toBe(false)

    await toggle().setValue(true)
    expect(wrapper.vm.toggles).toEqual([false, true])
  })

  it('hides the sync toggle when the sync state is not provided', () => {
    const wrapper = mount(TestHarness)

    expect(wrapper.find('[data-testid="sync-toggle"]').exists()).toBe(false)
  })

  it('adds scheme cards with per-type defaults', async () => {
    const wrapper = mount(SettingsHarness)

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['google'])

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('ai')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="https://api.example.com/v1/chat/completions"]').setValue('https://api.example.com/v1/chat/completions')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="gpt-4o-mini"]').setValue('gpt-4o-mini')
    await wrapper.get('[data-testid="scheme-editor"] input[type="password"]').setValue('sk-test')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['google', 'ai'])
    expect(wrapper.vm.settings.schemes[1]).toMatchObject({ type: 'ai', timeoutMs: 20000 })
  })

  it('shows a custom AI scheme title on the card and falls back to the default name', async () => {
    const wrapper = mount(TestHarness)

    // 留空标题：卡片显示默认名「自定义 AI」
    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('ai')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="https://api.example.com/v1/chat/completions"]').setValue('https://api.example.com/v1/chat/completions')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="gpt-4o-mini"]').setValue('gpt-4o-mini')
    await wrapper.get('[data-testid="scheme-editor"] input[type="password"]').setValue('sk-test')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.get('[data-testid="scheme-card-ai"]').text()).toContain('自定义 AI')

    // 填写标题：卡片显示自定义标题
    await wrapper.get('[data-testid="scheme-card-ai"]').get('button[title="编辑"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="自定义 AI"]').setValue('我的智谱')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.get('[data-testid="scheme-card-ai"]').text()).toContain('我的智谱')
    expect(wrapper.vm.settings.schemes[1]).toMatchObject({ type: 'ai', label: '我的智谱' })
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

    expect(wrapper.vm.settings.schemes[1]).toMatchObject({ type: 'baidu', appId: 'app-id-edited', secretKey: 'secret-key' })
  })

  it('adds a Baidu AI scheme with the nmt model by default', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('baiduAi')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译 AppID"]').setValue('app-id')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="百度翻译密钥"]').setValue('secret-key')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

    expect(wrapper.get('[data-testid="scheme-card-baiduAi"]').text()).toContain('百度大模型翻译')
    expect(wrapper.vm.settings.schemes[1]).toMatchObject({ type: 'baiduAi', appId: 'app-id', secretKey: 'secret-key', modelType: 'nmt' })
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

    expect(wrapper.vm.settings.schemes[1]).toMatchObject({ type: 'volcengine', accessKeyId: 'ak-id', secretAccessKey: 'secret-key', region: 'cn-beijing' })
  })

  it('shows provider-specific beginner guidance in the editor modal', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')

    // jsdom 的 getComputedStyle 对 display 返回空串，wrapper.isVisible() 在这里不可靠，
    // 因此直接断言 v-show 写入的内联样式。
    const isGuideCollapsed = () => (wrapper.get('[data-testid="scheme-guide-body"]').attributes('style') ?? '').includes('display: none')

    const toggle = wrapper.get('[data-testid="scheme-guide-toggle"]')
    expect(toggle.text()).toContain('新手指南')
    expect(toggle.text()).toContain('新手指南 ·兼容 OpenAI 的 AI 接口')
    expect(toggle.text()).toContain('配置随账号同步')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(isGuideCollapsed()).toBe(false)

    const guideText = wrapper.get('[data-testid="scheme-guide-body"]').text()
    expect(guideText).toContain('能按提示词调语气，整句和段落更灵活 · 费用取决于服务商')
    expect(guideText).toContain('创建 API Key')
    expect(guideText).toContain('怎么用')
    expect(guideText).toContain('官方入口')
    expect(guideText.indexOf('怎么用')).toBeLessThan(guideText.indexOf('官方入口'))
    expect(guideText).not.toContain('优点')
    expect(guideText).not.toContain('注意事项')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(isGuideCollapsed()).toBe(true)

    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    expect(wrapper.get('[data-testid="scheme-editor"]').text()).toContain('新手指南 ·DeepL')
    const deeplGuide = wrapper.get('[data-testid="scheme-guide-body"]').text()
    expect(deeplGuide).toContain('句子和段落读起来更自然 · 每月 50 万字符免费')
    expect(deeplGuide).toContain('申请 API 账户')

    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('volcengine')
    const editorText = wrapper.get('[data-testid="scheme-editor"]').text()
    expect(editorText).toContain('新手指南 ·火山引擎')
    expect(editorText).toContain('密钥管理页面（拿 AK/SK）')
    expect(editorText).toContain('国内接入顺畅')
    // 切换方案类型后指南回到默认的展开态
    expect(wrapper.get('[data-testid="scheme-guide-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(isGuideCollapsed()).toBe(false)
  })

  it('reorders, toggles and removes scheme cards', async () => {
    const wrapper = mount(SettingsHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="DeepL-Auth-Key"]').setValue('deepl-key')
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')

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
    expect(wrapper.get('button[title="默认方案，不可删除"]').attributes('disabled')).toBeDefined()
  })

  it('shows latency with a speed tone after a successful scheme test', async () => {
    const wrapper = mount(TestHarness)

    await wrapper.get('[data-testid="scheme-test-google"]').trigger('click')
    await flushPromises()

    const status = wrapper.get('[data-testid="scheme-card-google"] .settings-status')
    expect(status.text()).toMatch(/^成功 · \d+ ms$/)
    expect(status.classes()).toContain('fast')
  })

  it('keeps the editor open and shows the reason when the pre-save test fails', async () => {
    const wrapper = mount(TestHarness)

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    await wrapper.get('[data-testid="scheme-editor-type"]').setValue('deepl')
    await wrapper.get('[data-testid="scheme-editor"] input[placeholder="DeepL-Auth-Key"]').setValue('deepl-key')
    wrapper.vm.failure = 'HTTP 401'
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.calls).toBe(1)
    expect(wrapper.vm.settings.schemes).toHaveLength(1)
    expect(wrapper.find('[data-testid="scheme-editor"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="scheme-editor-error"]').text()).toBe('接口测试未通过：HTTP 401')

    wrapper.vm.failure = ''
    await wrapper.get('[data-testid="scheme-editor-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.calls).toBe(2)
    expect(wrapper.vm.settings.schemes.map((scheme) => scheme.type)).toEqual(['google', 'deepl'])
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
    expect(wrapper.vm.settings.schemes).toHaveLength(1)
  })

  it('keeps the built-in Google default undeletable but toggleable', async () => {
    const wrapper = mount(TestHarness)

    const card = wrapper.get('[data-testid="scheme-card-google"]')
    expect(card.text()).toContain('默认')
    expect(card.get('button[title="默认方案，不可删除"]').attributes('disabled')).toBeDefined()

    await card.get('input[type="checkbox"]').setValue(false)
    expect(wrapper.vm.settings.schemes[0]).toMatchObject({ type: 'google', enabled: false })

    await card.get('button[title="编辑"]').trigger('click')
    const typeSelect = wrapper.get('[data-testid="scheme-editor-type"]')
    expect(typeSelect.attributes('disabled')).toBeDefined()
    expect(typeSelect.findAll('option').some((option) => option.attributes('value') === 'google')).toBe(true)
    await wrapper.get('button[title="关闭"]').trigger('click')

    await wrapper.get('[data-testid="add-scheme"]').trigger('click')
    const addSelect = wrapper.get('[data-testid="scheme-editor-type"]')
    expect(addSelect.attributes('disabled')).toBeUndefined()
    expect(addSelect.findAll('option').some((option) => option.attributes('value') === 'google')).toBe(false)
  })

  it('defaults the scheme order to random and two-way binds the select', async () => {
    const wrapper = mount(TestHarness)

    const orderSelect = wrapper.get('[data-testid="scheme-order"]')
    expect((orderSelect.element as HTMLSelectElement).value).toBe('random')
    expect(wrapper.vm.settings.schemeOrder).toBe('random')
    expect(orderSelect.findAll('option').map((option) => option.text())).toEqual(['随机', '依次使用'])

    await orderSelect.setValue('sequential')
    expect(wrapper.vm.settings.schemeOrder).toBe('sequential')
  })

  it('switches the order hint with the selected mode', async () => {
    const wrapper = mount(TestHarness)

    expect(wrapper.get('.section-hint').text()).toContain('随机挑选可用方案')

    await wrapper.get('[data-testid="scheme-order"]').setValue('sequential')
    expect(wrapper.get('.section-hint').text()).toContain('按顺序依次尝试')
  })

  it('drops the configured badge from scheme cards', async () => {
    const wrapper = mount(TestHarness)

    const card = wrapper.get('[data-testid="scheme-card-google"]')
    expect(card.text()).not.toContain('配置完成')
    expect(card.text()).not.toContain('待完善配置')
  })

  it('renders per-scheme usage rows only when usage data is provided', async () => {
    const wrapper = mount(TestHarness)

    expect(wrapper.find('[data-testid="scheme-usage-default-google"]').exists()).toBe(false)

    wrapper.vm.usage = {
      month: '2024-03',
      sentence: { 'default-google': { month: 2, monthChars: 25, total: 8, totalChars: 120 } },
      word: { month: 0, monthChars: 0, total: 0, totalChars: 0 },
    }
    await flushPromises()

    expect(wrapper.get('[data-testid="scheme-usage-default-google"]').text())
      .toBe('本月 2 次 · 25 / 共 8 次 · 120')
  })
})
