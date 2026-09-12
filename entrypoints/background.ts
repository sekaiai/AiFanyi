import { browser } from 'wxt/browser'
import { requestAiTranslation } from '../src/core/ai'
import { lookupDictionary } from '../src/core/dictionary'
import { isExtensionMessage } from '../src/core/messages'
import { isSiteBlacklisted } from '../src/core/settings'
import { createBrowserSettingsStorage } from '../src/extension/storage'
import type { DisplayError, ExtensionMessage, ExtensionMessageResponse } from '../src/core/messages'
import type { RequestId } from '../src/core/messages'

const storage = createBrowserSettingsStorage()
const controllers = new Map<RequestId, AbortController>()

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage()
  })

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage()
  })

  browser.runtime.onMessage.addListener((message: unknown, sender): Promise<ExtensionMessageResponse> | undefined => {
    if (!isExtensionMessage(message)) return undefined
    return handleMessage(message, sender.url)
  })
})

async function handleMessage(message: ExtensionMessage, senderUrl?: string): Promise<ExtensionMessageResponse> {
  if (message.type === 'translation.cancel') {
    controllers.get(message.requestId)?.abort()
    controllers.delete(message.requestId)
    return { ok: false, requestId: message.requestId, error: toDisplayError(new DOMException('Cancelled', 'AbortError')) }
  }

  const controller = new AbortController()
  controllers.set(message.requestId, controller)
  try {
    const settings = await storage.load()
    if (message.type !== 'settings.testAi' && (!settings.enabled || (senderUrl && isSiteBlacklisted(senderUrl, settings.siteBlacklist)))) {
      return {
        ok: false,
        requestId: message.requestId,
        error: {
          code: !settings.enabled ? 'disabled' : 'blacklisted',
          message: !settings.enabled ? 'AiFanyi 已停用' : 'AiFanyi 已在当前站点停用',
          retryable: false,
        },
      }
    }

    if (message.type === 'dictionary.lookup') {
      const dictionary = await lookupDictionary(message.text, controller.signal)
      return { ok: true, requestId: message.requestId, kind: 'dictionary', result: dictionary }
    }

    const text = message.type === 'settings.testAi' ? 'AiFanyi connection test.' : message.text
    const translation = await requestAiTranslation(text, settings.ai, controller.signal)
    return { ok: true, requestId: message.requestId, kind: 'ai', result: translation }
  } catch (error) {
    return { ok: false, requestId: message.requestId, error: toDisplayError(error) }
  } finally {
    controllers.delete(message.requestId)
  }
}

function toDisplayError(error: unknown): DisplayError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'cancelled', message: '请求已取消', retryable: false }
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { code: 'timeout', message: '请求超时，请稍后重试', retryable: true }
  }
  const raw = error instanceof Error ? error.message : '未知错误'
  const message = raw.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [redacted]')
  if (message.startsWith('HTTP')) return { code: 'http', message, retryable: true }
  if (message.includes('JSON') || message.includes('为空')) return { code: 'parse', message, retryable: true }
  if (message.includes('填写') || message.includes('地址')) return { code: 'bad_config', message, retryable: false }
  return { code: 'network', message, retryable: true }
}
