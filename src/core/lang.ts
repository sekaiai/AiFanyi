/**
 * 本地语言检测：按 Unicode 字符脚本判断文本是否已是目标语言，
 * 供交互控制器在触发翻译/高亮前做同语言短路。
 * 混合文本（如英文句中夹「中国」）按目标文字占比判定：目标文字字符数
 * 不少于其他语种字母数才视为目标语言，避免夹少量目标词的原文被整段跳过。
 * 局限（有意为之的安全默认）：
 * - 拉丁语系仅判定 English（纯 ASCII）；法/德/西等互相无法区分 → 不跳过
 * - 繁體中文目标不判定（简繁无法低成本区分，保留转换场景）
 * - Русский/Українська 共用西里尔字母，互相视为同语言
 * - 未收录规则的目标语言一律不跳过
 */
// 全部脚本正则使用 g 标志供 match 计数复用；test 前必须重置 lastIndex。
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF]/g
const KANA = /[\u3040-\u30FF]/g // 平假名+片假名，日语独有标志
const JAPANESE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/g // 假名+汉字都算日语字符
const HANGUL = /[\uAC00-\uD7AF]/g
const ARABIC = /[\u0600-\u06FF]/g
const PERSIAN_MARKERS = /[پچژگ]/ // 波斯语特征字母（阿拉伯字母但非阿拉伯语）
const THAI = /[\u0E00-\u0E7F]/g
const GREEK = /[\u0370-\u03FF]/g
const CYRILLIC = /[\u0400-\u04FF]/g
const DEVANAGARI = /[\u0900-\u097F]/g
const NON_ASCII = /[^\x00-\x7F]/
const ASCII_LETTER = /[A-Za-z]/
const LETTER = /\p{L}/gu
// 高频繁体特征字：目标为简体但文本是繁体时不跳过（保留繁→简转换可用）
const TRADITIONAL_MARKERS = /[們學開關問東車馬鳥龍語書長樂萬與為發這個來對時說話麼裡見貝頁風飛]/

function has(text: string, re: RegExp): boolean {
  re.lastIndex = 0
  return re.test(text)
}

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0
}

/** 目标文字字符数 ≥ 其他语种字母数时视为目标语言；目标文字占少数的混合文本不跳过。 */
function isDominantScript(text: string, targetRe: RegExp): boolean {
  const target = count(text, targetRe)
  if (target === 0) return false
  return target >= count(text, LETTER) - target
}

const RULES: Record<string, (text: string) => boolean> = {
  '简体中文': text => has(text, HAN) && !has(text, KANA) && !has(text, HANGUL) && !has(text, TRADITIONAL_MARKERS) && isDominantScript(text, HAN),
  '日本語': text => has(text, KANA) && isDominantScript(text, JAPANESE),
  '한국어': text => isDominantScript(text, HANGUL),
  'العربية': text => !has(text, PERSIAN_MARKERS) && isDominantScript(text, ARABIC),
  'ไทย': text => isDominantScript(text, THAI),
  'Ελληνικά': text => isDominantScript(text, GREEK),
  'Русский': text => isDominantScript(text, CYRILLIC),
  'Українська': text => isDominantScript(text, CYRILLIC),
  'हिन्दी': text => isDominantScript(text, DEVANAGARI),
  'English': text => has(text, ASCII_LETTER) && !has(text, NON_ASCII),
}

export function isTargetLanguageText(text: string, targetLanguage: string): boolean {
  return RULES[targetLanguage]?.(text) ?? false
}
