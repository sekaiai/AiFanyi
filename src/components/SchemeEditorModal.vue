<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from 'vue'
import { uid } from '../core/settings'
import { SCHEME_GUIDES } from '../core/scheme-guides'
import type { SchemeSettings, SchemeType } from '../core/types'

const props = defineProps<{
  visible: boolean
  initialScheme: SchemeSettings | null
  demoMode?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [scheme: SchemeSettings]
}>()

const draft = ref<SchemeSettings>(createScheme('deepl'))
const shownSecret = ref(false)
const guide = computed(() => SCHEME_GUIDES[draft.value.type])

watch(() => props.visible, (visible) => {
  if (visible) {
    draft.value = props.initialScheme ? structuredClone(toRaw(props.initialScheme)) : createScheme('deepl')
    shownSecret.value = false
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
}, { immediate: true })

watch(() => props.initialScheme, (scheme) => {
  if (props.visible && scheme) draft.value = structuredClone(toRaw(scheme))
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function createScheme(type: SchemeType, id = uid(), enabled = true): SchemeSettings {
  if (type === 'deepl') return { id, type, enabled, authKey: '', endpoint: 'free' }
  if (type === 'google') return { id, type, enabled }
  if (type === 'googleCloud') return { id, type, enabled, apiKey: '' }
  if (type === 'baidu') return { id, type, enabled, appId: '', secretKey: '' }
  if (type === 'volcengine') return { id, type, enabled, accessKeyId: '', secretAccessKey: '', region: 'cn-north-1' }
  return { id, type, enabled, apiUrl: '', apiKey: '', model: '', timeoutMs: 20000 }
}

function handleTypeChange(type: SchemeType): void {
  if (type === draft.value.type) return
  draft.value = createScheme(type, draft.value.id, draft.value.enabled)
  shownSecret.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function close(): void {
  emit('close')
}

function save(): void {
  emit('save', structuredClone(toRaw(draft.value)))
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop" role="presentation" @click.self="close">
    <section class="editor-modal" data-testid="scheme-editor" role="dialog" aria-modal="true" aria-labelledby="scheme-editor-title">
      <div class="modal-header">
        <div>
          <p class="modal-kicker">翻译方案</p>
          <h2 id="scheme-editor-title">{{ initialScheme ? '编辑翻译方案' : '添加翻译方案' }}</h2>
        </div>
        <button class="icon-button close-button" type="button" aria-label="关闭" title="关闭" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <label class="field wide">
          <span class="field-label">方案类型</span>
          <select :value="draft.type" data-testid="scheme-editor-type" @change="handleTypeChange(($event.target as HTMLSelectElement).value as SchemeType)">
            <option value="deepl">DeepL</option>
            <option value="google">Google 翻译（免密钥）</option>
            <option value="googleCloud">Google Cloud</option>
            <option value="baidu">百度翻译</option>
            <option value="volcengine">火山引擎</option>
            <option value="ai">AI</option>
          </select>
        </label>

        <template v-if="draft.type === 'deepl'">
          <label class="field"><span class="field-label">Auth Key</span><input v-model="draft.authKey" type="password" autocomplete="off" placeholder="DeepL-Auth-Key" /></label>
          <label class="field">
            <span class="field-label">接口</span>
            <select v-model="draft.endpoint">
              <option value="free">免费（api-free.deepl.com）</option>
              <option value="pro">Pro（api.deepl.com）</option>
            </select>
          </label>
        </template>
        <p v-else-if="draft.type === 'google'" class="field-hint wide">使用免费接口 translate.googleapis.com，无需额外配置。</p>
        <template v-else-if="draft.type === 'googleCloud'">
          <label class="field wide">
            <span class="field-label">API Key</span>
            <span class="key-row">
              <input v-model="draft.apiKey" :type="shownSecret ? 'text' : 'password'" autocomplete="off" />
              <button class="button button-secondary" type="button" @click="shownSecret = !shownSecret">{{ shownSecret ? '隐藏' : '显示' }}</button>
            </span>
          </label>
        </template>
        <template v-else-if="draft.type === 'baidu'">
          <p class="field-hint wide">使用百度通用文本翻译 API，源语言自动检测。密钥仅保存在本地设置中。</p>
          <label class="field"><span class="field-label">AppID</span><input v-model="draft.appId" autocomplete="off" placeholder="百度翻译 AppID" /></label>
          <label class="field">
            <span class="field-label">密钥</span>
            <span class="key-row">
              <input v-model="draft.secretKey" :type="shownSecret ? 'text' : 'password'" autocomplete="off" placeholder="百度翻译密钥" />
              <button class="button button-secondary" type="button" @click="shownSecret = !shownSecret">{{ shownSecret ? '隐藏' : '显示' }}</button>
            </span>
          </label>
        </template>
        <template v-else-if="draft.type === 'volcengine'">
          <p class="field-hint wide">使用火山引擎机器翻译文本接口，源语言自动检测。密钥仅保存在本地设置中。</p>
          <label class="field"><span class="field-label">访问密钥 ID（Access Key ID）</span><input v-model="draft.accessKeyId" autocomplete="off" placeholder="火山引擎 Access Key ID" /></label>
          <label class="field">
            <span class="field-label">访问密钥（Secret Access Key）</span>
            <span class="key-row">
              <input v-model="draft.secretAccessKey" :type="shownSecret ? 'text' : 'password'" autocomplete="off" placeholder="火山引擎 Secret Access Key" />
              <button class="button button-secondary" type="button" @click="shownSecret = !shownSecret">{{ shownSecret ? '隐藏' : '显示' }}</button>
            </span>
          </label>
          <label class="field wide"><span class="field-label">地域</span><input v-model="draft.region" autocomplete="off" placeholder="cn-north-1" /></label>
        </template>
        <template v-else>
          <label class="field wide"><span class="field-label">AI 地址</span><input v-model="draft.apiUrl" placeholder="https://api.example.com/v1/chat/completions" /></label>
          <label class="field"><span class="field-label">模型</span><input v-model="draft.model" placeholder="gpt-4o-mini" /></label>
          <label class="field">
            <span class="field-label">API 密钥</span>
            <span class="key-row">
              <input v-model="draft.apiKey" :type="shownSecret ? 'text' : 'password'" autocomplete="off" />
              <button class="button button-secondary" type="button" @click="shownSecret = !shownSecret">{{ shownSecret ? '隐藏' : '显示' }}</button>
            </span>
          </label>
          <label class="range-field wide">
            <span class="range-label">超时 <output>{{ Math.round(draft.timeoutMs / 1000) }} 秒</output></span>
            <input v-model.number="draft.timeoutMs" type="range" min="5000" max="60000" step="1000" />
          </label>
        </template>
      </div>

      <section class="scheme-guide" aria-labelledby="scheme-guide-title">
        <div class="guide-heading">
          <div>
            <p class="guide-kicker">新手指南</p>
            <h3 id="scheme-guide-title">{{ guide.title }}配置指南</h3>
          </div>
          <span class="guide-badge">{{ draft.type === 'google' ? '无需密钥' : '密钥仅本地保存' }}</span>
        </div>
        <div class="guide-note">
          <h4>优点与注意事项</h4>
          <p><strong>优点：</strong>{{ guide.recommendation }} <strong>注意事项：</strong>{{ guide.requirements }}</p>
        </div>
        <div class="guide-columns">
          <div>
            <h4>怎么用</h4>
            <ol class="guide-steps">
              <li v-for="step in guide.steps" :key="step">{{ step }}</li>
            </ol>
          </div>
          <div>
            <h4>官方入口</h4>
            <ul class="guide-links">
              <li v-for="link in guide.links" :key="link.href"><a :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }} ↗</a></li>
            </ul>
          </div>
        </div>
      </section>

      <p v-if="demoMode" class="modal-notice">在线演示中的密钥只保存在当前页面内存，刷新后会消失。</p>
      <div class="modal-footer">
        <button class="button button-secondary" type="button" data-testid="scheme-editor-cancel" @click="close">取消</button>
        <button class="button button-primary" type="button" data-testid="scheme-editor-save" @click="save">保存方案</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(15 20 30 / 45%);
  backdrop-filter: blur(3px);
}

.editor-modal {
  width: min(680px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  border: 1px solid var(--af-line);
  border-radius: 16px;
  background: var(--af-panel);
  color: var(--af-text);
  box-shadow: 0 24px 70px rgb(20 28 44 / 24%);
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.modal-header {
  border-bottom: 1px solid var(--af-line);
}

.modal-kicker {
  margin: 0 0 3px;
  color: var(--af-accent);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: .08em;
}

.modal-header h2 {
  margin: 0;
  font-size: 17px;
}

.close-button {
  min-width: 32px;
  min-height: 32px;
}

.modal-body {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 20px;
}

.field,
.range-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  align-content: start;
}

.field.wide,
.range-field.wide {
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
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out;
}

.field :is(input:not([type="color"]), select, textarea):hover {
  border-color: var(--af-control-border-hover);
}

.field :is(input:not([type="color"]), select, textarea):focus {
  border-color: var(--af-accent);
  outline: 0;
  box-shadow: 0 0 0 3px var(--af-focus-ring);
}

.key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.scheme-guide {
  margin: 0 20px 18px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--af-accent) 26%, var(--af-line));
  border-radius: 11px;
  background: color-mix(in srgb, var(--af-accent) 5%, var(--af-panel));
}

.guide-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.guide-kicker {
  margin: 0 0 3px;
  color: var(--af-accent);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: .08em;
}

.guide-heading h3 {
  margin: 0;
  font-size: 14px;
}

.guide-badge {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--af-accent) 12%, transparent);
  color: var(--af-accent);
  font-size: 11px;
}

