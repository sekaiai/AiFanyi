<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from 'vue'
import { useUiLocale } from '../composables/useUiLocale'
import { GUIDE_KEYS } from '../core/i18n'
import { uid } from '../core/settings'
import { SCHEME_GUIDES } from '../core/scheme-guides'
import { describeMissingConfig } from '../core/translate'
import type { SchemeSettings, SchemeType } from '../core/types'

const props = defineProps<{
  visible: boolean
  initialScheme: SchemeSettings | null
  testScheme?: ((scheme: SchemeSettings) => Promise<string>) | undefined
  demoMode?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [scheme: SchemeSettings]
}>()

const { t } = useUiLocale()

// 免密方案在指南徽标中显示「无需密钥」，其余方案显示「配置随账号同步」。
const KEYLESS_TYPES: SchemeType[] = ['google', 'baiduWeb', 'bing', 'tencent', 'youdao', 'mymemory']

const draft = ref<SchemeSettings>(createScheme('ai'))
const guideExpanded = ref(true)
const saving = ref(false)
const saveError = ref('')
const guide = computed(() => {
  const keys = GUIDE_KEYS[draft.value.type]
  const hrefs = SCHEME_GUIDES[draft.value.type]
  return {
    title: t(keys.title),
    tagline: t(keys.tagline),
    steps: keys.steps.map((key) => t(key)),
    links: keys.links.map((key, index) => ({ label: t(key), href: hrefs[index] ?? '' })),
  }
})

// 弹窗每次开合都作废上一次保存尝试，避免"测试还在进行时关闭弹窗，结果回来后仍写入方案"。
let saveAttempt = 0

