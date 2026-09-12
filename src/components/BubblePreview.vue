<script setup lang="ts">
import { computed } from 'vue'
import { bubbleCssVariables, getBubblePlacement, getBubbleSizing } from '../core/bubble'
import type { BubbleVisualSettings } from '../core/settings'

const props = defineProps<{
  settings: BubbleVisualSettings
}>()

const sourcePosition = computed(() => {
  const side = props.settings.side
  return {
    left: side === 'right' ? '24%' : side === 'left' ? '76%' : '50%',
    top: side === 'bottom' ? '16%' : side === 'top' ? '84%' : '50%',
  }
})

const placement = computed(() => {
  const stageWidth = 496
  const stageHeight = 172
  const source = {
    left: sourcePosition.value.left === '24%' ? 115 : sourcePosition.value.left === '76%' ? 365 : 236,
    right: sourcePosition.value.left === '24%' ? 157 : sourcePosition.value.left === '76%' ? 407 : 278,
    top: sourcePosition.value.top === '16%' ? 22 : sourcePosition.value.top === '84%' ? 135 : 78,
    bottom: sourcePosition.value.top === '16%' ? 46 : sourcePosition.value.top === '84%' ? 159 : 102,
  }
  const sizing = getBubbleSizing(source.right - source.left, stageWidth, props.settings.side)
  const width = Math.min(210, sizing.maxWidth)
  return getBubblePlacement(source, width, 74, stageWidth, stageHeight, props.settings)
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
</script>

<template>
  <div class="preview-stage">
    <span class="preview-source" :style="sourcePosition">loved</span>
    <div class="preview-bubble" :data-side="placement.side" :data-arrow="String(settings.showArrow)" :style="bubbleStyle">
      <div class="preview-content">
        <div v-if="settings.showOriginal" class="preview-word">
          loved<span class="preview-pronunciation">/lʌvd/</span>
        </div>
        <div><span class="preview-pos">v.</span>爱；喜欢</div>
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
  font-size: calc(var(--af-bubble-font-size) + 1px);
  font-weight: 650;
}

.preview-pronunciation,
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
