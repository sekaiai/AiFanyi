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
  return typeof ms === 'number' ? `${ms}ms` : ''
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
  <section class="word-sources-card" aria-label="单词翻译">
    <h2 class="section-title">单词翻译</h2>

    <div class="src-rows">
      <label
        v-for="id in WORD_SOURCE_IDS"
        :key="id"
        class="src-row"
        :class="{ off: !settings.word.sources[id] }"
        :title="WORD_SOURCE_LABELS[id]"
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
        {{ probing ? '检测中…' : '检测连通率' }}
      </button>
      <span v-if="wordProbeTime" class="source-time">{{ wordProbeTime }}</span>
    </div>

    <div class="speak-row">
      <label class="src-row">
        <input v-model="settings.word.speakEnabled" type="checkbox" class="checkbox" />
        <span>朗读单词</span>
      </label>
      <span class="field-label">朗读音色</span>
      <span class="seg">
        <label><input v-model="settings.word.accent" type="radio" value="us" />美音</label>
        <label><input v-model="settings.word.accent" type="radio" value="uk" />英音</label>
      </span>
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

/* 朗读两项同排：朗读单词（复选，与源行同款芯片）+ 朗读音色（分段胶囊） */
.speak-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
}

/* 源行：【checkbox | 名称 | 延迟】，延迟恒显，一行排四个源 */
.src-rows {
    display: flex;
    flex-wrap: wrap;
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
  white-space: nowrap;
}
.src-row .latency.ok {
  color: oklch(55% 0.14 150);
}
.src-row .latency.bad {
  color: oklch(55% 0.19 25);
}
.src-row.off {
  opacity: 0.85;
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
</style>
