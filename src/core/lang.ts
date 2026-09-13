/**
 * 本地语言检测：按 Unicode 字符脚本判断文本是否已是目标语言，
 * 供交互控制器在触发翻译/高亮前做同语言短路。
 * 局限（有意为之的安全默认）：
 * - 拉丁语系仅判定 English（纯 ASCII）；法/德/西等互相无法区分 → 不跳过
 * - 繁體中文目标不判定（简繁无法低成本区分，保留转换场景）
 * - Русский/Українська 共用西里尔字母，互相视为同语言
 * - 未收录规则的目标语言一律不跳过
 */
const has = (text: string, re: RegExp) => re.test(text)

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF]/
const KANA = /[\u3040-\u30FF]/ // 平假名+片假名，日语独有标志
const HANGUL = /[\uAC00-\uD7AF]/
const ARABIC = /[\u0600-\u06FF]/
const PERSIAN_MARKERS = /[پچژگ]/ // 波斯语特征字母（阿拉伯字母但非阿拉伯语）
const THAI = /[\u0E00-\u0E7F]/
const GREEK = /[\u0370-\u03FF]/
const CYRILLIC = /[\u0400-\u04FF]/
const DEVANAGARI = /[\u0900-\u097F]/
const NON_ASCII = /[^\x00-\x7F]/
const ASCII_LETTER = /[A-Za-z]/
// 高频繁体特征字：目标为简体但文本是繁体时不跳过（保留繁→简转换可用）
const TRADITIONAL_MARKERS = /[們學開關問東車馬鳥龍語書長樂萬與為發這個來對時說話麼裡見貝頁風飛]/

const RULES: Record<string, (text: string) => boolean> = {
  '简体中文': text => has(text, HAN) && !has(text, KANA) && !has(text, HANGUL) && !has(text, TRADITIONAL_MARKERS),
  '日本語': text => has(text, KANA),
  '한국어': text => has(text, HANGUL),
  'العربية': text => has(text, ARABIC) && !has(text, PERSIAN_MARKERS),
  'ไทย': text => has(text, THAI),
  'Ελληνικά': text => has(text, GREEK),
  'Русский': text => has(text, CYRILLIC),
  'Українська': text => has(text, CYRILLIC),
  'हिन्दी': text => has(text, DEVANAGARI),
  'English': text => has(text, ASCII_LETTER) && !has(text, NON_ASCII),
}

export function isTargetLanguageText(text: string, targetLanguage: string): boolean {
  return RULES[targetLanguage]?.(text) ?? false
}
