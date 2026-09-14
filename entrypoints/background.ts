import { browser } from 'wxt/browser'
import {
  isExtensionMessage,
  isPublicSettingsRequest,
  isWordSourcesMessage,
  toDisplayError,
  type PublicSettingsResponse,
  type PublicSettingsUpdate,
  type WordSourcesResponse,
} from '../src/core/messages'
import { isSiteBlocked, type TranslationSettings } from '../src/core/settings'
import { runTranslation, SCHEME_TEST_PHRASE, translateWithScheme } from '../src/core/translate'
import { probeWordSources, WORD_PROBE_STORAGE_KEY, type WordProbeState } from '../src/core/word-sources'
import { createBrowserSettingsStorage, toContentSettings } from '../src/extension/storage'
import { createUsageStorage } from '../src/extension/usage-storage'
import type { ExtensionMessage, ExtensionResponse } from '../src/core/messages'
import type { RequestId } from '../src/core/messages'
import type { TranslateOutcome } from '../src/core/translate'

const storage = createBrowserSettingsStorage()
const usage = createUsageStorage()
const controllers = new Map<RequestId, AbortController>()

interface InflightGroup {
  textKey: string
  controller: AbortController
  participants: Set<RequestId>
  promise: Promise<ExtensionResponse>
}

const inflightGroups = new Map<RequestId, InflightGroup>()

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
    void broadcastSettingsUpdate(settings)
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

export async function broadcastSettingsUpdate(settings: TranslationSettings): Promise<void> {
  // runtime.sendMessage 只能送达扩展页面，内容脚本必须经 tabs.sendMessage 逐标签页投递
  const message: PublicSettingsUpdate = { type: 'settings.public.update', settings: toContentSettings(settings) }
  const tabs = await browser.tabs.query({})
  await Promise.all(tabs.map((tab) => {
    if (tab.id === undefined) return undefined
    return browser.tabs.sendMessage(tab.id, message).catch(() => undefined)
  }))
}

export async function handleMessage(message: ExtensionMessage, senderUrl?: string): Promise<ExtensionResponse> {
  if (message.type === 'translation.cancel') {
    controllers.get(message.requestId)?.abort()
    controllers.delete(message.requestId)
    const group = inflightGroups.get(message.requestId)
    if (group) {
      inflightGroups.delete(message.requestId)
      group.participants.delete(message.requestId)
      if (group.participants.size === 0) group.controller.abort()
    }
    return { ok: false, requestId: message.requestId, error: toDisplayError(new DOMException('Cancelled', 'AbortError')) }
  }

  if (message.type === 'settings.testScheme') {
    const controller = new AbortController()
    controllers.set(message.requestId, controller)
    try {
      const settings = await storage.load()
      if (!settings.enabled || (senderUrl && isSiteBlocked(senderUrl, settings.siteBlacklist))) {
        return blockedResponse(settings, message.requestId)
      }
      const outcome = await translateWithScheme(message.scheme, SCHEME_TEST_PHRASE, settings.targetLanguage, controller.signal)
      return outcomeToResponse(outcome, message.requestId)
    } catch (error) {
      return { ok: false, requestId: message.requestId, error: toDisplayError(error) }
    } finally {
      controllers.delete(message.requestId)
    }
  }

  // ponytail: 并发同文本请求合并为一组共享一次上游调用；启用/黑名单检查仅组长执行，组长 senderUrl 代表整组
  const textKey = message.text.trim().toLowerCase()
  let group = findInflightGroup(textKey)
  if (!group) {
    const controller = new AbortController()
    const leader = message
    group = {
      textKey,
      controller,
      participants: new Set(),
      promise: (async () => {
        try {
          const settings = await storage.load()
          if (!settings.enabled || (senderUrl && isSiteBlocked(senderUrl, settings.siteBlacklist))) {
            return blockedResponse(settings, leader.requestId)
          }
          const outcome = await runTranslation(leader.text, settings, controller.signal, { probe: await loadProbeState() }, {
            onSentence: (schemeId, chars) => void usage.recordSentence(schemeId, chars),
            onWord: (chars) => void usage.recordWord(chars),
          })
          return outcomeToResponse(outcome, leader.requestId)
        } catch (error) {
          return { ok: false, requestId: leader.requestId, error: toDisplayError(error) }
        }
      })(),
    }
  }
  group.participants.add(message.requestId)
  inflightGroups.set(message.requestId, group)
  try {
    const response = await group.promise
    return { ...response, requestId: message.requestId }
  } finally {
    inflightGroups.delete(message.requestId)
  }
}

function findInflightGroup(textKey: string): InflightGroup | undefined {
  for (const group of inflightGroups.values()) {
    if (group.textKey === textKey) return group
  }
  return undefined
}

function blockedResponse(settings: TranslationSettings, requestId: RequestId): ExtensionResponse {
  return {
    ok: false,
    requestId,
    error: {
      message: !settings.enabled ? 'AiFanyi 已停用' : 'AiFanyi 已在当前站点停用',
      retryable: false,
    },
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
