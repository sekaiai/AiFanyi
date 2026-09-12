<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_PRESETS } from '../core/settings'
import type { BubbleColorPreset, TranslationSettings, WordSourceId } from '../core/types'
import { WORD_SOURCE_LABELS, type WordProbeState } from '../core/word-sources'
import BubblePreview from './BubblePreview.vue'

const settings = defineModel<TranslationSettings>({ required: true })

const props = defineProps<{
  status: string
  /** 连通性探测快照；宿主不支持探测（如演示环境）时为 undefined，隐藏「重新检测」。 */
  wordProbe?: WordProbeState | null
  probing?: boolean
}>()

const emit = defineEmits<{
  reset: []
  probeWords: []
}>()

const blacklistText = computed({
  get: () => settings.value.siteBlacklist.join('\n'),
  set: (value: string) => {
    settings.value.siteBlacklist = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  },
})

const alignHint = computed(() => ['top', 'bottom'].includes(settings.value.bubble.side)
  ? '上下方向：左 / 中 / 右'
  : '左右方向：上 / 中 / 下')

interface WordSourceRow {
  id: WordSourceId
  desc: string
  badge?: string
}

const wordSourceRows: WordSourceRow[] = [
  { id: 'youdao', desc: '释义（含词性）· 英美音标 · 真人发音音频', badge: '最完整' },
  { id: 'bing', desc: '译文 · 英美音标（按原形词给，loved 会得到 lʌv）' },
  { id: 'google', desc: '仅译文，无音标。国内常不可达，检测不到的会自动跳过' },
  { id: 'freedictionaryapi', desc: '中文释义 + IPA 音标，不区分口音。与其他源平级参与轮换' },
]

function wordState(source: WordSourceId): { label: string; cls: string } {
  const ok = props.wordProbe?.results[source]
  if (ok === true) return { label: '可用', cls: '' }
  if (ok === false) return { label: '不可用', cls: 'is-bad' }
  return { label: '未检测', cls: 'is-unknown' }
}

const wordProbeTime = computed(() => {
  const checkedAt = props.wordProbe?.checkedAt ?? 0
  if (!checkedAt) return ''
  const available = props.wordProbe?.results ?? {}
  const count = wordSourceRows.filter((row) => available[row.id] === true).length
  return `上次检测：${new Date(checkedAt).toLocaleTimeString()} · ${count}/${wordSourceRows.length} 可用`
})

function setColorPreset(value: BubbleColorPreset): void {
  settings.value.bubble.colorPreset = value
  if (value !== 'custom') Object.assign(settings.value.bubble, COLOR_PRESETS[value])
}

function markCustomColor(): void {
  settings.value.bubble.colorPreset = 'custom'
}

</script>

