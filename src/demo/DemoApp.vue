<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import SchemesSection from '../components/SchemesSection.vue'
import SettingsForm from '../components/SettingsForm.vue'
import { toDisplayError, type ExtensionResponse } from '../core/messages'
import { cloneDefaultSettings, wordLookupDelay, type TranslationSettings } from '../core/settings'
import { classifySelection, getCaretFromPoint, getWordAtOffset, hasActiveSelection, isIgnorableElement, isSelectionIgnorableElement } from '../core/text'
import { runTranslation, SCHEME_TEST_PHRASE, translateWithScheme } from '../core/translate'
import type { SchemeSettings } from '../core/types'
import { LruCache } from '../core/lru'
import { getBubblePlacement, getBubbleSizing } from '../core/bubble'
import { boundsFromRange, createBubbleRenderer } from '../extension/renderer'
import { createHighlight, hideHighlight, showHighlight } from '../extension/highlight'
import { speakWord } from '../extension/speech'

const props = withDefaults(defineProps<{
  settings?: TranslationSettings
  showSettings?: boolean
  request?: (text: string, requestId: number) => Promise<ExtensionResponse>
}>(), {
  showSettings: true,
})

// 与 content script 相同的常量与状态机：悬停延迟查词、离开 180ms 关泡、选区优先于悬停。
const CLOSE_DELAY = 180
const SELECTION_DELAY = 90

const localSettings = ref<TranslationSettings>(cloneDefaultSettings())
const settings = computed({
  get: () => props.settings ?? localSettings.value,
  set: (value: TranslationSettings) => {
    if (!props.settings) localSettings.value = value
  },
})
const status = shallowRef('演示设置仅保存在内存')
const cache = new LruCache<string, ExtensionResponse>(80)
let renderer: ReturnType<typeof createBubbleRenderer> | null = null
let highlight: HTMLElement | null = null
let currentRange: Range | null = null
let currentText = ''
let currentKind: 'dictionary' | 'ai' | null = null
let currentInteraction: 'hover' | 'selection' | null = null
let hoveredTarget: { node: Text; start: number; end: number } | null = null
let requestId = 0
let activeRequest = 0
let hoverTimer = 0
let closeTimer = 0
let submitTimer = 0
let selectionTimer = 0
let pointerDown = false
let wordHovered = false
let bubbleHovered = false
let inflightKey = ''
let inflightController: AbortController | null = null

const handleMouseMove = (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target : null
  if (!settings.value.enabled || !settings.value.hoverEnabled || pointerDown || hasActiveSelection()) {
    leaveHoverWord()
    return
  }
  if (renderer?.root.contains(event.target as Node) || isIgnorableElement(target) || !target?.closest('#reading-area')) {
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
  showHighlight(highlight!, rect)
  window.clearTimeout(hoverTimer)
  hoverTimer = window.setTimeout(() => {
    if (!wordHovered || hoveredTarget?.node !== caret.node) return
    currentInteraction = 'hover'
    currentKind = 'dictionary'
    currentRange = range
    currentText = word.word
    void requestTranslation('dictionary', word.word, range)
  }, wordLookupDelay(settings.value.hoverDelayMs))
}

const handlePointerDown = () => {
  pointerDown = true
}
const handlePointerUp = () => {
  pointerDown = false
  window.clearTimeout(selectionTimer)
  selectionTimer = window.setTimeout(handleSelection, SELECTION_DELAY)
}
// 与扩展端一致：selectionchange 抖动收敛为 90ms 防抖，拖选期间不触发
const handleSelectionChange = () => {
  window.clearTimeout(selectionTimer)
  selectionTimer = window.setTimeout(() => {
    if (!pointerDown) handleSelection()
  }, SELECTION_DELAY)
}
// 与扩展端一致：悬停产生的气泡随滚动关闭，划词气泡跟随重定位
const handleScroll = () => {
  if (currentInteraction === 'hover') close()
  else if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
}
const handleResize = () => {
  if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
}
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    window.getSelection()?.removeAllRanges()
    close()
  }
}

