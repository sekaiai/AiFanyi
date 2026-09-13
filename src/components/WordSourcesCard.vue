<script setup lang="ts">
import { computed } from 'vue'
import type { TranslationSettings, WordSourceId } from '../core/types'
import { WORD_SOURCE_LABELS, type WordProbeState } from '../core/word-sources'

const settings = defineModel<TranslationSettings>({ required: true })

const props = defineProps<{
  /** 连通性探测快照；宿主不支持探测（如演示环境）时为 undefined，隐藏「重新检测」。 */
  wordProbe?: WordProbeState | null
  probing?: boolean
}>()

const emit = defineEmits<{
  probeWords: []
}>()

interface WordSourceRow {
  id: WordSourceId
  desc: string
}

const wordSourceRows: WordSourceRow[] = [
  { id: 'youdao', desc: '释义（含词性）· 英美音标 · 真人发音音频，最完整' },
  { id: 'bing', desc: '译文 · 英美音标（按原形词给，loved 会得到 lʌv）' },
  { id: 'google', desc: '仅译文，无音标；国内常不可达，检测不到会自动跳过' },
  { id: 'freedictionaryapi', desc: '中文释义 + IPA 音标，不区分口音；与其他源平级轮换' },
]

function wordStateCls(source: WordSourceId): string {
  const ok = props.wordProbe?.results[source]
  if (ok === true) return ''
  if (ok === false) return 'is-bad'
  return 'is-unknown'
}

const wordProbeTime = computed(() => {
  const checkedAt = props.wordProbe?.checkedAt ?? 0
  if (!checkedAt) return ''
  const available = props.wordProbe?.results ?? {}
  const count = wordSourceRows.filter((row) => available[row.id] === true).length
  return `上次检测：${new Date(checkedAt).toLocaleTimeString()} · ${count}/${wordSourceRows.length} 可用`
})
</script>

<template>
  <section class="word-sources-card" aria-label="单词查询">
    <h2 class="section-title">单词查询</h2>

    <div class="switch-rows">
      <label class="switch-row is-strong">单词使用免费词典源
        <input v-model="settings.word.enabled" type="checkbox" class="checkbox" />
      </label>
      <label class="switch-row is-strong">朗读单词
        <input v-model="settings.word.speakEnabled" type="checkbox" class="checkbox" />
      </label>
    </div>

    <div class="src-chips">
      <label
        v-for="row in wordSourceRows"
        :key="row.id"
        class="chip"
        :class="{ off: !settings.word.sources[row.id] }"
      >
        <input
          v-model="settings.word.sources[row.id]"
          type="checkbox"
          :aria-label="`启用${WORD_SOURCE_LABELS[row.id]}`"
        />
        <span class="dot" :class="wordStateCls(row.id)"></span>{{ WORD_SOURCE_LABELS[row.id] }}
      </label>
    </div>

    <div v-if="wordProbe !== undefined" class="source-foot">
      <button class="button button-secondary" type="button" data-testid="probe-words" :disabled="probing" @click="emit('probeWords')">
        {{ probing ? '检测中…' : '重新检测' }}
      </button>
      <span v-if="wordProbeTime" class="source-time">{{ wordProbeTime }}</span>
    </div>

    <div class="seg-row">
      <span class="field-label">朗读音色</span>
      <span class="seg">
        <label><input v-model="settings.word.accent" type="radio" value="us" />美音</label>
        <label><input v-model="settings.word.accent" type="radio" value="uk" />英音</label>
      </span>
    </div>

    <div class="src-desc">
      <p>划选<b>单个单词</b>时优先走免费源，不消耗「翻译方案」额度；随机轮换、失败换源，<b>全部失败</b>（或一个都没启用）才回落「翻译方案」。朗读音色仅有真人音频的源才区分，TTS 兜底按系统默认。</p>
      <ul>
        <li v-for="row in wordSourceRows" :key="row.id"><b>{{ WORD_SOURCE_LABELS[row.id] }}</b>{{ row.desc }}</li>
      </ul>
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
  font-size: 13px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 720;
}

.field-label {
  color: var(--af-muted);
  font-size: 12px;
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

.switch-rows {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 28px;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 220px;
  min-height: 30px;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;
}
.switch-row.is-strong {
  font-weight: 650;
}

/* 源芯片行：只留名称 + 勾选 + 探测状态点 */
.src-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 7px;
  border: 1px solid var(--af-line);
  border-radius: 999px;
  background: var(--af-control-background);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.chip:hover {
  border-color: var(--af-control-border-hover);
}
.chip input {
  display: none;
}
.chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: oklch(55% 0.14 150);
}
.chip .dot.is-bad {
  background: oklch(55% 0.19 25);
}
.chip .dot.is-unknown {
  background: var(--af-control-border);
}
.chip.off {
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
  font-size: 12px;
  white-space: nowrap;
}

.button {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 12px;
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
.seg-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
}
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
  font-size: 12px;
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
  font-size: 11px;
  line-height: 1.6;
}
.src-desc p {
  margin: 0 0 6px;
}
.src-desc ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.src-desc li b {
  margin-right: 6px;
  color: var(--af-text);
  font-weight: 600;
}

@media (max-width: 760px) {
  .src-desc ul {
    grid-template-columns: 1fr;
  }
}
</style>