<template>
  <form class="settings-form" @submit.prevent>
    <header class="settings-header">
      <div>
        <h1 class="settings-title">AiFanyi</h1>
        <p class="settings-status">{{ status }}</p>
      </div>
      <button class="button button-secondary" type="button" @click="emit('reset')">恢复默认</button>
    </header>

    <section class="settings-section preview-section">
      <BubblePreview :settings="settings.bubble" />
    </section>

    <section class="settings-section">
      <h2 class="section-title">触发</h2>
      <div class="control-grid two">
        <label class="switch-field"><input v-model="settings.enabled" type="checkbox" /> 全局启用</label>
        <label class="switch-field"><input v-model="settings.hoverEnabled" type="checkbox" /> 悬停翻译</label>
        <label class="switch-field"><input v-model="settings.selectionEnabled" type="checkbox" /> 选中翻译</label>
        <label class="switch-field"><input v-model="settings.bubble.showOriginal" type="checkbox" /> 显示原文</label>
        <label class="switch-field"><input v-model="settings.bubble.showArrow" type="checkbox" /> 显示箭头</label>
      </div>
      <label class="range-field">
        <span class="range-label">悬停 {{ settings.hoverDelayMs }}ms 后显示翻译（单词查询最低延迟 300ms）</span>
        <input v-model.number="settings.hoverDelayMs" type="range" min="0" max="5000" step="50" />
      </label>
      <label class="field">
        <span class="field-label">站点黑名单</span>
        <textarea v-model="blacklistText" placeholder="example.com&#10;*.internal.example" />
      </label>
    </section>

    <section class="settings-section">
      <h2 class="section-title">单词查询</h2>
      <div class="control-grid two">
        <label class="switch-field is-strong"><input v-model="settings.word.enabled" type="checkbox" /> 单词使用免费词典源</label>
        <label class="switch-field is-strong"><input v-model="settings.word.speakEnabled" type="checkbox" /> 朗读单词</label>
      </div>
      <p class="field-hint">
        划选<b>单个单词</b>时优先走下面这些免费源，不消耗「翻译方案」的额度；短语和句子仍走「翻译方案」。
        查询时从<b>已启用且检测可用</b>的源里随机挑一个，失败自动换下一个；
        <b>全部失败</b>（或一个都没启用）才改用「翻译方案」翻译，此时会消耗方案额度。
      </p>

      <ul class="source-list">
        <li v-for="row in wordSourceRows" :key="row.id" class="source-row" :class="{ 'is-off': !settings.word.sources[row.id] }">
          <input
            v-model="settings.word.sources[row.id]"
            type="checkbox"
            :aria-label="`启用${WORD_SOURCE_LABELS[row.id]}`"
          />
          <span class="source-main">
            <span class="source-name">
              {{ WORD_SOURCE_LABELS[row.id] }}
              <span v-if="row.badge" class="source-badge">{{ row.badge }}</span>
            </span>
            <span class="source-desc">{{ row.desc }}</span>
          </span>
          <span class="source-state" :class="wordState(row.id).cls">
            <span class="dot"></span>{{ wordState(row.id).label }}
          </span>
        </li>
      </ul>

      <div v-if="wordProbe !== undefined" class="source-foot">
        <button class="button button-secondary" type="button" data-testid="probe-words" :disabled="probing" @click="emit('probeWords')">
          {{ probing ? '检测中…' : '重新检测' }}
        </button>
        <span v-if="wordProbeTime" class="source-time">{{ wordProbeTime }}</span>
      </div>

      <div class="segmented-field">
        <span class="field-label">朗读音色（有真人音频的源才会区分；TTS 兜底时按系统默认）</span>
        <div class="segmented">
          <label><input v-model="settings.word.accent" type="radio" value="us" /> 美音</label>
          <label><input v-model="settings.word.accent" type="radio" value="uk" /> 英音</label>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">位置</h2>
      <div class="control-grid two">
        <div class="control-col">
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
            <span class="field-hint">{{ alignHint }}</span>
          </label>
        </div>
        <div class="control-col">
          <label class="range-field">
            <span class="range-label">间距 <output>{{ settings.bubble.gap }} px</output></span>
            <input v-model.number="settings.bubble.gap" type="range" min="0" max="24" step="1" />
          </label>
          <label class="range-field">
            <span class="range-label">水平微调 <output>{{ settings.bubble.offsetX }} px</output></span>
            <input v-model.number="settings.bubble.offsetX" type="range" min="-80" max="80" step="1" />
          </label>
          <label class="range-field">
            <span class="range-label">垂直微调 <output>{{ settings.bubble.offsetY }} px</output></span>
            <input v-model.number="settings.bubble.offsetY" type="range" min="-80" max="80" step="1" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">气泡</h2>
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
        <label class="field"><span class="field-label">背景</span><input v-model="settings.bubble.background" type="color" @input="markCustomColor" /></label>
        <label class="field"><span class="field-label">文字</span><input v-model="settings.bubble.textColor" type="color" @input="markCustomColor" /></label>
        <label class="field"><span class="field-label">边框</span><input v-model="settings.bubble.borderColor" type="color" @input="markCustomColor" /></label>
        <label class="field">
          <span class="field-label">阴影</span>
          <select v-model="settings.bubble.shadow">
            <option value="none">无</option>
            <option value="soft">轻柔</option>
            <option value="medium">适中</option>
            <option value="strong">明显</option>
          </select>
        </label>
        <label class="range-field">
          <span class="range-label">边框宽度 <output>{{ settings.bubble.borderWidth }} px</output></span>
          <input v-model.number="settings.bubble.borderWidth" type="range" min="0" max="3" step="1" />
        </label>
        <label class="range-field">
          <span class="range-label">圆角 <output>{{ settings.bubble.radius }} px</output></span>
          <input v-model.number="settings.bubble.radius" type="range" min="0" max="20" step="1" />
        </label>
        <label class="range-field">
          <span class="range-label">内边距 <output>{{ settings.bubble.padding }} px</output></span>
          <input v-model.number="settings.bubble.padding" type="range" min="4" max="20" step="1" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">文字</h2>
      <div class="control-grid two">
        <label class="field">
          <span class="field-label">字体</span>
          <select v-model="settings.bubble.fontFamily">
            <option value="system">系统</option>
            <option value="serif">衬线</option>
            <option value="mono">等宽</option>
          </select>
        </label>
        <label class="range-field">
          <span class="range-label">字号 <output>{{ settings.bubble.fontSize }} px</output></span>
          <input v-model.number="settings.bubble.fontSize" type="range" min="12" max="22" step="1" />
        </label>
        <label class="field">
          <span class="field-label">字重</span>
          <select v-model="settings.bubble.fontWeight">
            <option value="400">常规</option>
            <option value="500">中等</option>
            <option value="600">加粗</option>
          </select>
        </label>
        <label class="range-field">
          <span class="range-label">行高 <output>{{ settings.bubble.lineHeight }}</output></span>
          <input v-model.number="settings.bubble.lineHeight" type="range" min="1.2" max="2" step="0.05" />
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