onMounted(() => {
  renderer = createBubbleRenderer(settings.value.bubble)
  highlight = createHighlight()
  renderer.root.addEventListener('mouseenter', () => {
    bubbleHovered = true
    window.clearTimeout(closeTimer)
  })
  renderer.root.addEventListener('mouseleave', () => {
    bubbleHovered = false
    scheduleClose()
  })
  document.addEventListener('mousedown', handlePointerDown, true)
  document.addEventListener('mouseup', handlePointerUp, true)
  document.addEventListener('selectionchange', handleSelectionChange)
  document.addEventListener('mousemove', handleMouseMove, true)
  document.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.clearTimeout(hoverTimer)
  window.clearTimeout(closeTimer)
  window.clearTimeout(submitTimer)
  window.clearTimeout(selectionTimer)
  document.removeEventListener('mousedown', handlePointerDown, true)
  document.removeEventListener('mouseup', handlePointerUp, true)
  document.removeEventListener('selectionchange', handleSelectionChange)
  document.removeEventListener('mousemove', handleMouseMove, true)
  document.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
  close()
  highlight?.remove()
  highlight = null
  renderer?.destroy()
})

watch(settings, (value) => {
  renderer?.applySettings(value.bubble)
  if (!value.enabled) close()
  else if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
  status.value = '演示设置已更新'
}, { deep: true })

function reset() {
  settings.value = cloneDefaultSettings()
}

async function testScheme(scheme: SchemeSettings) {
  status.value = '正在测试方案…'
  try {
    await translateWithScheme(scheme, SCHEME_TEST_PHRASE, settings.value.targetLanguage)
    status.value = '方案连接可用'
    return '方案连接可用'
  } catch (error) {
    const message = toDisplayError(error).message
    status.value = message
    throw new Error(message)
  }
}

function handleSelection() {
  if (!settings.value.enabled || !settings.value.selectionEnabled) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    if (currentInteraction === 'selection') close()
    return
  }
  const range = selection.getRangeAt(0).cloneRange()
  const target = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
  // 显式划词比悬停宽松：pre/code 也允许翻译（悬停仍忽略代码区）
  if (!target?.closest('#reading-area') || isSelectionIgnorableElement(target)) return
  const action = classifySelection(selection.toString())
  if (action.type === 'empty') return
  window.clearTimeout(hoverTimer)
  window.clearTimeout(submitTimer)
  hideHighlight(highlight!)
  currentInteraction = 'selection'
  currentKind = action.type
  currentRange = range
  currentText = action.text
  // 与扩展端一致：划词查单词遵守悬停延迟设置且最低 300ms；句子翻译即时。
  if (action.type === 'dictionary') {
    submitTimer = window.setTimeout(() => void requestTranslation('dictionary', action.text, range), wordLookupDelay(settings.value.hoverDelayMs))
  } else {
    void requestTranslation(action.type, action.text, range)
  }
}

async function requestTranslation(kind: 'dictionary' | 'ai', text: string, range: Range) {
  if (!renderer) return
  const cacheKey = `${kind}:${text.toLowerCase()}`
  // ponytail: 同文本同类型请求在途时直接复用，不重复发起
  if (inflightKey === cacheKey) {
    positionBubble(range)
    return
  }
  const id = ++requestId
  activeRequest = id
  inflightKey = ''
  inflightController?.abort()
  inflightController = null
  const cached = cache.get(cacheKey)
  if (cached) {
    renderResponse(cached, text, range)
    return
  }
  const controller = new AbortController()
  inflightKey = cacheKey
  inflightController = controller
  renderer.showLoading(kind === 'dictionary' ? '正在查询释义...' : '正在翻译...', text)
  positionBubble(range)
  try {
    const response = props.request
      ? await props.request(text, id)
      : await translationResponse(id, text, controller.signal)
    if (id !== activeRequest || text !== currentText) return
    cache.set(cacheKey, response)
    renderResponse(response, text, range)
  } finally {
    if (inflightKey === cacheKey) {
      inflightKey = ''
      inflightController = null
    }
  }
}

