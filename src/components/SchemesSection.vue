<script setup lang="ts">
import { computed, ref, shallowRef, toRaw } from 'vue'
import { TARGET_LANGUAGES } from '../core/settings'
import type { SchemeSettings, SchemeType } from '../core/types'
import { hasRequiredConfig } from '../core/translate'
import SchemeEditorModal from './SchemeEditorModal.vue'

const schemes = defineModel<SchemeSettings[]>({ required: true })
const targetLanguage = defineModel<string>('targetLanguage', { required: true })

const props = defineProps<{
  testScheme?: (scheme: SchemeSettings) => Promise<string>
  demoMode?: boolean
}>()

const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  ai: '自定义AI',
  baidu: '百度翻译',
  volcengine: '火山引擎',
  deepl: 'DeepL',
  google: 'Google 翻译（免密钥）',
  googleCloud: 'Google Cloud',
}

const testingSchemeId = shallowRef('')
const editorVisible = ref(false)
const editorDraft = ref<SchemeSettings | null>(null)

interface SchemeTestOutcome {
  text: string
  tone: 'fast' | 'mid' | 'slow' | 'error' | 'idle'
}

const schemeTestStatus = ref<Record<string, SchemeTestOutcome>>({})
const schemeConfigured = computed(() => Object.fromEntries(schemes.value.map((scheme) => [scheme.id, hasRequiredConfig(scheme)])))

function speedTone(ms: number): SchemeTestOutcome['tone'] {
  if (ms < 800) return 'fast'
  if (ms < 2500) return 'mid'
  return 'slow'
}

function openAddScheme(): void {
  editorDraft.value = null
  editorVisible.value = true
}

function openEditScheme(scheme: SchemeSettings): void {
  editorDraft.value = structuredClone(toRaw(scheme))
  editorVisible.value = true
}

function closeEditor(): void {
  editorVisible.value = false
  editorDraft.value = null
}

function saveScheme(scheme: SchemeSettings): void {
  const index = schemes.value.findIndex((item) => item.id === scheme.id)
  if (index === -1) schemes.value.push(scheme)
  else schemes.value.splice(index, 1, scheme)
  closeEditor()
}

function removeScheme(id: string): void {
  const index = schemes.value.findIndex((scheme) => scheme.id === id)
  if (index !== -1) schemes.value.splice(index, 1)
}

function moveScheme(id: string, offset: -1 | 1): void {
  const list = schemes.value
  const index = list.findIndex((scheme) => scheme.id === id)
  const target = index + offset
  if (index === -1 || target < 0 || target >= list.length) return
  const removed = list.splice(index, 1)[0]
  if (!removed) return
  list.splice(target, 0, removed)
}

async function handleTestScheme(scheme: SchemeSettings): Promise<void> {
  if (!props.testScheme) return
  if (!hasRequiredConfig(scheme)) {
    schemeTestStatus.value[scheme.id] = { text: '请先完善该方案配置', tone: 'error' }
    return
  }
  testingSchemeId.value = scheme.id
  schemeTestStatus.value[scheme.id] = { text: '正在测试...', tone: 'idle' }
  const startedAt = performance.now()
  try {
    await props.testScheme(scheme)
    const latencyMs = Math.round(performance.now() - startedAt)
    schemeTestStatus.value[scheme.id] = { text: `成功 · ${latencyMs} ms`, tone: speedTone(latencyMs) }
  } catch (error) {
    schemeTestStatus.value[scheme.id] = { text: error instanceof Error ? error.message : '测试失败', tone: 'error' }
  } finally {
    testingSchemeId.value = ''
  }
}
</script>

