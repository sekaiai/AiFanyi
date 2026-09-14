<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_PRESETS } from '../core/settings'
import type { BubbleColorPreset, TranslationSettings, UiLocale } from '../core/types'
import BubblePreview from './BubblePreview.vue'
import ColorField from './ColorField.vue'
import { useUiLocale } from '../composables/useUiLocale'

const settings = defineModel<TranslationSettings>({ required: true })

const { t } = useUiLocale()

defineProps<{
  status: string
}>()

const emit = defineEmits<{
  reset: []
}>()

const UI_LOCALE_OPTIONS: { value: UiLocale; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

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
        <h1 class="settings-title">{{ t('form.title') }}</h1>
        <p class="settings-status">{{ status }}</p>
      </div>
      <div class="header-actions">
        <div class="locale-switch">
          <span class="field-label">{{ t('app.uiLanguage') }}</span>
          <div class="locale-options" role="radiogroup" :aria-label="t('app.uiLanguage')" data-testid="ui-locale">
            <label v-for="option in UI_LOCALE_OPTIONS" :key="option.value" class="locale-option">
              <input v-model="settings.uiLocale" type="radio" name="ui-locale" :value="option.value" />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
        <button style="height: 36px;" class="button button-secondary" type="button" @click="emit('reset')">{{ t('form.reset') }}</button>
      </div>
    </header>

    <section class="settings-section preview-section">
      <BubblePreview :settings="settings.bubble" :word="settings.word" />
    </section>

    <section class="settings-section">
      <h2 class="section-title">{{ t('form.position') }}</h2>
      <div class="control-stack">
        <div class="control-grid two">
          <label class="field">
            <span class="field-label">{{ t('form.direction') }}</span>
            <select v-model="settings.bubble.side" data-testid="bubble-side">
              <option value="top">{{ t('form.side.top') }}</option>
              <option value="bottom">{{ t('form.side.bottom') }}</option>
              <option value="left">{{ t('form.side.left') }}</option>
              <option value="right">{{ t('form.side.right') }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.alignLabel') }}</span>
            <select v-model="settings.bubble.align">
              <option value="start">{{ t('form.align.start') }}</option>
              <option value="center">{{ t('form.align.center') }}</option>
              <option value="end">{{ t('form.align.end') }}</option>
            </select>
          </label>
        </div>
        <label class="range-field">
          <span class="range-label">{{ t('form.gap') }} <output>{{ settings.bubble.gap }} px</output></span>
          <input v-model.number="settings.bubble.gap" type="range" min="0" max="24" step="1" :style="{ '--fill': fillPct(settings.bubble.gap, 0, 24) }" />
        </label>
        <label class="range-field">
          <span class="range-label">{{ t('form.offsetX') }} <output>{{ settings.bubble.offsetX }} px</output></span>
          <input v-model.number="settings.bubble.offsetX" type="range" min="-80" max="80" step="1" :style="{ '--fill': fillPct(settings.bubble.offsetX, -80, 80) }" />
        </label>
        <label class="range-field">
          <span class="range-label">{{ t('form.offsetY') }} <output>{{ settings.bubble.offsetY }} px</output></span>
          <input v-model.number="settings.bubble.offsetY" type="range" min="-80" max="80" step="1" :style="{ '--fill': fillPct(settings.bubble.offsetY, -80, 80) }" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">{{ t('form.bubble') }}</h2>
      <div class="control-stack">
        <div class="control-grid two">
          <label class="field">
            <span class="field-label">{{ t('form.colorPreset') }}</span>
            <select data-testid="color-preset" :value="settings.bubble.colorPreset" @change="setColorPreset(($event.target as HTMLSelectElement).value as BubbleColorPreset)">
              <option value="paper">{{ t('form.preset.paper') }}</option>
              <option value="warm">{{ t('form.preset.warm') }}</option>
              <option value="mint">{{ t('form.preset.mint') }}</option>
              <option value="sky">{{ t('form.preset.sky') }}</option>
              <option value="night">{{ t('form.preset.night') }}</option>
              <option value="custom">{{ t('form.preset.custom') }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.shadow') }}</span>
            <select v-model="settings.bubble.shadow">
              <option value="none">{{ t('form.shadow.none') }}</option>
              <option value="soft">{{ t('form.shadow.soft') }}</option>
              <option value="medium">{{ t('form.shadow.medium') }}</option>
              <option value="strong">{{ t('form.shadow.strong') }}</option>
            </select>
          </label>
        </div>
        <div class="control-grid flex-between">
          <label class="field">
            <span class="field-label">{{ t('form.background') }}</span>
            <ColorField :model-value="settings.bubble.background" @update:model-value="setBubbleColor('background', $event)" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.textColor') }}</span>
            <ColorField :model-value="settings.bubble.textColor" @update:model-value="setBubbleColor('textColor', $event)" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.borderColor') }}</span>
            <ColorField :model-value="settings.bubble.borderColor" @update:model-value="setBubbleColor('borderColor', $event)" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.highlight') }}</span>
            <ColorField v-model="settings.bubble.highlightColor" />
          </label>
        </div>
        <div class="control-grid two">
          <label class="range-field">
            <span class="range-label">{{ t('form.borderWidth') }} <output>{{ settings.bubble.borderWidth }} px</output></span>
            <input v-model.number="settings.bubble.borderWidth" type="range" min="0" max="3" step="1" :style="{ '--fill': fillPct(settings.bubble.borderWidth, 0, 3) }" />
          </label>
          <label class="range-field">
            <span class="range-label">{{ t('form.radius') }} <output>{{ settings.bubble.radius }} px</output></span>
            <input v-model.number="settings.bubble.radius" type="range" min="0" max="20" step="1" :style="{ '--fill': fillPct(settings.bubble.radius, 0, 20) }" />
          </label>
          <label class="range-field">
            <span class="range-label">{{ t('form.padding') }} <output>{{ settings.bubble.padding }} px</output></span>
            <input v-model.number="settings.bubble.padding" type="range" min="4" max="20" step="1" :style="{ '--fill': fillPct(settings.bubble.padding, 4, 20) }" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section text-wide">
      <h2 class="section-title">{{ t('form.text') }}</h2>
      <div class="control-stack">
        <div class="control-grid three">
          <label class="field">
            <span class="field-label">{{ t('form.font') }}</span>
            <select v-model="settings.bubble.fontFamily">
              <option value="system">{{ t('form.font.system') }}</option>
              <option value="serif">{{ t('form.font.serif') }}</option>
              <option value="mono">{{ t('form.font.mono') }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.fontWeight') }}</span>
            <select v-model="settings.bubble.fontWeight">
              <option value="400">{{ t('form.weight.400') }}</option>
              <option value="500">{{ t('form.weight.500') }}</option>
              <option value="600">{{ t('form.weight.600') }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ t('form.textAlign') }}</span>
            <select v-model="settings.bubble.textAlign">
              <option value="left">{{ t('form.textAlign.left') }}</option>
              <option value="center">{{ t('form.textAlign.center') }}</option>
              <option value="right">{{ t('form.textAlign.right') }}</option>
            </select>
          </label>
        </div>
        <div class="control-grid three">
          <label class="range-field">
            <span class="range-label">{{ t('form.fontSize') }} <output>{{ settings.bubble.fontSize }} px</output></span>
            <input v-model.number="settings.bubble.fontSize" type="range" min="14" max="22" step="1" :style="{ '--fill': fillPct(settings.bubble.fontSize, 14, 22) }" />
          </label>
          <label class="range-field">
            <span class="range-label">{{ t('form.lineHeight') }} <output>{{ settings.bubble.lineHeight }}</output></span>
            <input v-model.number="settings.bubble.lineHeight" type="range" min="1.2" max="2" step="0.05" :style="{ '--fill': fillPct(settings.bubble.lineHeight, 1.2, 2) }" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section trigger-wide">
      <h2 class="section-title">{{ t('form.trigger') }}</h2>
      <div class="hfields">
        <div class="check-rows">
          <label class="check-row"><input v-model="settings.enabled" type="checkbox" class="checkbox" /><span>{{ t('form.enabled') }}</span></label>
          <label class="check-row"><input v-model="settings.bubble.showArrow" type="checkbox" class="checkbox" /><span>{{ t('form.showArrow') }}</span></label>
          <label class="check-row"><input v-model="settings.hoverEnabled" type="checkbox" class="checkbox" /><span>{{ t('form.hoverTranslate') }}</span></label>
          <label class="check-row"><input v-model="settings.selectionEnabled" type="checkbox" class="checkbox" /><span>{{ t('form.selectionTranslate') }}</span></label>
          <label class="check-row" :title="t('form.showOriginalWordTip')">
            <input v-model="settings.word.showOriginal" type="checkbox" class="checkbox" data-testid="show-original-word" />
            <span>{{ t('form.showOriginalWord') }}</span>
          </label>
          <label class="check-row" :title="t('form.showOriginalTip')">
            <input v-model="settings.bubble.showOriginal" type="checkbox" class="checkbox" data-testid="show-original" />
            <span>{{ t('form.showOriginal') }}</span>
          </label>
          <div class="hfield check-row">
          <span class="hlbl">{{ t('form.hoverDelayLabel') }}</span>
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
        </div>
        
        <div class="hfield grow">
          <span class="hlbl">{{ t('form.blacklist') }}<span class="hlbl-sub">{{ t('form.blacklistHint') }}</span></span>
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
/* 复选组：与「单词翻译」源行同款芯片样式，空间足够时一排放下 6 个 */
.check-rows {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
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

.header-actions {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.locale-switch {
  display: grid;
  gap: 5px;
  justify-items: start;
}

.locale-options {
  display: inline-flex;
  gap: 4px;
  min-height: 34px;
  padding: 3px;
  border: 1px solid var(--af-control-border);
  border-radius: 8px;
  background: var(--af-control-background);
}

.locale-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--af-text);
  cursor: pointer;
  user-select: none;
  transition: background 160ms ease-out, color 160ms ease-out;
}

.locale-option:hover {
  background: var(--af-control-hover);
}

.locale-option:has(input:checked) {
  background: var(--af-accent);
  color: #fff;
  font-weight: 600;
}

.locale-option:has(input:focus-visible) {
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.locale-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
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
