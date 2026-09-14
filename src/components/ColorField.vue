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

  pickr.on('change', (hsva: Pickr.HSVaColor, source: string | null) => {
    // pickr 的真实颜色编辑来源只有 'slider'（取色盘/色相/透明度拖动）与 'input'（hex 输入）。
    // 'swatch' 来自表示法按钮点击 —— setColor 内部即使 silent 也会同步模拟该点击（预设切换的回声即源于此）；
    // null 来自 hex 输入框失焦重算。两者均非颜色编辑，忽略之，避免预设切换被误标为「自定义」。
    if (source !== 'slider' && source !== 'input') return
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

<style >
.color-field .pcr-button {
  border: 1px solid;
  font-size: 11px;
}
.pcr-app {
  font-size: 18px;
}
</style>