.field :is(input:not([type="color"]), select, textarea) {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out, background 160ms ease-out;
}

.field :is(input:not([type="color"]), select) {
  min-height: 38px;
}

.field :is(input:not([type="color"]), select, textarea):hover {
  border-color: var(--af-control-border-hover);
}

.field :is(input:not([type="color"]), select, textarea):focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.field textarea {
  min-height: 78px;
  resize: vertical;
}

.field input[type="color"] {
  width: 100%;
  height: 38px;
  padding: 4px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  cursor: pointer;
}

.field input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

.field input[type="color"]::-webkit-color-swatch {
  border: 0;
  border-radius: 4px;
}

.button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 7px;
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

.switch-field input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--af-accent);
}

.switch-field.is-strong {
  font-weight: 650;
}

/* 单词查询源列表 */

.source-list {
  display: grid;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.source-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--af-control-border);
  border-radius: 8px;
  background: var(--af-control-background);
}

.source-row.is-off {
  opacity: 0.55;
}

.source-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--af-accent);
}

.source-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.source-name {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 13px;
  font-weight: 650;
}

.source-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--af-soft);
  color: var(--af-muted);
  font-size: 10px;
  font-weight: 400;
}

.source-desc {
  overflow: hidden;
  color: var(--af-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--af-muted);
  font-size: 12px;
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border: 1px solid var(--af-accent);
  border-radius: 50%;
  background: var(--af-accent);
}

.source-state.is-bad .dot,
.source-state.is-unknown .dot {
  border-color: var(--af-muted);
  background: transparent;
}

.source-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.source-time {
  color: var(--af-muted);
  font-size: 12px;
}

.segmented-field {
  display: grid;
  gap: 5px;
  margin-top: 10px;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.segmented label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.segmented input {
  margin: 0;
  accent-color: var(--af-accent);
}

.range-field input[type="range"] {
  height: 22px;
  margin: 0;
  accent-color: var(--af-accent);
}

.settings-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.settings-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
}

.settings-status,
.field-hint {
  margin: 4px 0 0;
  color: var(--af-muted);
  font-size: 12px;
}

.settings-section {
  min-width: 0;
  padding: 16px 20px 18px;
  border-top: 1px solid var(--af-line);
}

.preview-section {
  grid-column: 1 / -1;
}

.section-title {
  margin: 0 0 12px;
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

.control-col {
  display: grid;
  gap: 10px;
  min-width: 0;
  align-content: start;
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
  font-size: 12px;
}

.range-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.switch-field {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 8px;
  user-select: none;
}

input[type="range"] {
  width: 100%;
}

@media (max-width: 760px) {
  .settings-form,
  .control-grid.two {
    grid-template-columns: 1fr;
  }

  .preview-section {
    grid-column: auto;
  }
}
</style>