.guide-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--af-accent) 8%, transparent);
}

.guide-note h4 {
  margin-bottom: 5px;
}

.guide-note p {
  margin: 0;
  color: var(--af-muted);
  font-size: 12px;
  line-height: 1.6;
}

.guide-note strong {
  color: var(--af-text);
  font-weight: 650;
}

.guide-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.35fr) minmax(180px, .85fr);
}

.scheme-guide h4 {
  margin: 0 0 7px;
  color: var(--af-text);
  font-size: 12px;
}

.guide-steps,
.guide-links {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--af-muted);
  font-size: 12px;
  line-height: 1.55;
}

.guide-links {
  padding-left: 16px;
}

.guide-links a {
  color: var(--af-accent);
  text-decoration: none;
}

.guide-links a:hover {
  text-decoration: underline;
}

.field-hint,
.modal-notice {
  margin: 0;
  color: var(--af-muted);
  font-size: 12px;
  line-height: 1.55;
}

.modal-notice {
  margin: 0 20px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--af-control-hover);
}

.modal-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--af-line);
}

.button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-weight: 600;
}

.button-secondary {
  border-color: var(--af-control-border);
  background: var(--af-control-background);
  color: var(--af-text);
}

.button-primary {
  background: var(--af-accent);
  color: var(--af-accent-contrast);
}

.icon-button {
  min-width: 30px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--af-control-border);
  border-radius: 7px;
  background: var(--af-control-background);
  color: var(--af-text);
  line-height: 1;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--af-accent);
}

@media (max-width: 600px) {
  .modal-body {
    grid-template-columns: 1fr;
  }

  .guide-columns {
    grid-template-columns: 1fr;
  }
}
</style>
