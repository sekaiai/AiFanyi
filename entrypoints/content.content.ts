import { browser } from 'wxt/browser'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type { ExtensionResponse } from '../src/core/messages'
import { isSiteBlocked } from '../src/core/settings'
import type { TranslationSettings } from '../src/core/types'
import { createHighlight } from '../src/extension/highlight'
import { createInteraction } from '../src/extension/interaction'
import { createBubbleRenderer } from '../src/extension/renderer'
import { createSelectableStyle } from '../src/extension/selectable'
import { loadContentSettings, watchContentSettings } from '../src/extension/storage'

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  allFrames: true,
  matchAboutBlank: true,
  main(ctx) {
    void run(ctx)
  },
})

async function run(ctx: ContentScriptContext): Promise<void> {
  let settings = await loadContentSettings()
  const renderer = createBubbleRenderer(settings.bubble)
  const highlight = createHighlight()
  const selectableStyle = createSelectableStyle()
  const isActive = (current: TranslationSettings): boolean => current.enabled && !isSiteBlocked(location.href, current.siteBlacklist)
  // 按钮可选中样式只在交互真正生效（悬停或划词开启）时需要；停用/黑名单/全关时恢复浏览器默认
  const syncSelectable = (current: TranslationSettings): void => {
    selectableStyle.disabled = !(isActive(current) && (current.hoverEnabled || current.selectionEnabled))
  }
  syncSelectable(settings)
  // 交互状态机与演示页共享，这里只注入扩展端的差异：
  // 消息通道收发 + 全页面生效（含站点黑名单检查）。
  const interaction = createInteraction({
    getSettings: () => settings,
    renderer,
    highlight,
    isActive,
    acceptHoverTarget: () => true,
    acceptSelectTarget: () => true,
    send: (text, requestId) =>
      browser.runtime.sendMessage({ type: 'translation.request', requestId: `cs-${requestId}`, text }) as Promise<ExtensionResponse>,
    cancel: (requestId) => {
      void browser.runtime.sendMessage({ type: 'translation.cancel', requestId: `cs-${requestId}` })
    },
  })

  const unsubscribe = watchContentSettings((next) => {
    settings = next
    interaction.updateSettings(next)
    syncSelectable(next)
  })

  interaction.start()

  ctx.onInvalidated(() => {
    unsubscribe()
    interaction.destroy()
    highlight.remove()
    selectableStyle.remove()
    renderer.destroy()
  })
}
