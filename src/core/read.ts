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
