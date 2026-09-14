import { getBubblePlacement, getBubbleSizing } from '../core/bubble'
import { isTargetLanguageText } from '../core/lang'
import type { ExtensionResponse } from '../core/messages'
import { wordLookupDelay } from '../core/settings'
import type { TranslationSettings } from '../core/types'
import { classifySelection, getCaretFromPoint, getWordAtOffset, hasActiveSelection, isIgnorableElement, isSelectionIgnorableElement } from '../core/text'
import { hideHighlight, showHighlight } from './highlight'
import { boundsFromRange, selectionContainerWidth, type BubbleRenderer } from './renderer'
import { speakWord } from './speech'

/**
 * 悬停 / 划词交互状态机的宿主差异点。
 * 扩展端 content script 与演示页共用同一套状态机（定时器、防抖、缓存与渲染策略），
 * 只注入差异，避免两份手抄实现随时间漂移。
 */
interface InteractionHost {
  getSettings(): TranslationSettings
  renderer: BubbleRenderer
  highlight: HTMLElement
  /** 全局是否生效（扩展端包含站点黑名单检查；演示页只看总开关）。 */
  isActive(settings: TranslationSettings): boolean
  /** 悬停目标是否位于允许悬停的页面区域（演示页限定 #reading-area；扩展端全页面）。 */
  acceptHoverTarget(target: Element | null): boolean
  /** 划词目标是否位于允许划词的页面区域。 */
  acceptSelectTarget(target: Element | null): boolean
  /** 发起翻译请求；返回后由交互控制器做陈旧检查并渲染。 */
  send(text: string, requestId: number, signal: AbortSignal): Promise<ExtensionResponse>
  /** 在途请求被替换或气泡关闭时通知宿主取消（扩展端发 translation.cancel 消息）。 */
  cancel(requestId: number): void
}

const CLOSE_DELAY = 180
const SELECTION_DELAY = 90
const CACHE_LIMIT = 80

