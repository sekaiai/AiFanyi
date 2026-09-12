<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { TARGET_LANGUAGES, uid } from '../core/settings'
import type { SchemeSettings, SchemeType } from '../core/types'
import { hasRequiredConfig } from '../core/translate'

const schemes = defineModel<SchemeSettings[]>({ required: true })
const targetLanguage = defineModel<string>('targetLanguage', { required: true })

const props = defineProps<{
  testScheme?: (schemeId: string) => Promise<string>
  demoMode?: boolean
}>()

const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  deepl: 'DeepL',
  google: 'Google 翻译',
  googleCloud: 'Google Cloud',
  ai: 'AI',
}

const newSchemeType = ref<SchemeType>('deepl')
const shownSchemeKeys = ref<Record<string, boolean>>({})
const testingSchemeId = shallowRef('')

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

function addScheme(): void {
  const id = uid()
  const type = newSchemeType.value
  if (type === 'deepl') schemes.value.push({ id, type, enabled: true, authKey: '', endpoint: 'free' })
  else if (type === 'google') schemes.value.push({ id, type, enabled: true })
  else if (type === 'googleCloud') schemes.value.push({ id, type, enabled: true, apiKey: '' })
  else schemes.value.push({ id, type, enabled: true, apiUrl: '', apiKey: '', model: '', timeoutMs: 20000 })
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

function toggleSchemeKey(id: string): void {
  shownSchemeKeys.value[id] = !shownSchemeKeys.value[id]
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
    await props.testScheme(scheme.id)
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
    <h2 class="section-title">翻译方案</h2>
    <p class="section-hint">按顺序依次尝试，排在最前面的优先使用；单词查询始终内置 freedictionaryapi 兜底。</p>
    <p v-if="demoMode" class="notice">在线演示中的 API 密钥只保存在当前页面内存，刷新后会消失。</p>

    <label class="field target-field">
      <span class="field-label">翻译目标语言</span>
      <select v-model="targetLanguage" data-testid="target-language">
        <option v-for="lang in TARGET_LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
      </select>
    </label>

    <div class="scheme-list">
      <div v-for="(scheme, index) in schemes" :key="scheme.id" class="scheme-card" :data-testid="`scheme-card-${scheme.type}`">
        <div class="scheme-header">
          <label class="switch-field scheme-switch">
            <input v-model="scheme.enabled" type="checkbox" :data-testid="`scheme-toggle-${scheme.id}`" />
            <span class="scheme-name">{{ SCHEME_TYPE_LABELS[scheme.type] }}</span>
          </label>
          <div class="scheme-actions">
            <button class="icon-button" type="button" title="上移" :disabled="index === 0" @click="moveScheme(scheme.id, -1)">↑</button>
            <button class="icon-button" type="button" title="下移" :disabled="index === schemes.length - 1" @click="moveScheme(scheme.id, 1)">↓</button>
            <button class="icon-button" type="button" title="删除" @click="removeScheme(scheme.id)">✕</button>
          </div>
        </div>
        <div class="scheme-body">
          <template v-if="scheme.type === 'deepl'">
            <label class="field"><span class="field-label">Auth Key</span><input v-model="scheme.authKey" type="password" autocomplete="off" placeholder="DeepL-Auth-Key" /></label>
            <label class="field">
              <span class="field-label">接口</span>
              <select v-model="scheme.endpoint">
                <option value="free">免费（api-free.deepl.com）</option>
                <option value="pro">Pro（api.deepl.com）</option>
              </select>
            </label>
          </template>
          <p v-else-if="scheme.type === 'google'" class="field-hint">使用免费接口 translate.googleapis.com，无需额外配置。</p>
          <template v-else-if="scheme.type === 'googleCloud'">
            <label class="field wide key-field">
              <span class="field-label">API Key</span>
              <span class="key-row">
                <input v-model="scheme.apiKey" :type="shownSchemeKeys[scheme.id] ? 'text' : 'password'" autocomplete="off" />
                <button class="button button-secondary" type="button" @click="toggleSchemeKey(scheme.id)">{{ shownSchemeKeys[scheme.id] ? '隐藏' : '显示' }}</button>
              </span>
            </label>
          </template>
          <template v-else>
            <label class="field wide"><span class="field-label">AI 地址</span><input v-model="scheme.apiUrl" placeholder="https://api.example.com/v1/chat/completions" /></label>
            <label class="field"><span class="field-label">模型</span><input v-model="scheme.model" placeholder="gpt-4o-mini" /></label>
            <label class="field key-field">
              <span class="field-label">API 密钥</span>
              <span class="key-row">
                <input v-model="scheme.apiKey" :type="shownSchemeKeys[scheme.id] ? 'text' : 'password'" autocomplete="off" />
                <button class="button button-secondary" type="button" @click="toggleSchemeKey(scheme.id)">{{ shownSchemeKeys[scheme.id] ? '隐藏' : '显示' }}</button>
              </span>
            </label>
            <label class="range-field">
              <span class="range-label">超时 <output>{{ Math.round(scheme.timeoutMs / 1000) }} s</output></span>
              <input v-model.number="scheme.timeoutMs" type="range" min="5000" max="60000" step="1000" />
            </label>
          </template>
        </div>
        <div class="scheme-test">
          <button class="button button-primary" type="button" :data-testid="`scheme-test-${scheme.type}`" :disabled="testingSchemeId === scheme.id || !testScheme" @click="handleTestScheme(scheme)">测试</button>
          <span class="settings-status" :class="schemeTestStatus[scheme.id]?.tone">{{ schemeTestStatus[scheme.id]?.text ?? '' }}</span>
        </div>
      </div>

      <div class="scheme-card scheme-fallback" data-testid="dictionary-fallback">
        <div class="scheme-header">
          <span class="scheme-name">freedictionaryapi</span>
          <span class="field-hint">内置兜底 · 仅单词</span>
        </div>
      </div>
    </div>

    <div class="scheme-add">
      <select v-model="newSchemeType" data-testid="scheme-type" class="add-select">
        <option value="deepl">DeepL</option>
        <option value="google">Google 翻译</option>
        <option value="googleCloud">Google Cloud</option>
        <option value="ai">AI</option>
      </select>
      <button class="button button-secondary" type="button" data-testid="add-scheme" @click="addScheme">添加方案</button>
    </div>
  </section>
</template>

<style scoped>
.schemes-section {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--af-line);
  border-radius: 12px;
  background: var(--af-panel);
  font-size: 13px;
}

.section-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 720;
}

