<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_PRESETS } from '../core/settings'
import type { BubbleColorPreset, TranslationSettings } from '../core/types'
import BubblePreview from './BubblePreview.vue'
import ColorField from './ColorField.vue'

const settings = defineModel<TranslationSettings>({ required: true })

defineProps<{
  status: string
}>()

const emit = defineEmits<{
  reset: []
}>()

const blacklistText = computed({
  get: () => settings.value.siteBlacklist.join('\n'),
  set: (value: string) => {
    settings.value.siteBlacklist = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  },
})

/** 滑杆轨道进度填充（纯视觉）：当前值占量程的百分比。 */
function fillPct(value: number, min: number, max: number): string {
  const pct = ((value - min) / (max - min)) * 100
  return `${Math.min(100, Math.max(0, pct))}%`
}

/** 悬停延迟文案：满 1 秒改用「s」单位，避免出现 4 位毫秒数撑宽文案。 */
const hoverDelayText = computed(() => {
  const ms = settings.value.hoverDelayMs
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))}s`
  return `${ms}ms`
})

function setColorPreset(value: BubbleColorPreset): void {
  settings.value.bubble.colorPreset = value
  if (value !== 'custom') Object.assign(settings.value.bubble, COLOR_PRESETS[value])
}

function markCustomColor(): void {
  settings.value.bubble.colorPreset = 'custom'
}

function setBubbleColor(key: 'background' | 'textColor' | 'borderColor', value: string): void {
  settings.value.bubble[key] = value
  markCustomColor()
}

</script>

<template>
  <form class="settings-form" @submit.prevent>
    <header class="settings-header">
      <div>
        <h1 class="settings-title">设置</h1>
        <p class="settings-status">{{ status }}</p>
      </div>
      <button class="button button-secondary" type="button" @click="emit('reset')">恢复默认</button>
    </header>

    <section class="settings-section preview-section">
      <BubblePreview :settings="settings.bubble" />
    </section>

    <section class="settings-section">
      <h2 class="section-title">位置</h2>
      <div class="control-stack">
        <div class="control-grid two">
          <label class="field">
            <span class="field-label">方向</span>
            <select v-model="settings.bubble.side" data-testid="bubble-side">
              <option value="top">上</option>
              <option value="bottom">下</option>
              <option value="left">左</option>
              <option value="right">右</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">对齐</span>
            <select v-model="settings.bubble.align">
              <option value="start">起始</option>
              <option value="center">居中</option>
              <option value="end">末端</option>
            </select>
          </label>
        </div>
        <label class="range-field">
          <span class="range-label">间距 <output>{{ settings.bubble.gap }} px</output></span>
          <input v-model.number="settings.bubble.gap" type="range" min="0" max="24" step="1" :style="{ '--fill': fillPct(settings.bubble.gap, 0, 24) }" />
        </label>
        <label class="range-field">
          <span class="range-label">水平微调 <output>{{ settings.bubble.offsetX }} px</output></span>
          <input v-model.number="settings.bubble.offsetX" type="range" min="-80" max="80" step="1" :style="{ '--fill': fillPct(settings.bubble.offsetX, -80, 80) }" />
        </label>
        <label class="range-field">
          <span class="range-label">垂直微调 <output>{{ settings.bubble.offsetY }} px</output></span>
          <input v-model.number="settings.bubble.offsetY" type="range" min="-80" max="80" step="1" :style="{ '--fill': fillPct(settings.bubble.offsetY, -80, 80) }" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">气泡</h2>
      <div class="control-stack">
        <div class="control-grid two">
          <label class="field">
            <span class="field-label">颜色预设</span>
            <select data-testid="color-preset" :value="settings.bubble.colorPreset" @change="setColorPreset(($event.target as HTMLSelectElement).value as BubbleColorPreset)">
              <option value="paper">柔白</option>
              <option value="warm">暖黄</option>
              <option value="mint">薄荷</option>
              <option value="sky">浅蓝</option>
              <option value="night">夜间</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">阴影</span>
            <select v-model="settings.bubble.shadow">
              <option value="none">无</option>
              <option value="soft">轻柔</option>
              <option value="medium">适中</option>
              <option value="strong">明显</option>
            </select>
          </label>
        </div>
        <div class="control-grid flex-between">
          <label class="field">
            <span class="field-label">背景</span>
            <ColorField :model-value="settings.bubble.background" @update:model-value="setBubbleColor('background', $event)" />
          </label>
          <label class="field">
            <span class="field-label">文字</span>
            <ColorField :model-value="settings.bubble.textColor" @update:model-value="setBubbleColor('textColor', $event)" />
          </label>
          <label class="field">
            <span class="field-label">边框</span>
            <ColorField :model-value="settings.bubble.borderColor" @update:model-value="setBubbleColor('borderColor', $event)" />
          </label>
          <label class="field">
            <span class="field-label">单词高亮</span>
            <ColorField v-model="settings.bubble.highlightColor" />
          </label>
        </div>
        <div class="control-grid two">
          <label class="range-field">
            <span class="range-label">边框宽度 <output>{{ settings.bubble.borderWidth }} px</output></span>
            <input v-model.number="settings.bubble.borderWidth" type="range" min="0" max="3" step="1" :style="{ '--fill': fillPct(settings.bubble.borderWidth, 0, 3) }" />
          </label>
          <label class="range-field">
            <span class="range-label">圆角 <output>{{ settings.bubble.radius }} px</output></span>
            <input v-model.number="settings.bubble.radius" type="range" min="0" max="20" step="1" :style="{ '--fill': fillPct(settings.bubble.radius, 0, 20) }" />
          </label>
          <label class="range-field">
            <span class="range-label">内边距 <output>{{ settings.bubble.padding }} px</output></span>
            <input v-model.number="settings.bubble.padding" type="range" min="4" max="20" step="1" :style="{ '--fill': fillPct(settings.bubble.padding, 4, 20) }" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section text-wide">
      <h2 class="section-title">文字</h2>
      <div class="control-stack">
        <div class="control-grid three">
          <label class="field">
            <span class="field-label">字体</span>
            <select v-model="settings.bubble.fontFamily">
              <option value="system">系统</option>
              <option value="serif">衬线</option>
              <option value="mono">等宽</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">字重</span>
            <select v-model="settings.bubble.fontWeight">
              <option value="400">常规</option>
              <option value="500">中等</option>
              <option value="600">加粗</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">文字对齐</span>
            <select v-model="settings.bubble.textAlign">
              <option value="left">左</option>
              <option value="center">中</option>
              <option value="right">右</option>
            </select>
          </label>
        </div>
        <div class="control-grid three">
          <label class="range-field">
            <span class="range-label">字号 <output>{{ settings.bubble.fontSize }} px</output></span>
            <input v-model.number="settings.bubble.fontSize" type="range" min="14" max="22" step="1" :style="{ '--fill': fillPct(settings.bubble.fontSize, 14, 22) }" />
          </label>
          <label class="range-field">
            <span class="range-label">行高 <output>{{ settings.bubble.lineHeight }}</output></span>
            <input v-model.number="settings.bubble.lineHeight" type="range" min="1.2" max="2" step="0.05" :style="{ '--fill': fillPct(settings.bubble.lineHeight, 1.2, 2) }" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section trigger-wide">
      <h2 class="section-title">触发</h2>
      <div class="hfields">
        <div class="check-rows">
          <label class="check-row"><input v-model="settings.enabled" type="checkbox" class="checkbox" /><span>全局启用</span></label>
          <label class="check-row"><input v-model="settings.hoverEnabled" type="checkbox" class="checkbox" /><span>悬停翻译</span></label>
          <label class="check-row"><input v-model="settings.selectionEnabled" type="checkbox" class="checkbox" /><span>选中翻译</span></label>
          <label class="check-row"><input v-model="settings.bubble.showOriginal" type="checkbox" class="checkbox" /><span>显示原文</span></label>
          <label class="check-row"><input v-model="settings.bubble.showArrow" type="checkbox" class="checkbox" /><span>显示箭头</span></label>
        </div>
        <div class="hfield">
          <span class="hlbl">鼠标悬停多久后触发翻译</span>
          <input
            v-model.number="settings.hoverDelayMs"
            type="range"
            min="0"
            max="5000"
            step="50"
            class="range-inline"
            :style="{ '--fill': fillPct(settings.hoverDelayMs, 0, 5000) }"
          />
          <output class="delay-val">{{ hoverDelayText }}</output>
        </div>
        <div class="hfield grow">
          <span class="hlbl">站点黑名单<span class="hlbl-sub">每行一个域名</span></span>
          <textarea v-model="blacklistText" class="blacklist" placeholder="example.com&#10;*.internal.example" />
        </div>
      </div>
    </section>
  </form>
</template>

<style scoped>
.settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  min-width: 0;
}

.field :is(input, select, textarea) {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out, background 160ms ease-out;
}

.field :is(input, select) {
  min-height: 38px;
}

.field :is(input, select, textarea):hover {
  border-color: var(--af-control-border-hover);
}

.field :is(input, select, textarea):focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.field textarea {
  min-height: 78px;
  resize: vertical;
}

.button {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 14px;
  font-weight: 600;
  transition: background 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out;
  white-space: nowrap;
}

.button-secondary {
  border-color: var(--af-control-border);
  background: var(--af-control-background);
  color: var(--af-text);
}

.button-secondary:hover {
  border-color: var(--af-control-border-hover);
  background: var(--af-control-hover);
}

/* 复选框：appearance 自绘，选中 accent 底 + 白色对勾 */
.checkbox {
  appearance: none;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1px solid var(--af-control-border);
  border-radius: 4px;
  background-color: var(--af-control-background);
  cursor: pointer;
  transition: background-color 160ms ease-out, border-color 160ms ease-out, box-shadow 160ms ease-out;
}
.checkbox:hover {
  border-color: var(--af-control-border-hover);
}
.checkbox:checked {
  border-color: var(--af-accent);
  background-color: var(--af-accent);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-6.5' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size: 12px;
  background-position: center;
  background-repeat: no-repeat;
}
.checkbox:focus-visible {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

/* 触发通宽：横向流式字段 */
.trigger-wide {
  grid-column: 1 / -1;
}

/* 文字通宽 */
.text-wide {
  grid-column: 1 / -1;
}
.hfields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  align-items: center;
}
.hfield {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  cursor: pointer;
  user-select: none;
}
.hfield .hlbl {
  flex: none;
  font-size: 14px;
}
.hfield .hlbl-sub {
  display: block;
  font-size: 14px;
  color: var(--af-muted);
}
.hfield.grow {
  flex: 1 1 100%;
  cursor: default;
}
/* 复选组：与「单词翻译」源行同款芯片样式，空间足够时一排放下 5 个 */
.check-rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 4px 8px;
  flex: 1 1 100%;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 26px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  background-color: var(--af-page);
}
.check-row:hover {
  background: var(--af-control-hover);
}
.range-inline {
  width: 130px;
}
/* 数值槽位定宽 + 等宽数字：拖动时文案宽度不变，滑块不跳动 */
.hfield .delay-val {
  display: inline-block;
  min-width: 44px;
  font-variant-numeric: tabular-nums;
}
textarea.blacklist {
  flex: 1;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid var(--af-control-border);
  border-radius: 8px;
  background: var(--af-control-background);
  color: var(--af-text);
  font-size: 14px;
  resize: vertical;
}
textarea.blacklist:hover {
  border-color: var(--af-control-border-hover);
}
textarea.blacklist:focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.settings-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px 14px;
}

.settings-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
}

.settings-status {
  margin: 4px 0 0;
  color: var(--af-muted);
  font-size: 14px;
}

.settings-section {
  min-width: 0;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--af-line);
}

.preview-section {
  grid-column: 1 / -1;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 720;
}

.control-grid {
  display: grid;
  gap: 10px 12px;
}

.control-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.control-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.control-grid.flex-between {
  display: flex;
  justify-content: space-between;
}

.control-stack {
  display: grid;
  gap: 12px;
}

.field,
.range-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  align-content: start;
}

.field-label,
.range-label {
  color: var(--af-muted);
  font-size: 14px;
}

.range-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.range-label output {
  color: var(--af-text);
  font-variant-numeric: tabular-nums;
}

/* 滑杆：自定义轨道（进度填充） + 拇指；--fill 由 :style 响应式同步 */
input[type="range"] {
  width: 100%;
}
.range-field input[type="range"],
.range-inline {
  height: 4px;
  margin: 8px 0;
  border-radius: 999px;
  appearance: none;
  background: linear-gradient(to right,
    var(--af-accent) 0%, var(--af-accent) var(--fill, 50%),
    var(--af-control-border) var(--fill, 50%), var(--af-control-border) 100%);
  outline: none;
  cursor: pointer;
}
.range-field input[type="range"]::-webkit-slider-thumb,
.range-inline::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  appearance: none;
  background: var(--af-accent);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  cursor: pointer;
}

@media (max-width: 760px) {
  .settings-form,
  .control-grid.two,
  .control-grid.three {
    grid-template-columns: 1fr;
  }

  .control-grid.flex-between {
    display: grid;
    grid-template-columns: 1fr;
  }

  .preview-section,
  .trigger-wide,
  .text-wide {
    grid-column: auto;
  }
}
</style>
