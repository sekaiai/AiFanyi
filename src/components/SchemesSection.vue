<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, toRaw } from 'vue'
import { TARGET_LANGUAGES } from '../core/settings'
import type { SchemeOrder, SchemeSettings, SchemeType } from '../core/types'
import { hasRequiredConfig } from '../core/translate'
import { formatUsageCounter, type UsageStats } from '../core/usage'
import SchemeEditorModal from './SchemeEditorModal.vue'

const schemes = defineModel<SchemeSettings[]>({ required: true })
const targetLanguage = defineModel<string>('targetLanguage', { required: true })
const schemeOrder = defineModel<SchemeOrder>('schemeOrder', { required: true })

const props = defineProps<{
  testScheme?: (scheme: SchemeSettings) => Promise<string>
  demoMode?: boolean
  usage?: UsageStats | null
  /** 是否渲染本机同步开关（演示模式不传则不渲染）。 */
  showSync?: boolean
  /** 本机是否参与设置同步；仅 showSync 为 true 时有意义。 */
  syncEnabled?: boolean
}>()

const emit = defineEmits<{
  toggleSync: [enabled: boolean]
}>()

const SYNC_FIELD_TITLE = '将全部设置（含各翻译方案与密钥）通过浏览器账号在登录的设备间自动同步；取消勾选后设置仅保存在本机，不再上传，也不会接收其他设备的改动。'

const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  ai: '自定义 AI',
  baidu: '百度翻译',
  baiduAi: '百度大模型翻译',
  volcengine: '火山引擎',
  deepl: 'DeepL',
  google: 'Google 翻译（免密钥）',
  googleCloud: 'Google Cloud',
}

/** 方案显示名：自定义 AI 优先使用用户填写的标题，留空回退为类型默认名。 */
function schemeName(scheme: SchemeSettings): string {
  return scheme.type === 'ai' && scheme.label.trim() ? scheme.label.trim() : SCHEME_TYPE_LABELS[scheme.type]
}

const testingSchemeId = shallowRef('')
const editorVisible = ref(false)
const editorDraft = ref<SchemeSettings | null>(null)

interface SchemeTestOutcome {
  text: string
  tone: 'fast' | 'mid' | 'slow' | 'error' | 'idle'
}

const schemeTestStatus = ref<Record<string, SchemeTestOutcome>>({})
const orderHint = computed(() => schemeOrder.value === 'random'
  ? '每次随机挑选可用方案，失败后从剩余方案中随机再试。'
  : '按顺序依次尝试，排在最前面的优先使用。')

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
  if (index === -1) return
  schemes.value.splice(index, 1)
  delete schemeTestStatus.value[id]
}

const pendingDeleteId = ref('')
let deleteConfirmTimer: ReturnType<typeof setTimeout> | undefined

function disarmDelete(): void {
  if (deleteConfirmTimer !== undefined) {
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = undefined
  }
  pendingDeleteId.value = ''
}

function requestRemoveScheme(id: string): void {
  if (pendingDeleteId.value === id) {
    disarmDelete()
    removeScheme(id)
    return
  }
  disarmDelete()
  pendingDeleteId.value = id
  deleteConfirmTimer = setTimeout(disarmDelete, 3000)
}

onUnmounted(disarmDelete)

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
      <h2 class="section-title">句子翻译</h2>
      <div class="head-controls">
        <label class="target-field">
          <span class="field-label">翻译成</span>
          <select v-model="targetLanguage" data-testid="target-language">
            <option v-for="lang in TARGET_LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
          </select>
        </label>
        <label class="target-field">
          <span class="field-label">顺序</span>
          <select v-model="schemeOrder" data-testid="scheme-order">
            <option value="random">随机</option>
            <option value="sequential">依次使用</option>
          </select>
        </label>
        <label v-if="showSync" class="target-field sync-field" :title="SYNC_FIELD_TITLE">
          <input
            type="checkbox"
            class="checkbox"
            :checked="syncEnabled"
            data-testid="sync-toggle"
            @change="emit('toggleSync', ($event.target as HTMLInputElement).checked)"
          />
          <span class="field-label">同步到浏览器账号</span>
        </label>
      </div>
    </div>
    <p class="section-hint">{{ orderHint }}</p>
    <p v-if="demoMode" class="notice">在线演示中的 API 密钥只保存在当前页面内存，刷新后会消失。</p>
    <p v-else class="notice security-notice">配置与密钥通过浏览器账号同步存储，在各设备间自动同步；密钥仅由后台请求使用，网页内容脚本不会接收密钥。</p>

    <div class="scheme-list">
      <div v-for="(scheme, index) in schemes" :key="scheme.id" class="scheme-card" :class="{ 'is-off': !scheme.enabled }" :data-testid="`scheme-card-${scheme.type}`">
        <span class="scheme-order">{{ index + 1 }}</span>
        <label class="switch-field scheme-switch">
          <input v-model="scheme.enabled" type="checkbox" class="checkbox" :data-testid="`scheme-toggle-${scheme.id}`" />
          <span class="scheme-name">{{ schemeName(scheme) }}</span>
        </label>
        <span v-if="scheme.type === 'google'" class="scheme-badge">默认</span>
        <span v-if="usage" class="scheme-usage" :data-testid="`scheme-usage-${scheme.id}`">{{ formatUsageCounter(usage.sentence[scheme.id]) }}</span>
        <span class="settings-status scheme-status" :class="schemeTestStatus[scheme.id]?.tone" :title="schemeTestStatus[scheme.id]?.text ?? ''">{{ schemeTestStatus[scheme.id]?.text ?? '' }}</span>
        <button class="button button-primary" type="button" :data-testid="`scheme-test-${scheme.type}`" :disabled="testingSchemeId === scheme.id || !testScheme" @click="handleTestScheme(scheme)">测试</button>
        <div class="scheme-actions">
          <button class="icon-button" type="button" title="上移" :disabled="index === 0" @click="moveScheme(scheme.id, -1)">↑</button>
          <button class="icon-button" type="button" title="下移" :disabled="index === schemes.length - 1" @click="moveScheme(scheme.id, 1)">↓</button>
          <button class="icon-button" type="button" :data-testid="`scheme-edit-${scheme.id}`" title="编辑" @click="openEditScheme(scheme)">✎</button>
          <button
            class="icon-button"
            type="button"
            :class="{ 'icon-button-danger': pendingDeleteId === scheme.id }"
            :title="scheme.type === 'google' ? '默认方案，不可删除' : pendingDeleteId === scheme.id ? '再次点击确认删除' : '删除'"
            :disabled="scheme.type === 'google'"
            @click="requestRemoveScheme(scheme.id)"
          >{{ pendingDeleteId === scheme.id ? '确认' : '✕' }}</button>
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

.head-controls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
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

.sync-field {
  cursor: pointer;
  user-select: none;
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
  font-weight: 400;
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
  color: var(--af-accent);
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
.scheme-card.is-off .scheme-usage,
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

.scheme-usage {
  flex: none;
  color: var(--af-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.scheme-badge {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--af-accent) 14%, transparent);
  color: var(--af-accent);
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
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

.icon-button.icon-button-danger {
  color: oklch(55% 0.19 25);
  background: color-mix(in srgb, oklch(55% 0.19 25) 12%, transparent);
}

.icon-button.icon-button-danger:hover:not(:disabled) {
  color: oklch(55% 0.19 25);
  background: color-mix(in srgb, oklch(55% 0.19 25) 18%, transparent);
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
