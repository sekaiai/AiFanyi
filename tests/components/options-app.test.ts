import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import OptionsApp from '../../src/components/OptionsApp.vue'

// pickr 在 happy-dom 下无法真实初始化，ColorField 挂载依赖它，这里给最小桩
vi.mock('@simonwep/pickr', () => ({
  default: {
    create: () => ({
      on: () => undefined,
      setColor: () => true,
      destroyAndRemove: () => undefined,
    }),
  },
}))

// latency 非空：挂载读取状态后不再触发自动补测，保证消息计数只来自用户点击
const probeState = {
  checkedAt: 1757600000000,
  results: { youdao: true, bing: true, google: true, freedictionaryapi: true },
  latency: { youdao: 90, bing: 120, google: 140, freedictionaryapi: 160 },
}

type RuntimeMessage = { type?: string; requestId?: unknown; scheme?: { type?: string } }

describe('OptionsApp probe-words linkage', () => {
  let messages: RuntimeMessage[]

  const callsOfType = (type: string) => messages.filter((message) => message.type === type)

  beforeEach(async () => {
    vi.clearAllMocks()
    messages = []
    await browser.storage.local.clear()
    await browser.storage.sync.clear()
    // 新装路径会按浏览器语言覆写 uiLocale，固定中文环境以断言 zh 文案
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
      const record = message as RuntimeMessage
      messages.push(record)
      if (record.type === 'wordSources.state' || record.type === 'wordSources.probe') {
        return { type: record.type, requestId: record.requestId, state: probeState }
      }
      return { ok: true, requestId: record.requestId }
    })
  })

  it('runs word probe and sentence scheme tests together from the probe button', async () => {
    const wrapper = mount(OptionsApp)
    await flushPromises()

    // 挂载只读取探测状态，不触发补测；消息里应只有 wordSources.state
    expect(callsOfType('wordSources.probe')).toHaveLength(0)

    await wrapper.get('[data-testid="probe-words"]').trigger('click')
    await flushPromises()

    expect(callsOfType('wordSources.probe')).toHaveLength(1)
    const tested = callsOfType('settings.testScheme')
    expect(tested).toHaveLength(5)
    expect(tested.map((message) => message.scheme?.type))
      .toEqual(['bing', 'google', 'mymemory', 'yandex', 'reverso'])

    // 句子面板逐卡显示成功状态
    expect(wrapper.get('[data-testid="scheme-card-bing"] .settings-status').text()).toMatch(/^成功 · \d+ ms$/)
    expect(wrapper.get('[data-testid="scheme-card-reverso"] .settings-status').text()).toMatch(/^成功 · \d+ ms$/)
  })
})
