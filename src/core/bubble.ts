import { FONT_STACKS, SHADOWS } from './settings'
import type { BubbleSettings, RectLike } from './types'

const VIEWPORT_MARGIN = 8
const MIN_READABLE_WIDTH = 160
/** 与 renderer.ts 里 .bubble 的 CSS max-width（min(290px, calc(100vw - 16px))）保持一致：
 *  prepareForMeasure 写的 inline maxWidth 会覆盖样式表，上限必须在这里同样封顶，
 *  否则长释义（如单词 even 的词典结果）会把气泡拉到视口宽。 */
const MAX_BUBBLE_WIDTH = 290

const OPPOSITE_SIDE = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
} as const

export interface BubblePlacement {
  side: BubbleSettings['side']
  left: number
  top: number
  width: number
  height: number
  arrowX: number
  arrowY: number
}

export function getBubbleSizing(rangeWidth: number, containerWidth: number, side: BubbleSettings['side']) {
  const availableWidth = Math.min(Math.max(0, containerWidth - VIEWPORT_MARGIN * 2), MAX_BUBBLE_WIDTH)
  const verticalSide = side === 'top' || side === 'bottom'
  const constrainToRange = verticalSide && rangeWidth >= MIN_READABLE_WIDTH
  const maxWidth = Math.min(availableWidth, constrainToRange ? rangeWidth : availableWidth)
  return {
    minWidth: constrainToRange ? 0 : Math.min(MIN_READABLE_WIDTH, maxWidth),
    maxWidth,
  }
}

export function getBubblePlacement(
  bounds: RectLike,
  bubbleWidth: number,
  bubbleHeight: number,
  containerWidth: number,
  containerHeight: number,
  settings: Pick<BubbleSettings, 'side' | 'align' | 'gap' | 'offsetX' | 'offsetY' | 'radius'>,
): BubblePlacement {
  const side = resolveBubbleSide(settings.side, bounds, bubbleWidth, bubbleHeight, containerWidth, containerHeight, settings.gap)
  let left: number
  let top: number
  if (side === 'top' || side === 'bottom') {
    left = alignAxis(bounds.left, bounds.right, bubbleWidth, settings.align)
    top = side === 'top' ? bounds.top - bubbleHeight - settings.gap : bounds.bottom + settings.gap
  } else {
    left = side === 'left' ? bounds.left - bubbleWidth - settings.gap : bounds.right + settings.gap
    top = alignAxis(bounds.top, bounds.bottom, bubbleHeight, settings.align)
  }

  left += settings.offsetX
  top += settings.offsetY
  const clampedLeft = clamp(left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, containerWidth - bubbleWidth - VIEWPORT_MARGIN))
  const clampedTop = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, containerHeight - bubbleHeight - VIEWPORT_MARGIN))
  const arrowInset = Math.max(9, settings.radius / 2 + 5)
  const sourceCenterX = (bounds.left + bounds.right) / 2
  const sourceCenterY = (bounds.top + bounds.bottom) / 2

  return {
    side,
    left: clampedLeft,
    top: clampedTop,
    width: bubbleWidth,
    height: bubbleHeight,
    arrowX: clamp(sourceCenterX - clampedLeft, arrowInset, bubbleWidth - arrowInset),
    arrowY: clamp(sourceCenterY - clampedTop, arrowInset, bubbleHeight - arrowInset),
  }
}

function resolveBubbleSide(
  side: BubbleSettings['side'],
  bounds: RectLike,
  bubbleWidth: number,
  bubbleHeight: number,
  containerWidth: number,
  containerHeight: number,
  gap: number,
): BubbleSettings['side'] {
  const spaces = {
    top: bounds.top - VIEWPORT_MARGIN,
    bottom: containerHeight - bounds.bottom - VIEWPORT_MARGIN,
    left: bounds.left - VIEWPORT_MARGIN,
    right: containerWidth - bounds.right - VIEWPORT_MARGIN,
  }
  const required = side === 'top' || side === 'bottom' ? bubbleHeight + gap : bubbleWidth + gap
  if (spaces[side] >= required) return side
  const opposite = OPPOSITE_SIDE[side]
  return spaces[opposite] > spaces[side] ? opposite : side
}

function alignAxis(start: number, end: number, bubbleSize: number, alignment: BubbleSettings['align']): number {
  if (alignment === 'center') return (start + end - bubbleSize) / 2
  if (alignment === 'end') return end - bubbleSize
  return start
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function bubbleCssVariables(settings: BubbleSettings): Record<string, string> {
  return {
    '--af-bubble-background': settings.background,
    '--af-bubble-text': settings.textColor,
    '--af-bubble-border': settings.borderColor,
    '--af-bubble-border-width': `${settings.borderWidth}px`,
    '--af-bubble-radius': `${settings.radius}px`,
    '--af-bubble-shadow': SHADOWS[settings.shadow],
    '--af-bubble-padding': `${settings.padding}px`,
    '--af-bubble-font-family': FONT_STACKS[settings.fontFamily],
    '--af-bubble-font-size': `${settings.fontSize}px`,
    '--af-bubble-font-weight': settings.fontWeight,
    '--af-bubble-line-height': String(settings.lineHeight),
    '--af-bubble-text-align': settings.textAlign,
  }
}
