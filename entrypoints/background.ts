import { browser } from 'wxt/browser'
import {
  isExtensionMessage,
  isPublicSettingsRequest,
  isWordSourcesMessage,
  toDisplayError,
  type PublicSettingsResponse,
  type WordSourcesResponse,
} from '../src/core/messages'
import { isSiteBlocked } from '../src/core/settings'
import { runTranslation, SCHEME_TEST_PHRASE, translateWithScheme } from '../src/core/translate'
import { probeWordSources, WORD_PROBE_STORAGE_KEY, type WordProbeState } from '../src/core/word-sources'
import { createBrowserSettingsStorage, toContentSettings } from '../src/extension/storage'
import type { ExtensionMessage, ExtensionResponse } from '../src/core/messages'
import type { RequestId } from '../src/core/messages'
import type { TranslateOutcome } from '../src/core/translate'

const storage = createBrowserSettingsStorage()
const controllers = new Map<RequestId, AbortController>()

let probeState: WordProbeState | null = null
let probeLoaded = false

export default defineBackground(() => {
  restrictStorageToTrustedContexts()

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage()
    // 安装 / 更新后探测一次单词源连通性（带 4s 超时，失败静默）
    void refreshProbeState()
  })

  browser.runtime.onStartup.addListener(() => {
    void refreshProbeState()
  })

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage()
  })

  storage.subscribe((settings) => {
    void browser.runtime.sendMessage({ type: 'settings.public.update', settings: toContentSettings(settings) }).catch(() => undefined)
  })

  browser.runtime.onMessage.addListener((message: unknown, sender): Promise<ExtensionResponse | PublicSettingsResponse | WordSourcesResponse> | undefined => {
    if (isPublicSettingsRequest(message)) {
      return storage.load().then((settings) => ({ type: 'settings.public.response', settings: toContentSettings(settings) }))
    }
    if (isWordSourcesMessage(message)) return handleWordSourcesMessage(message)
    if (!isExtensionMessage(message)) return undefined
    return handleMessage(message, sender.url)
  })
})

async function loadProbeState(): Promise<WordProbeState | null> {
  if (probeLoaded) return probeState
  try {
    const record = await browser.storage.local.get(WORD_PROBE_STORAGE_KEY)
    probeState = (record[WORD_PROBE_STORAGE_KEY] as WordProbeState | undefined) ?? null
  } catch {
    probeState = null
  }
  probeLoaded = true
  return probeState
}

async function refreshProbeState(): Promise<WordProbeState> {
  const state = await probeWordSources()
  probeState = state
  probeLoaded = true
  try {
    await browser.storage.local.set({ [WORD_PROBE_STORAGE_KEY]: state })
  } catch {
    // 探测结果落库失败不影响使用
  }
  return state
}

async function handleWordSourcesMessage(message: { type: 'wordSources.state' | 'wordSources.probe'; requestId: RequestId }): Promise<WordSourcesResponse> {
  if (message.type === 'wordSources.state') {
    return { type: 'wordSources.state', requestId: message.requestId, state: await loadProbeState() ?? { checkedAt: 0, results: {} } }
  }
  const state = await refreshProbeState()
  return { type: 'wordSources.probe', requestId: message.requestId, state }
}

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
      const outcome = await translateWithScheme(message.scheme, SCHEME_TEST_PHRASE, settings.targetLanguage, controller.signal)
      return outcomeToResponse(outcome, message.requestId)
    }

    const outcome = await runTranslation(message.text, settings, controller.signal, { probe: await loadProbeState() })
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