async function translationResponse(id: number, text: string, signal?: AbortSignal): Promise<ExtensionResponse> {
  try {
    const outcome = await runTranslation(text, settings.value, signal)
    return outcome.kind === 'dictionary'
      ? { ok: true, requestId: id, kind: 'dictionary', result: outcome.result }
      : { ok: true, requestId: id, kind: 'text', result: outcome.text }
  } catch (error) {
    return { ok: false, requestId: id, error: toDisplayError(error) }
  }
}

function renderResponse(response: ExtensionResponse, sourceText: string, range: Range) {
  if (!renderer) return
  if (response.ok && response.kind === 'dictionary') {
    const wordResult = response.result
    const speakable = settings.value.word.enabled && settings.value.word.speakEnabled
    renderer.showDictionary(sourceText, wordResult, speakable
      ? { onSpeak: () => speakWord(sourceText, settings.value.word.accent) }
      : undefined)
  }
  else if (response.ok && response.kind === 'text') renderer.showText(response.result, sourceText)
  else if (!response.ok) {
    // 闭包内 TS 无法收窄 currentKind，先落局部变量
    const kind = currentKind
    renderer.showError(response.error.message, response.error.retryable && kind ? () => void requestTranslation(kind, sourceText, range) : undefined)
  }
  positionBubble(range)
}

function positionBubble(range: Range) {
  if (!renderer) return
  const bounds = boundsFromRange(range)
  if (!bounds) return
  const sizing = getBubbleSizing(bounds.right - bounds.left, window.innerWidth, settings.value.bubble.side)
  renderer.prepareForMeasure(sizing.minWidth, sizing.maxWidth)
  const rect = renderer.root.getBoundingClientRect()
  const placement = getBubblePlacement(bounds, rect.width, rect.height, window.innerWidth, window.innerHeight, settings.value.bubble)
  renderer.applyPlacement(placement)
}

function leaveHoverWord() {
  wordHovered = false
  hoveredTarget = null
  window.clearTimeout(hoverTimer)
  hideHighlight(highlight!)
  if (currentInteraction === 'hover') scheduleClose()
}

function scheduleClose() {
  if (currentInteraction !== 'hover') return
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => {
    if (!wordHovered && !bubbleHovered) close()
  }, CLOSE_DELAY)
}

function close() {
  window.clearTimeout(hoverTimer)
  window.clearTimeout(submitTimer)
  window.clearTimeout(closeTimer)
  currentRange = null
  currentText = ''
  currentKind = null
  currentInteraction = null
  hoveredTarget = null
  wordHovered = false
  activeRequest += 1
  inflightKey = ''
  inflightController?.abort()
  inflightController = null
  renderer?.hide()
  hideHighlight(highlight!)
}
</script>

<template>
  <div :class="showSettings ? 'app-shell' : 'demo-surface'">
    <main id="reading-area" class="demo-pane">
      <h1>翻译交互演示</h1>
      <p class="tip">悬停或选中单词查词典；选中多个词、句子或段落时按翻译方案顺序翻译。划词对代码区同样生效，悬停不会在代码区弹泡。</p>
      <div class="reading-copy">
        <p>Someone you loved can sometimes become someone you remember forever. Beautiful memories often remain even after people disappear from our lives.</p>
        <p>Learning another language can help you understand different cultures and communicate with people around the world.</p>
        <p>Technology is changing the way people work, communicate and learn new things every day.</p>
        <p>同一页面里的英文单词也能查询，例如 API、cache 和 context。</p>
        <pre><code>const message = "代码区不触发悬停，但划词可显式翻译";</code></pre>
      </div>
    </main>
    <aside v-if="showSettings" class="settings-panel" aria-label="演示设置">
      <SettingsForm v-model="settings" :status="status" @reset="reset" />
      <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" :test-scheme="testScheme" demo-mode />
    </aside>
  </div>
</template>