export function createInteraction(host: InteractionHost) {
  const cache = new Map<string, ExtensionResponse>()
  const bindings: Array<{ target: EventTarget; type: string; listener: EventListener; options?: AddEventListenerOptions | undefined }> = []
  let currentRange: Range | null = null
  let currentText = ''
  let currentKind: 'dictionary' | 'ai' | null = null
  let currentInteraction: 'hover' | 'selection' | null = null
  let hoveredTarget: { node: Text; start: number; end: number } | null = null
  let requestCounter = 0
  let activeRequest = 0
  let pending: { requestId: number; controller: AbortController } | null = null
  let inflightKey = ''
  let hoverTimer = 0
  let closeTimer = 0
  let submitTimer = 0
  let selectionTimer = 0
  let pointerDown = false
  let wordHovered = false
  let bubbleHovered = false
  let pointerDownInBubble = false

  /** document 级监听下 shadow 内事件被重定向为宿主元素，contains/closest 均不跨 shadow 边界。 */
  function isInsideBubble(target: EventTarget | null): boolean {
    return target instanceof Element && (host.renderer.container.contains(target) || host.renderer.root.contains(target))
  }

  function start(): void {
    listen(document, 'mousemove', (event) => onMouseMove(event as MouseEvent), { capture: true })
    listen(document, 'mousedown', (event) => {
      pointerDown = true
      pointerDownInBubble = isInsideBubble(event.target)
    }, { capture: true })
    listen(document, 'mouseup', () => {
      pointerDown = false
      window.clearTimeout(selectionTimer)
      selectionTimer = window.setTimeout(handleSelection, SELECTION_DELAY)
    }, { capture: true })
    // selectionchange 抖动收敛为 90ms 防抖，拖选期间不触发
    listen(document, 'selectionchange', () => {
      window.clearTimeout(selectionTimer)
      selectionTimer = window.setTimeout(() => {
        if (!pointerDown) handleSelection()
      }, SELECTION_DELAY)
    })
    // 悬停产生的气泡随滚动关闭，划词气泡跟随重定位
    listen(window, 'scroll', () => {
      if (currentInteraction === 'hover') close()
      else if (currentRange && host.renderer.isVisible()) position(currentRange)
    }, { capture: true })
    listen(window, 'resize', () => {
      if (currentRange && host.renderer.isVisible()) position(currentRange)
    })
    listen(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        window.getSelection()?.removeAllRanges()
        close()
      }
    }, { capture: true })
    listen(host.renderer.root, 'mouseenter', () => {
      bubbleHovered = true
      window.clearTimeout(closeTimer)
    })
    listen(host.renderer.root, 'mouseleave', () => {
      bubbleHovered = false
      scheduleClose()
    })
  }

  function destroy(): void {
    close()
    window.clearTimeout(selectionTimer)
    for (const binding of bindings) binding.target.removeEventListener(binding.type, binding.listener, binding.options)
    bindings.length = 0
  }

  /** 设置更新：应用气泡样式；全局停用时关闭气泡，否则按新设置重定位。 */
  function updateSettings(next: TranslationSettings): void {
    host.renderer.applySettings(next.bubble)
    if (!host.isActive(next)) close()
    else if (currentRange && host.renderer.isVisible()) position(currentRange)
  }

  function onMouseMove(event: MouseEvent): void {
    const settings = host.getSettings()
    const target = event.target instanceof Element ? event.target : null
    if (
      !host.isActive(settings)
      || !settings.hoverEnabled
      || pointerDown
      || hasActiveSelection()
      || isInsideBubble(target)
      || isIgnorableElement(target)
      || !host.acceptHoverTarget(target)
    ) {
      leaveHoverWord()
      return
    }
    const caret = getCaretFromPoint(event.clientX, event.clientY)
    if (!caret || !(caret.node instanceof Text) || isIgnorableElement(caret.node.parentElement)) {
      leaveHoverWord()
      return
    }
    const word = getWordAtOffset(caret.node.textContent ?? '', caret.offset)
    if (!word) {
      leaveHoverWord()
      return
    }
    // 同语言单词不触发查词与高亮（如英文目标悬停英文词）
    if (isTargetLanguageText(word.word, settings.targetLanguage)) {
      leaveHoverWord()
      return
    }
    const range = document.createRange()
    range.setStart(caret.node, word.start)
    range.setEnd(caret.node, word.end)
    const rect = range.getBoundingClientRect()
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      leaveHoverWord()
      return
    }
    wordHovered = true
    window.clearTimeout(closeTimer)
    if (hoveredTarget?.node === caret.node && hoveredTarget.start === word.start && hoveredTarget.end === word.end) return
    hoveredTarget = { node: caret.node, start: word.start, end: word.end }
    showHighlight(host.highlight, rect, settings.bubble.highlightColor)
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => {
      if (!wordHovered || hoveredTarget?.node !== caret.node) return
      currentInteraction = 'hover'
      currentKind = 'dictionary'
      currentRange = range
      currentText = word.word
      void submit('dictionary', word.word, range)
    }, wordLookupDelay(settings.hoverDelayMs))
  }

  function handleSelection(): void {
    const settings = host.getSettings()
    if (!host.isActive(settings) || !settings.selectionEnabled) return
    // 本次按下发生在气泡内：不关闭气泡，也不对气泡内容发起新翻译
    if (pointerDownInBubble) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (currentInteraction === 'selection') close()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const target = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    // 显式划词比悬停宽松：pre/code 也允许翻译（悬停仍忽略代码区）
    if (isSelectionIgnorableElement(target) || !host.acceptSelectTarget(target)) return
    const action = classifySelection(selection.toString())
    if (action.type === 'empty') return
    // 已是目标语言的文本不触发翻译（如中文目标选中中文句）
    if (isTargetLanguageText(action.text, settings.targetLanguage)) return
    window.clearTimeout(hoverTimer)
    window.clearTimeout(submitTimer)
    hideHighlight(host.highlight)
    currentInteraction = 'selection'
    currentKind = action.type
    currentRange = range
    currentText = action.text
    // 划词查单词与悬停选词同一套延迟约束：遵守悬停延迟设置且最低 300ms；
    // 句子 / 段落翻译保持即时（划词是主动操作）。
    if (action.type === 'dictionary') {
      submitTimer = window.setTimeout(() => void submit('dictionary', action.text, range), wordLookupDelay(settings.hoverDelayMs))
    } else {
      void submit(action.type, action.text, range)
    }
  }

  async function submit(kind: 'dictionary' | 'ai', text: string, range: Range): Promise<void> {
    const cacheKey = `${kind}:${text.toLowerCase()}`
    // 同文本同类型请求在途时直接复用，不重复发起
    if (inflightKey === cacheKey) {
      position(range)
      return
    }
    abortPending()
    const requestId = ++requestCounter
    activeRequest = requestId
    const cached = cache.get(cacheKey)
    if (cached) {
      renderResponse(cached, text, range)
      return
    }
    const controller = new AbortController()
    pending = { requestId, controller }
    inflightKey = cacheKey
    const settings = host.getSettings()
    // 加载态原词行跟随所属类型：单词看 word.showOriginal，句子看 bubble.showOriginal
    host.renderer.showLoading(
      kind === 'dictionary' ? '正在查询释义...' : '正在翻译...',
      text,
      kind === 'dictionary' ? settings.word.showOriginal : settings.bubble.showOriginal,
    )
    position(range)
    try {
      const response = await host.send(text, requestId, controller.signal)
      if (requestId !== activeRequest || text !== currentText) return
      // 只缓存成功响应：失败响应进缓存后重试会直接命中旧错误
      if (response.ok) {
        cache.set(cacheKey, response)
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
      }
      renderResponse(response, text, range)
    } finally {
      if (pending?.requestId === requestId) {
        pending = null
        inflightKey = ''
      }
    }
  }

  function renderResponse(response: ExtensionResponse, text: string, range: Range): void {
    const settings = host.getSettings()
    if (!response.ok) {
      const kind = currentKind
      host.renderer.showError(response.error.message, response.error.retryable && kind ? () => void submit(kind, text, range) : undefined)
    } else if (response.kind === 'dictionary') {
      const speakable = settings.word.speakEnabled
      host.renderer.showDictionary(text, response.result, {
        showOriginal: settings.word.showOriginal,
        ...(speakable ? { onSpeak: () => speakWord(text, settings.word.accent) } : {}),
      })
    } else if (response.kind === 'text') {
      host.renderer.showText(response.result, text)
    }
    position(range)
  }

  function position(range: Range): void {
    const settings = host.getSettings()
    const bounds = boundsFromRange(range)
    if (!bounds) return
    // 句子翻译以选区所在块级容器宽度为上限；单词翻译维持 290px 封顶
    const sentenceContainerWidth = currentKind === 'ai' ? selectionContainerWidth(range) : 0
    const sizing = getBubbleSizing(bounds.right - bounds.left, window.innerWidth, settings.bubble.side, { sentenceContainerWidth })
    host.renderer.prepareForMeasure(sizing.minWidth, sizing.maxWidth)
    const rect = host.renderer.root.getBoundingClientRect()
    const placement = getBubblePlacement(bounds, rect.width, rect.height, window.innerWidth, window.innerHeight, settings.bubble)
    host.renderer.applyPlacement(placement)
  }

  function leaveHoverWord(): void {
    wordHovered = false
    hoveredTarget = null
    window.clearTimeout(hoverTimer)
    hideHighlight(host.highlight)
    if (currentInteraction === 'hover') scheduleClose()
  }

  function scheduleClose(): void {
    if (currentInteraction !== 'hover') return
    window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      if (!wordHovered && !bubbleHovered) close()
    }, CLOSE_DELAY)
  }

  function close(): void {
    abortPending()
    window.clearTimeout(hoverTimer)
    window.clearTimeout(submitTimer)
    window.clearTimeout(closeTimer)
    currentRange = null
    currentText = ''
    currentKind = null
    currentInteraction = null
    hoveredTarget = null
    wordHovered = false
    host.renderer.hide()
    hideHighlight(host.highlight)
  }

  /** 作废在途请求：本地中止 + 通知宿主取消（如发 translation.cancel 消息）。 */
  function abortPending(): void {
    if (!pending) return
    activeRequest += 1
    inflightKey = ''
    pending.controller.abort()
    host.cancel(pending.requestId)
    pending = null
  }

  function listen(target: EventTarget, type: string, listener: (event: Event) => void, options?: AddEventListenerOptions | undefined): void {
    target.addEventListener(type, listener, options)
    bindings.push({ target, type, listener, options })
  }

  return { start, destroy, updateSettings }
}
