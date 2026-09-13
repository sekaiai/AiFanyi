import { youdaoAudioUrl } from '../core/word-sources'

/**
 * 单词朗读：点击 ▶ 时才请求有道 dictvoice 真人音频（懒加载，查询阶段零音频请求），
 * 与查询源解耦 —— 无论释义来自哪个源，任何单词都能读。
 * 音频被页面 CSP 挡住或加载失败时降级浏览器系统 TTS（speechSynthesis）。
 */
export function speakWord(word: string, accent: 'us' | 'uk'): void {
  playAudio(youdaoAudioUrl(word, accent)).catch(() => speakWithTts(word, accent))
}

function speakWithTts(word: string, accent: 'us' | 'uk'): void {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = accent === 'us' ? 'en-US' : 'en-GB'
  utterance.rate = 0.95
  synth.speak(utterance)
}

function playAudio(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.addEventListener('ended', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error('音频播放失败')), { once: true })
    audio.play().catch(reject)
  })
}
