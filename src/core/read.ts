/**
 * 宽松读取上游 JSON 响应字段：类型不符时回退为空值，
 * 各翻译 / 词典 provider 共用，避免逐字段手写防御。
 */
export function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 上游错误码常见数字与纯数字字符串两种形态，统一读成数字；其他类型回退 null。 */
export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}
