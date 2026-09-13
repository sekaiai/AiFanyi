<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import Pickr from '@simonwep/pickr'
import '@simonwep/pickr/dist/themes/nano.min.css'

const color = defineModel<string>({ required: true })

const trigger = useTemplateRef<HTMLDivElement>('trigger')

let pickr: Pickr | null = null
let lastEmitted = ''

function toHex8(hsva: Pickr.HSVaColor): string {
  const [r = 0, g = 0, b = 0, a = 1] = hsva.toRGBA()
  const part = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}${part(a * 255)}`
}

onMounted(() => {
  const el = trigger.value
  if (!el) return
  lastEmitted = color.value
  pickr = Pickr.create({
    el,
    theme: 'nano',
    default: color.value,
    comparison: false,
    components: {
      preview: true,
      opacity: true,
      hue: true,
      interaction: {
        hex: true,
        input: true,
      },
    },
  })

  pickr.on('change', (hsva: Pickr.HSVaColor) => {
    lastEmitted = toHex8(hsva)
    color.value = lastEmitted
  })
})

watch(color, (value) => {
  if (!pickr || value === lastEmitted) return
  lastEmitted = value
  pickr.setColor(value, true)
})

onBeforeUnmount(() => {
  pickr?.destroyAndRemove()
  pickr = null
})
</script>

<template>
  <!-- Pickr 会用 .pickr 容器整体替换挂载点（replaceChild），必须挂在内层占位元素上，否则 scoped 祖先选择器失效 -->
  <div class="color-field">
    <div ref="trigger"></div>
  </div>
</template>

<style scoped>
.color-field :deep(.pcr-button) {
  border: 1px solid;
  font-size: 11px;
}
</style>
