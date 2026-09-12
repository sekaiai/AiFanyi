import { browser } from 'wxt/browser'
import { isExtensionMessage, isPublicSettingsRequest, toDisplayError, type PublicSettingsResponse } from '../src/core/messages'
import { isSiteBlocked } from '../src/core/settings'
import { runTranslation, translateWithScheme } from '../src/core/translate'
import { createBrowserSettingsStorage, toContentSettings } from '../src/extension/storage'
import type { ExtensionMessage, ExtensionResponse } from '../src/core/messages'
import type { RequestId } from '../src/core/messages'
import type { TranslateOutcome } from '../src/core/translate'

const storage = createBrowserSettingsStorage()
const controllers = new Map<RequestId, AbortController>()

export default defineBackground(() => {
  restrictStorageToTrustedContexts()

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage()
  })

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage()
  })

  storage.subscribe((settings) => {
    void browser.runtime.sendMessage({ type: 'settings.public.update', settings: toContentSettings(settings) }).catch(() => undefined)
  })

  browser.runtime.onMessage.addListener((message: unknown, sender): Promise<ExtensionResponse | PublicSettingsResponse> | undefined => {
    if (isPublicSettingsRequest(message)) {
      return storage.load().then((settings) => ({ type: 'settings.public.response', settings: toContentSettings(settings) }))
    }
    if (!isExtensionMessage(message)) return undefined
    return handleMessage(message, sender.url)
  })
})

async function handleMessage(message: ExtensionMessage, senderUrl?: string): Promise<ExtensionResponse> {
  if (message.type === 'translation.cancel') {
    controllers.get(message.requestId)?.abort()
    controllers.delete(message.requestId)
    return { ok: false, requestId: message.requestId, error: toDisplayError(new DOMException('Cancelled', 'AbortError')) }
  }

  const controller = new AbortController()
  controllers.set(message.requestId, controller)
  try {
    const settings = await storage.load()
    if (!settings.enabled || (senderUrl && isSiteBlocked(senderUrl, settings.siteBlacklist))) {
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

    if (message.type === 'settings.testScheme') {
      const scheme = settings.schemes.find((item) => item.id === message.schemeId)
      if (!scheme) {
        return {
          ok: false,
          requestId: message.requestId,
          error: { code: 'bad_config', message: '未找到对应的翻译方案', retryable: false },
        }
      }
      const outcome = await translateWithScheme(scheme, 'AiFanyi connection test.', settings.targetLanguage, controller.signal)
      return outcomeToResponse(outcome, message.requestId)
    }

    const outcome = await runTranslation(message.text, settings, controller.signal)
    return outcomeToResponse(outcome, message.requestId)
  } catch (error) {
    return { ok: false, requestId: message.requestId, error: toDisplayError(error) }
  } finally {
    controllers.delete(message.requestId)
  }
}

function restrictStorageToTrustedContexts(): void {
  const localStorage = browser.storage.local as typeof browser.storage.local & {
    setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }) => Promise<void>
  }
  void Promise.resolve(localStorage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })).catch(() => undefined)
}

function outcomeToResponse(outcome: TranslateOutcome, requestId: RequestId): ExtensionResponse {
  return outcome.kind === 'dictionary'
    ? { ok: true, requestId, kind: 'dictionary', result: outcome.result }
    : { ok: true, requestId, kind: 'text', result: outcome.text }
}