watch(() => props.visible, (visible) => {
  saveAttempt += 1
  if (visible) {
    draft.value = props.initialScheme ? structuredClone(toRaw(props.initialScheme)) : createScheme('ai')
    guideExpanded.value = true
    saving.value = false
    saveError.value = ''
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
  if (type === 'baiduAi') return { id, type, enabled, appId: '', secretKey: '', modelType: 'nmt' }
  if (type === 'baiduWeb') return { id, type, enabled }
  if (type === 'bing') return { id, type, enabled }
  if (type === 'tencent') return { id, type, enabled }
  if (type === 'youdao') return { id, type, enabled }
  if (type === 'mymemory') return { id, type, enabled }
  if (type === 'volcengine') return { id, type, enabled, accessKeyId: '', secretAccessKey: '', region: 'cn-north-1' }
  return { id, type, enabled, label: '', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: '', model: 'tencent/Hunyuan-MT-7B', timeoutMs: 20000 }
}

function handleTypeChange(type: SchemeType): void {
  if (type === draft.value.type) return
  draft.value = createScheme(type, draft.value.id, draft.value.enabled)
  guideExpanded.value = true
  saveError.value = ''
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function close(): void {
  emit('close')
}

async function save(): Promise<void> {
  if (saving.value) return
  const attempt = ++saveAttempt
  const scheme = structuredClone(toRaw(draft.value))
  if (scheme.type === 'ai') scheme.label = scheme.label.trim().slice(0, 50)

  const missing = describeMissingConfig(scheme)
  if (missing) {
    saveError.value = missing
    return
  }

  saveError.value = ''
  if (props.testScheme) {
    saving.value = true
    try {
      await props.testScheme(scheme)
    } catch (error) {
      if (attempt !== saveAttempt) return
      saving.value = false
      saveError.value = t('editor.testFailed', { error: error instanceof Error ? error.message : t('editor.unknownError') })
      return
    }
    if (attempt !== saveAttempt) return
    saving.value = false
  }

  emit('save', scheme)
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop" role="presentation" @click.self="close">
    <section class="editor-modal" data-testid="scheme-editor" role="dialog" aria-modal="true" aria-labelledby="scheme-editor-title">
      <div class="modal-header">
        <div>
          <p class="modal-kicker">{{ t('editor.kicker') }}</p>
          <h2 id="scheme-editor-title">{{ initialScheme ? t('editor.editTitle') : t('editor.addTitle') }}</h2>
        </div>
        <button class="icon-button close-button" type="button" :aria-label="t('editor.close')" :title="t('editor.close')" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <label class="field wide">
          <span class="field-label">{{ t('editor.typeLabel') }}</span>
          <select :value="draft.type" data-testid="scheme-editor-type" :disabled="draft.type === 'google'" @change="handleTypeChange(($event.target as HTMLSelectElement).value as SchemeType)">
            <option value="baidu">{{ t('schemes.type.baidu') }}</option>
            <option value="baiduAi">{{ t('schemes.type.baiduAi') }}</option>
            <option value="baiduWeb">{{ t('schemes.type.baiduWeb') }}</option>
            <option value="bing">{{ t('schemes.type.bing') }}</option>
            <option value="tencent">{{ t('schemes.type.tencent') }}</option>
            <option value="youdao">{{ t('schemes.type.youdao') }}</option>
            <option value="mymemory">{{ t('schemes.type.mymemory') }}</option>
            <option value="volcengine">{{ t('schemes.type.volcengine') }}</option>
            <option value="ai">{{ t('schemes.type.ai') }}</option>
            <option value="deepl">{{ t('schemes.type.deepl') }}</option>
            <option v-if="draft.type === 'google'" value="google">{{ t('schemes.type.google') }}</option>
            <option value="googleCloud">{{ t('schemes.type.googleCloud') }}</option>
          </select>
        </label>

        <template v-if="draft.type === 'deepl'">
          <label class="field"><span class="field-label">Auth Key</span><input v-model="draft.authKey" type="password" autocomplete="off" placeholder="DeepL-Auth-Key" /></label>
          <label class="field">
            <span class="field-label">{{ t('editor.api') }}</span>
            <select v-model="draft.endpoint">
              <option value="free">{{ t('editor.deeplFree') }}</option>
              <option value="pro">{{ t('editor.deeplPro') }}</option>
            </select>
          </label>
        </template>
        <p v-else-if="draft.type === 'google'" class="field-hint wide">{{ t('editor.hint.google') }}</p>
        <template v-else-if="draft.type === 'googleCloud'">
          <label class="field wide">
            <span class="field-label">API Key</span>
            <input v-model="draft.apiKey" type="password" autocomplete="off" />
          </label>
        </template>
        <template v-else-if="draft.type === 'baidu'">
          <p class="field-hint wide">{{ t('editor.hint.baidu') }}</p>
          <label class="field"><span class="field-label">AppID</span><input v-model="draft.appId" autocomplete="off" :placeholder="t('editor.placeholder.baiduAppId')" /></label>
          <label class="field">
            <span class="field-label">{{ t('editor.secretKey') }}</span>
            <input v-model="draft.secretKey" type="password" autocomplete="off" :placeholder="t('editor.placeholder.baiduSecret')" />
          </label>
        </template>
        <template v-else-if="draft.type === 'baiduAi'">
          <p class="field-hint wide">{{ t('editor.hint.baiduAi') }}</p>
          <label class="field"><span class="field-label">AppID</span><input v-model="draft.appId" autocomplete="off" :placeholder="t('editor.placeholder.baiduAppId')" /></label>
          <label class="field">
            <span class="field-label">{{ t('editor.secretKey') }}</span>
            <input v-model="draft.secretKey" type="password" autocomplete="off" :placeholder="t('editor.placeholder.baiduSecret')" />
          </label>
          <label class="field wide">
            <span class="field-label">{{ t('editor.modelLabel') }}</span>
            <select v-model="draft.modelType">
              <option value="nmt">{{ t('editor.model.machine') }}</option>
              <option value="llm">{{ t('editor.model.llm') }}</option>
            </select>
          </label>
        </template>
        <p v-else-if="draft.type === 'baiduWeb'" class="field-hint wide">{{ t('editor.hint.baiduWeb') }}</p>
        <p v-else-if="draft.type === 'bing'" class="field-hint wide">{{ t('editor.hint.bing') }}</p>
        <p v-else-if="draft.type === 'tencent'" class="field-hint wide">{{ t('editor.hint.tencent') }}</p>
        <p v-else-if="draft.type === 'youdao'" class="field-hint wide">{{ t('editor.hint.youdao') }}</p>
        <p v-else-if="draft.type === 'mymemory'" class="field-hint wide">{{ t('editor.hint.mymemory') }}</p>
        <template v-else-if="draft.type === 'volcengine'">
          <p class="field-hint wide">{{ t('editor.hint.volcengine') }}</p>
          <label class="field"><span class="field-label">{{ t('editor.volcAkLabel') }}</span><input v-model="draft.accessKeyId" autocomplete="off" :placeholder="t('editor.placeholder.volcAk')" /></label>
          <label class="field">
            <span class="field-label">{{ t('editor.volcSkLabel') }}</span>
            <input v-model="draft.secretAccessKey" type="password" autocomplete="off" :placeholder="t('editor.placeholder.volcSk')" />
          </label>
          <label class="field wide"><span class="field-label">{{ t('editor.volcRegion') }}</span><input v-model="draft.region" autocomplete="off" placeholder="cn-north-1" /></label>
        </template>
        <template v-else>
          <label class="field wide"><span class="field-label">{{ t('editor.aiTitle') }}</span><input v-model="draft.label" type="text" maxlength="50" :placeholder="t('editor.aiTitlePlaceholder')" /></label>
          <label class="field wide"><span class="field-label">{{ t('editor.aiUrl') }}</span><input v-model="draft.apiUrl" placeholder="https://api.example.com/v1/chat/completions" /></label>
          <label class="field"><span class="field-label">{{ t('editor.aiModel') }}</span><input v-model="draft.model" placeholder="gpt-4o-mini" /></label>
          <label class="field">
            <span class="field-label">{{ t('editor.aiKey') }}</span>
            <input v-model="draft.apiKey" type="password" autocomplete="off" />
          </label>
          <label class="range-field wide">
            <span class="range-label">{{ t('editor.aiTimeout') }} <output>{{ Math.round(draft.timeoutMs / 1000) }} {{ t('editor.aiSeconds') }}</output></span>
            <input v-model.number="draft.timeoutMs" type="range" min="5000" max="60000" step="1000" />
          </label>
        </template>
      </div>

      <section class="scheme-guide" data-testid="scheme-guide" :data-expanded="guideExpanded ? 'true' : 'false'">
        <button
          class="guide-toggle"
          type="button"
          data-testid="scheme-guide-toggle"
          :aria-expanded="guideExpanded"
          aria-controls="scheme-guide-body"
          @click="guideExpanded = !guideExpanded"
        >
          <span class="guide-toggle-label">{{ t('guide.header') }}</span>
          <span class="guide-toggle-title">{{ guide.title }}</span>
          <span class="guide-badge">{{ KEYLESS_TYPES.includes(draft.type) ? t('guide.badge.keyless') : t('guide.badge.synced') }}</span>
          <span class="guide-chevron" aria-hidden="true"></span>
        </button>
        <div v-show="guideExpanded" id="scheme-guide-body" class="guide-body" data-testid="scheme-guide-body">
          <p class="guide-tagline">{{ guide.tagline }}</p>
          <div>
            <p class="guide-block-label">{{ t('guide.howTo') }}</p>
            <ol class="guide-steps">
              <li v-for="step in guide.steps" :key="step">{{ step }}</li>
            </ol>
          </div>
          <div>
            <p class="guide-block-label">{{ t('guide.officialLinks') }}</p>
            <ul class="guide-links">
              <li v-for="link in guide.links" :key="link.href"><a :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }} ↗</a></li>
            </ul>
          </div>
        </div>
      </section>

      <p v-if="demoMode" class="modal-notice">{{ t('editor.notice.demo') }}</p>
      <div class="modal-footer">
        <p v-if="saveError" class="save-error" role="alert" data-testid="scheme-editor-error">{{ saveError }}</p>
        <button class="button button-secondary" type="button" data-testid="scheme-editor-cancel" @click="close">{{ t('editor.cancel') }}</button>
        <button
          class="button button-primary"
          type="button"
          data-testid="scheme-editor-save"
          :disabled="saving"
          :aria-busy="saving"
          @click="save"
        >{{ saving ? t('editor.testing') : t('editor.save') }}</button>
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
  font-size: 14px;
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

.field.wide,
.range-field.wide {
  grid-column: 1 / -1;
}

.scheme-guide {
  border-top: 1px solid var(--af-line);
  transition: background 160ms ease-out;
}

.scheme-guide[data-expanded="true"] {
  background: color-mix(in srgb, var(--af-accent) 4%, var(--af-panel));
}

.guide-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 20px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.guide-toggle:hover {
  background: var(--af-control-hover);
}

.guide-toggle-label {
  flex: none;
  color: var(--af-accent);
  font-size: 14px;
  font-weight: 720;
  letter-spacing: .08em;
}

.guide-toggle-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guide-chevron {
  flex: none;
  width: 7px;
  height: 7px;
  margin-left: 2px;
  border-right: 1.5px solid var(--af-muted);
  border-bottom: 1.5px solid var(--af-muted);
  transform: rotate(-45deg);
  transition: transform 160ms ease-out;
}

.scheme-guide[data-expanded="true"] .guide-chevron {
  transform: rotate(45deg);
}

.guide-badge {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--af-accent) 12%, transparent);
  color: var(--af-accent);
  font-size: 14px;
  white-space: nowrap;
}

