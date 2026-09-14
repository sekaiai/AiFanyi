<script setup lang="ts">
import { onUnmounted, ref, shallowRef, toRaw } from 'vue'
import { useUiLocale } from '../composables/useUiLocale'
import type { SchemeSettings } from '../core/types'
import { hasRequiredConfig } from '../core/translate'
import { formatUsageCounter, type UsageStats } from '../core/usage'
import SchemeEditorModal from './SchemeEditorModal.vue'

const schemes = defineModel<SchemeSettings[]>({ required: true })

const props = defineProps<{
  testScheme?: (scheme: SchemeSettings) => Promise<string>
  demoMode?: boolean
  usage?: UsageStats | null
}>()

const { t, locale } = useUiLocale()

/** 方案显示名：自定义 AI 优先使用用户填写的标题，留空回退为类型默认名。 */
function schemeName(scheme: SchemeSettings): string {
  return scheme.type === 'ai' && scheme.label.trim() ? scheme.label.trim() : t(`schemes.type.${scheme.type}`)
}

const testingSchemeId = shallowRef('')
const editorVisible = ref(false)
const editorDraft = ref<SchemeSettings | null>(null)

interface SchemeTestOutcome {
  text: string
  tone: 'fast' | 'mid' | 'slow' | 'error' | 'idle'
}

const schemeTestStatus = ref<Record<string, SchemeTestOutcome>>({})

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
    schemeTestStatus.value[scheme.id] = { text: t('schemes.testIncomplete'), tone: 'error' }
    return
  }
  testingSchemeId.value = scheme.id
  schemeTestStatus.value[scheme.id] = { text: t('schemes.testing'), tone: 'idle' }
  const startedAt = performance.now()
  try {
    await props.testScheme(scheme)
    const latencyMs = Math.round(performance.now() - startedAt)
    schemeTestStatus.value[scheme.id] = { text: t('schemes.testOk', { ms: latencyMs }), tone: speedTone(latencyMs) }
  } catch (error) {
    schemeTestStatus.value[scheme.id] = { text: error instanceof Error ? error.message : t('schemes.testFail'), tone: 'error' }
  } finally {
    testingSchemeId.value = ''
  }
}
</script>

<template>
  <section class="af-card">
    <h2 class="section-title">{{ t('section.sentence') }}</h2>
    <p v-if="demoMode" class="notice">{{ t('schemes.notice.demo') }}</p>

    <div class="scheme-list">
      <div v-for="(scheme, index) in schemes" :key="scheme.id" class="scheme-card" :class="{ 'is-off': !scheme.enabled }" :data-testid="`scheme-card-${scheme.type}`">
        <span class="scheme-order">{{ index + 1 }}</span>
        <label class="switch-field scheme-switch">
          <input v-model="scheme.enabled" type="checkbox" class="checkbox" :data-testid="`scheme-toggle-${scheme.id}`" />
          <span class="scheme-name">{{ schemeName(scheme) }}</span>
        </label>
        <span v-if="scheme.type === 'google'" class="scheme-badge">{{ t('schemes.default') }}</span>
        <span v-if="usage" class="scheme-usage" :data-testid="`scheme-usage-${scheme.id}`">{{ formatUsageCounter(usage.sentence[scheme.id], locale) }}</span>
        <span class="settings-status scheme-status" :class="schemeTestStatus[scheme.id]?.tone" :title="schemeTestStatus[scheme.id]?.text ?? ''">{{ schemeTestStatus[scheme.id]?.text ?? '' }}</span>
        <button class="button button-primary" type="button" :data-testid="`scheme-test-${scheme.type}`" :disabled="testingSchemeId === scheme.id || !testScheme" @click="handleTestScheme(scheme)">{{ t('schemes.test') }}</button>
        <div class="scheme-actions">
          <button class="icon-button" type="button" :title="t('schemes.moveUp')" :disabled="index === 0" @click="moveScheme(scheme.id, -1)">↑</button>
          <button class="icon-button" type="button" :title="t('schemes.moveDown')" :disabled="index === schemes.length - 1" @click="moveScheme(scheme.id, 1)">↓</button>
          <button class="icon-button" type="button" :data-testid="`scheme-edit-${scheme.id}`" :title="t('schemes.edit')" @click="openEditScheme(scheme)">✎</button>
          <button
            class="icon-button"
            type="button"
            :class="{ 'icon-button-danger': pendingDeleteId === scheme.id }"
            :title="scheme.type === 'google' ? t('schemes.defaultScheme') : pendingDeleteId === scheme.id ? t('schemes.confirmDelete') : t('schemes.delete')"
            :disabled="scheme.type === 'google'"
            @click="requestRemoveScheme(scheme.id)"
          >{{ pendingDeleteId === scheme.id ? t('schemes.confirm') : '✕' }}</button>
        </div>
      </div>
    </div>

    <div class="scheme-add">
      <button class="button button-secondary add-button" type="button" data-testid="add-scheme" @click="openAddScheme">{{ t('schemes.add') }}</button>
    </div>

    <SchemeEditorModal :visible="editorVisible" :initial-scheme="editorDraft" :test-scheme="testScheme" :demo-mode="demoMode" @close="closeEditor" @save="saveScheme" />
  </section>
</template>

<style scoped>
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

.button-primary {
  color: var(--af-accent);
}

.switch-field {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 8px;
  user-select: none;
  cursor: pointer;
}

.scheme-list {
  display: grid;
  gap: 8px;
}

.scheme-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
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
  overflow: hidden;
  font-size: 14px;
  font-weight: 640;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheme-switch {
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
  .scheme-status {
    flex-basis: 100%;
    order: 5;
    text-align: left;
  }
}
</style>
