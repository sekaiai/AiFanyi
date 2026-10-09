/**
 * 按钮文字可划选：浏览器对 <button> 的 UA 默认是 user-select: none，
 * 拖选不产生选区，划词与悬停取词都拿不到文字。注入可开关的页面样式修复。
 * 只加 user-select 一项，不改任何视觉样式；站点自带 !important 且更具体的规则仍可覆盖本规则。
 * 局限：页面级样式不跨 shadow 边界，Shadow DOM 内的按钮不受影响。
 */

const SELECTABLE_CSS = 'button { user-select: text !important }'

export function createSelectableStyle(): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = SELECTABLE_CSS
  document.documentElement.append(style)
  return style
}