.guide-body {
  display: grid;
  gap: 14px;
  padding: 2px 20px 18px;
}

.guide-tagline {
  margin: 0;
  color: var(--af-muted);
  font-size: 14px;
  line-height: 1.6;
}

.guide-block-label {
  margin: 0 0 7px;
  color: var(--af-muted);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: .04em;
}

.guide-steps {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.guide-steps li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  color: var(--af-muted);
  font-size: 14px;
  line-height: 1.6;
}

.guide-steps li::before {
  counter-increment: step;
  content: counter(step);
  color: var(--af-accent);
  font-size: 14px;
  font-weight: 720;
  line-height: 1.75;
}

.guide-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guide-links a {
  color: var(--af-accent);
  font-size: 14px;
  text-decoration: none;
}

.guide-links a:hover {
  text-decoration: underline;
}

.field-hint,
.modal-notice {
  margin: 0;
  color: var(--af-muted);
  font-size: 14px;
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

.save-error {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0 auto 0 0;
  color: oklch(55% 0.19 25);
  font-size: 14px;
  line-height: 1.55;
}

.button-primary {
  background: var(--af-accent);
  color: var(--af-accent-contrast);
}

.button-primary:hover:not(:disabled) {
  background: var(--af-accent-hover);
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

  .modal-footer {
    flex-wrap: wrap;
  }

  .save-error {
    flex: 1 0 100%;
    margin-right: 0;
  }

  .guide-toggle {
    gap: 6px;
    padding: 6px 14px;
  }

  .guide-toggle-title {
    font-size: 14px;
  }

  .guide-body {
    padding: 2px 14px 16px;
  }
}
</style>
