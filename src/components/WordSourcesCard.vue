<script setup lang="ts">
import { computed } from 'vue'
import type { TranslationSettings, WordSourceId } from '../core/types'
import { WORD_SOURCE_IDS, WORD_SOURCE_LABELS, type WordProbeState } from '../core/word-sources'

const settings = defineModel<TranslationSettings>({ required: true })

const props = defineProps<{
  /** 连通性探测快照；宿主不支持探测（如演示环境）时为 undefined，隐藏「重新检测」。 */
  wordProbe?: WordProbeState | null
  probing?: boolean
}>()

const emit = defineEmits<{
  probeWords: []
}>()

/** 每个源都显示延迟：探测成功显示耗时，检测失败显示「不可用」，未检测显示「—」占位。 */
function latencyText(source: WordSourceId): string {
  if (props.wordProbe?.results[source] === false) return '不可用'
  const ms = props.wordProbe?.latency?.[source]
  return typeof ms === 'number' ? `${ms}ms` : '—'
}

/** 按显示的值着色：可用绿、不可用红、未检测保持灰。 */
function latencyCls(source: WordSourceId): string {
  if (props.wordProbe?.results[source] === false) return 'bad'
  return typeof props.wordProbe?.latency?.[source] === 'number' ? 'ok' : ''
}

const wordProbeTime = computed(() => {
  const checkedAt = props.wordProbe?.checkedAt ?? 0
  if (!checkedAt) return ''
  const available = props.wordProbe?.results ?? {}
  const count = WORD_SOURCE_IDS.filter((id) => available[id] === true).length
  return `上次检测：${new Date(checkedAt).toLocaleTimeString()} · ${count}/${WORD_SOURCE_IDS.length} 可用`
})
</script>

<template>
  <section class="word-sources-card" aria-label="单词查询">
    <h2 class="section-title">单词查询</h2>

    <div class="src-rows">
      <label
        v-for="id in WORD_SOURCE_IDS"
        :key="id"
        class="src-row"
        :class="{ off: !settings.word.sources[id] }"
      >
        <input
          v-model="settings.word.sources[id]"
          type="checkbox"
          class="checkbox"
          :aria-label="`启用${WORD_SOURCE_LABELS[id]}`"
        />
        <span class="src-name">{{ WORD_SOURCE_LABELS[id] }}</span>
        <span class="latency" :class="latencyCls(id)">{{ latencyText(id) }}</span>
      </label>
    </div>

    <div v-if="wordProbe !== undefined" class="source-foot">
      <button class="button button-secondary" type="button" data-testid="probe-words" :disabled="probing" @click="emit('probeWords')">
        {{ probing ? '检测中…' : '重新检测' }}
      </button>
      <span v-if="wordProbeTime" class="source-time">{{ wordProbeTime }}</span>
    </div>

    <div class="speak-row">
      <label class="field-label speak-toggle">朗读单词
        <input v-model="settings.word.speakEnabled" type="checkbox" class="checkbox" />
      </label>
      <span class="field-label">朗读音色</span>
      <span class="seg">
        <label><input v-model="settings.word.accent" type="radio" value="us" />美音</label>
        <label><input v-model="settings.word.accent" type="radio" value="uk" />英音</label>
      </span>
    </div>

    <div class="src-desc">
      <p>划选<b>单个单词</b>时按上面勾选的免费源随机轮换，不消耗「翻译方案」额度；失败自动换下一个源，<b>全部失败</b>（或一个都没启用）才回落「翻译方案」。延迟为该源上次探测耗时：绿色为可用，红色「不可用」为检测失败，「—」表示未检测。</p>
      <p>「朗读单词」控制词典气泡里的发音按钮；朗读音色仅对有真人音频的源生效，TTS 兜底按系统默认。</p>
    </div>
  </section>
</template>

<style scoped>
.word-sources-card {
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--af-line);
  border-radius: 12px;
  background: var(--af-panel);
  font-size: 14px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 720;
}

.field-label {
  color: var(--af-muted);
  font-size: 14px;
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

/* 朗读两项同排：朗读单词（复选）+ 朗读音色（分段胶囊），标签样式一致 */
.speak-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
}
.speak-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

/* 源行：【checkbox | 名称 | 延迟】，延迟恒显，一行排四个源 */
.src-rows {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px 16px;
  margin-top: 10px;
}
.src-row {
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
.src-row:hover {
  background: var(--af-control-hover);
}
.src-row .src-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.src-row .latency {
  color: var(--af-muted);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.src-row .latency.ok {
  color: oklch(55% 0.14 150);
}
.src-row .latency.bad {
  color: oklch(55% 0.19 25);
}
.src-row.off {
  opacity: 0.45;
}

.source-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 10px;
}
.source-time {
  color: var(--af-muted);
  font-size: 14px;
  white-space: nowrap;
}

.button {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out;
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
.button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

/* 分段胶囊（radio 语义不变） */
.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--af-soft);
}
.seg label {
  position: relative;
  padding: 3px 10px;
  border-radius: 6px;
  color: var(--af-muted);
  font-size: 14px;
  cursor: pointer;
}
.seg label:has(input:checked) {
  background: var(--af-panel);
  color: var(--af-text);
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.seg input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

/* 描述性文字统一沉底 */
.src-desc {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--af-soft);
  color: var(--af-muted);
  font-size: 14px;
  line-height: 1.6;
}
.src-desc p {
  margin: 0 0 6px;
}
.src-desc p:last-child {
  margin-bottom: 0;
}

/* 窄屏源行退回单列 */
@media (max-width: 760px) {
  .src-rows {
    grid-template-columns: 1fr;
  }
}
</style>
