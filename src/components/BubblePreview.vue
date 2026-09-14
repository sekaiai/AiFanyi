<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { bubbleCssVariables, getBubblePlacement, getBubbleSizing } from '../core/bubble'
import type { BubbleSettings, WordQuerySettings } from '../core/types'

const props = defineProps<{
  settings: BubbleSettings
  /** 预览的是单词卡片：原词行与朗读按钮跟随 word.showOriginal（与句子开关独立）。 */
  word: WordQuerySettings
}>()

const stageRef = useTemplateRef<HTMLElement>('stage')
const sourceRef = useTemplateRef<HTMLElement>('source')
const bubbleRef = useTemplateRef<HTMLElement>('bubble')
const measurements = shallowRef({
  stageWidth: 496,
  stageHeight: 172,
  source: { left: 236, right: 278, top: 135, bottom: 159 },
  bubbleWidth: 210,
  bubbleHeight: 74,
})
let observer: ResizeObserver | undefined

const sourcePosition = computed(() => {
  const side = props.settings.side
  return {
    left: side === 'right' ? '24%' : side === 'left' ? '76%' : '50%',
    top: side === 'bottom' ? '16%' : side === 'top' ? '84%' : '50%',
  }
})

const placement = computed(() => {
  const current = measurements.value
  const sizing = getBubbleSizing(current.source.right - current.source.left, current.stageWidth, props.settings.side)
  const width = Math.min(current.bubbleWidth, sizing.maxWidth)
  return getBubblePlacement(
    current.source,
    width,
    current.bubbleHeight,
    current.stageWidth,
    current.stageHeight,
    props.settings,
  )
})

const bubbleStyle = computed(() => ({
  ...bubbleCssVariables(props.settings),
  left: `${placement.value.left}px`,
  top: `${placement.value.top}px`,
  minWidth: `${Math.min(160, placement.value.width)}px`,
  maxWidth: 'calc(100% - 16px)',
  '--af-arrow-x': `${placement.value.arrowX}px`,
  '--af-arrow-y': `${placement.value.arrowY}px`,
}))

function measure(): void {
  const stage = stageRef.value
  const source = sourceRef.value
  const bubble = bubbleRef.value
  if (!stage || !source || !bubble) return
  const stageRect = stage.getBoundingClientRect()
  const sourceRect = source.getBoundingClientRect()
  measurements.value = {
    stageWidth: stage.clientWidth,
    stageHeight: stage.clientHeight,
    source: {
      left: sourceRect.left - stageRect.left,
      right: sourceRect.right - stageRect.left,
      top: sourceRect.top - stageRect.top,
      bottom: sourceRect.bottom - stageRect.top,
    },
    bubbleWidth: bubble.offsetWidth,
    bubbleHeight: bubble.offsetHeight,
  }
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (stageRef.value) observer.observe(stageRef.value)
  if (sourceRef.value) observer.observe(sourceRef.value)
  if (bubbleRef.value) observer.observe(bubbleRef.value)
  measure()
})

onUnmounted(() => observer?.disconnect())

watch([() => props.settings, () => props.word], async () => {
  await nextTick()
  measure()
}, { deep: true, flush: 'post' })
</script>

<template>
  <div ref="stage" class="preview-stage">
    <span ref="source" class="preview-source" :style="sourcePosition">loved</span>
    <div ref="bubble" class="preview-bubble" data-testid="bubble-preview" :data-side="placement.side" :data-arrow="String(settings.showArrow)" :style="bubbleStyle">
      <div class="preview-content">
        <div v-if="word.showOriginal" class="preview-word">
          loved<span class="preview-pronunciation">/lʌvd/</span>
        </div>
        <div class="preview-result"><span class="preview-pos">v.</span>爱；喜欢</div>
        <!-- 与真实气泡的朗读按钮一致：仅单词「显示原文」开启时渲染 -->
        <span v-if="word.showOriginal" class="preview-speak" aria-hidden="true">▶</span>
      </div>
      <span class="preview-arrow" aria-hidden="true"></span>
    </div>
  </div>
</template>

<style scoped>
.preview-stage {
  position: relative;
  height: 172px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--af-line);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(45, 108, 223, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(45, 108, 223, 0.08) 1px, transparent 1px),
    #f4f6f2;
  background-size: 22px 22px;
}

.preview-source {
  position: absolute;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(45, 108, 223, 0.2);
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.preview-bubble {
  position: absolute;
  z-index: 2;
  width: max-content;
  overflow: visible;
  border: var(--af-bubble-border-width) solid var(--af-bubble-border);
  border-radius: var(--af-bubble-radius);
  background: var(--af-bubble-background);
  color: var(--af-bubble-text);
  box-shadow: var(--af-bubble-shadow);
  font-family: var(--af-bubble-font-family);
  font-size: var(--af-bubble-font-size);
  font-weight: var(--af-bubble-font-weight);
  line-height: var(--af-bubble-line-height);
  text-align: var(--af-bubble-text-align);
  overflow-wrap: anywhere;
}

.preview-content {
  position: relative;
  z-index: 1;
  padding: var(--af-bubble-padding);
  border-radius: inherit;
  background: inherit;
}

.preview-word {
  margin-bottom: 3px;
  padding-right: 22px;
  font-size: calc(var(--af-bubble-font-size) + 1px);
  font-weight: 650;
}

/* 与真实气泡的 .speak 保持一致的装饰性朗读按钮 */
.preview-speak {
  position: absolute;
  top: calc(var(--af-bubble-padding) + 2px);
  right: calc(var(--af-bubble-padding) - 2px);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--af-bubble-border);
  border-radius: 4px;
  font-size: 10px;
  line-height: 1;
  opacity: 0.7;
}

.preview-pronunciation,
.preview-result {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-pos {
  font-size: max(11px, calc(var(--af-bubble-font-size) - 2px));
  font-weight: 400;
  opacity: 0.65;
}

.preview-pronunciation {
  margin-left: 6px;
}

.preview-pos {
  margin-right: 5px;
}

.preview-arrow {
  position: absolute;
  z-index: 0;
  display: none;
  width: 10px;
  height: 10px;
  background: var(--af-bubble-background);
}

.preview-bubble[data-arrow="true"] .preview-arrow {
  display: block;
}

.preview-bubble[data-side="top"] .preview-arrow,
.preview-bubble[data-side="bottom"] .preview-arrow {
  left: var(--af-arrow-x);
}

.preview-bubble[data-side="left"] .preview-arrow,
.preview-bubble[data-side="right"] .preview-arrow {
  top: var(--af-arrow-y);
}

.preview-bubble[data-side="top"] .preview-arrow {
  bottom: -5px;
  border-right: inherit;
  border-bottom: inherit;
  transform: translateX(-50%) rotate(45deg);
}

.preview-bubble[data-side="bottom"] .preview-arrow {
  top: -5px;
  border-top: inherit;
  border-left: inherit;
  transform: translateX(-50%) rotate(45deg);
}

.preview-bubble[data-side="left"] .preview-arrow {
  right: -5px;
  border-top: inherit;
  border-right: inherit;
  transform: translateY(-50%) rotate(45deg);
}

.preview-bubble[data-side="right"] .preview-arrow {
  left: -5px;
  border-bottom: inherit;
  border-left: inherit;
  transform: translateY(-50%) rotate(45deg);
}
</style>