.section-hint {
  margin: 0 0 12px;
  color: var(--af-muted);
  font-size: 12px;
}

.target-field {
  margin: 0 0 12px;
}

.notice,
.field-hint,
.settings-status {
  margin: 4px 0 0;
  color: var(--af-muted);
  font-size: 12px;
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

.field,
.range-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  align-content: start;
}

.field.wide {
  grid-column: 1 / -1;
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

input[type="range"] {
  width: 100%;
}

.range-field input[type="range"] {
  height: 22px;
  margin: 0;
  accent-color: var(--af-accent);
}

.button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-weight: 600;
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
}

.switch-field input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--af-accent);
}

.key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.scheme-list {
  display: grid;
  gap: 12px;
}

.scheme-card {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--af-line);
  border-radius: 10px;
  background: var(--af-control-background);
}

.scheme-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scheme-name {
  font-size: 13px;
  font-weight: 640;
}

.scheme-switch {
  gap: 8px;
}

.scheme-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-button {
  min-width: 30px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  font-size: 13px;
  line-height: 1;
  transition: background 160ms ease-out, border-color 160ms ease-out;
}

.icon-button:hover:not(:disabled) {
  border-color: var(--af-control-border-hover);
  background: var(--af-control-hover);
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.scheme-body {
  display: grid;
  gap: 10px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.scheme-body .field.wide {
  grid-column: 1 / -1;
}

.scheme-test {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scheme-fallback {
  padding: 10px 14px;
}

.scheme-add {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.add-select {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
}

.add-select:focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

@media (max-width: 760px) {
  .scheme-body {
    grid-template-columns: 1fr;
  }
}
</style>