<template>
  <section class="schemes-section">
    <div class="section-head">
      <h2 class="section-title">翻译方案</h2>
      <label class="target-field">
        <span class="field-label">目标语言</span>
        <select v-model="targetLanguage" data-testid="target-language">
          <option v-for="lang in TARGET_LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
        </select>
      </label>
    </div>
    <p class="section-hint">按顺序依次尝试，排在最前面的优先使用。</p>
    <p v-if="demoMode" class="notice">在线演示中的 API 密钥只保存在当前页面内存，刷新后会消失。</p>
    <p v-else class="notice security-notice">扩展密钥仅保存在本机受信任存储，由后台请求使用；网页内容脚本不会接收密钥。</p>

    <div class="scheme-list">
      <div v-for="(scheme, index) in schemes" :key="scheme.id" class="scheme-card" :class="{ 'is-off': !scheme.enabled }" :data-testid="`scheme-card-${scheme.type}`">
        <span class="scheme-order">{{ index + 1 }}</span>
        <label class="switch-field scheme-switch">
          <input v-model="scheme.enabled" type="checkbox" class="checkbox" :data-testid="`scheme-toggle-${scheme.id}`" />
          <span class="scheme-name">{{ SCHEME_TYPE_LABELS[scheme.type] }}</span>
        </label>
        <span class="scheme-state" :class="schemeConfigured[scheme.id] ? 'configured' : 'incomplete'">
          {{ schemeConfigured[scheme.id] ? '配置完成' : '待完善配置' }}
        </span>
        <span class="settings-status scheme-status" :class="schemeTestStatus[scheme.id]?.tone" :title="schemeTestStatus[scheme.id]?.text ?? ''">{{ schemeTestStatus[scheme.id]?.text ?? '' }}</span>
        <button class="button button-primary" type="button" :data-testid="`scheme-test-${scheme.type}`" :disabled="testingSchemeId === scheme.id || !testScheme" @click="handleTestScheme(scheme)">测试</button>
        <div class="scheme-actions">
          <button class="icon-button" type="button" title="上移" :disabled="index === 0" @click="moveScheme(scheme.id, -1)">↑</button>
          <button class="icon-button" type="button" title="下移" :disabled="index === schemes.length - 1" @click="moveScheme(scheme.id, 1)">↓</button>
          <button class="icon-button" type="button" :data-testid="`scheme-edit-${scheme.id}`" title="编辑" @click="openEditScheme(scheme)">✎</button>
          <button class="icon-button" type="button" title="删除" @click="removeScheme(scheme.id)">✕</button>
        </div>
      </div>
    </div>

    <div class="scheme-add">
      <button class="button button-secondary add-button" type="button" data-testid="add-scheme" @click="openAddScheme">添加翻译方案</button>
    </div>

    <SchemeEditorModal :visible="editorVisible" :initial-scheme="editorDraft" :test-scheme="testScheme" :demo-mode="demoMode" @close="closeEditor" @save="saveScheme" />
  </section>
</template>

<style scoped>
.schemes-section {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--af-line);
  border-radius: 12px;
  background: var(--af-panel);
  font-size: 14px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 6px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 720;
}

.section-hint {
  margin: 0 0 10px;
  color: var(--af-muted);
  font-size: 14px;
}

.target-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.target-field .field-label {
  color: var(--af-muted);
  font-size: 14px;
  white-space: nowrap;
}

.target-field select {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  font-size: 14px;
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out;
}

.target-field select:hover {
  border-color: var(--af-control-border-hover);
}

.target-field select:focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.notice,
.settings-status {
  margin: 4px 0 0;
  color: var(--af-muted);
  font-size: 14px;
}

.settings-status.fast {
  color: oklch(55% 0.14 150);
}

.settings-status.mid {
  color: oklch(62% 0.13 70);
}

.settings-status.slow,
.settings-status.error {
  color: oklch(55% 0.19 25);
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

.button-primary {
  background: var(--af-accent);
  color: var(--af-accent-contrast);
}

.button-primary:hover:not(:disabled) {
  background: var(--af-accent-hover);
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.switch-field {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 8px;
  user-select: none;
  cursor: pointer;
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

.scheme-list {
  display: grid;
  gap: 8px;
}

.scheme-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--af-line);
  border-radius: 10px;
  background: var(--af-control-background);
  transition: border-color 160ms ease-out;
}

.scheme-card:hover {
  border-color: var(--af-control-border-hover);
}

.scheme-card.is-off .scheme-name,
.scheme-card.is-off .scheme-state,
.scheme-card.is-off .scheme-order {
  opacity: 0.5;
}

.scheme-order {
  flex: none;
  width: 16px;
  color: var(--af-muted);
  font-size: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.scheme-name {
  font-size: 14px;
  font-weight: 640;
  white-space: nowrap;
}

.scheme-switch {
  gap: 8px;
  min-width: 0;
}

.scheme-state {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
}

.scheme-state.configured {
  background: color-mix(in srgb, var(--af-accent) 14%, transparent);
  color: var(--af-accent);
}

.scheme-state.incomplete {
  background: var(--af-control-hover);
  color: var(--af-muted);
}

.scheme-status {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheme-actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
}

.icon-button {
  min-width: 24px;
  height: 24px;
  padding: 0 5px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--af-muted);
  font-size: 14px;
  line-height: 1;
  transition: background 160ms ease-out, color 160ms ease-out;
}

.icon-button:hover:not(:disabled) {
  background: var(--af-soft);
  color: var(--af-text);
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.scheme-add {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.add-button {
  width: 100%;
  min-height: 34px;
  border-style: dashed;
  border-color: var(--af-control-border);
  background: transparent;
  color: var(--af-muted);
  font-weight: 400;
}

.add-button:hover {
  border-color: var(--af-accent);
  background: transparent;
  color: var(--af-accent);
}

@media (max-width: 760px) {
  .scheme-card {
    flex-wrap: wrap;
  }

  .scheme-status {
    flex-basis: 100%;
    order: 5;
    text-align: left;
  }
}
</style>
