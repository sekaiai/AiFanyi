import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { speakWord } from '../../src/extension/speech'

// 验证「点击朗读才请求音频」的懒加载契约：
// speakWord 构造有道 dictvoice 地址交给 Audio（此刻才发请求），
// 音频失败时降级系统 TTS。与查询源无关 —— 任何源的结果都能读。

class AudioStub {
  static instances: AudioStub[] = []
  src: string
  play(): Promise<void> {
    return Promise.reject(new Error('blocked'))
  }

  addEventListener(): void {}

  constructor(src: string) {
    this.src = src
    AudioStub.instances.push(this)
  }
}

beforeEach(() => {
  AudioStub.instances = []
  vi.stubGlobal('Audio', AudioStub)
  // happy-dom 无 speechSynthesis：降级路径应为 no-op 而不是抛错
  vi.stubGlobal('speechSynthesis', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('speakWord', () => {
  it('点击朗读时才构造有道真人音频地址（美音 type=2）', () => {
    speakWord('loved', 'us')

    expect(AudioStub.instances).toHaveLength(1)
    expect(AudioStub.instances[0]?.src).toBe('https://dict.youdao.com/dictvoice?audio=loved&type=2')
  })

  it('英音用 type=1', () => {
    speakWord('loved', 'uk')

    expect(AudioStub.instances[0]?.src).toBe('https://dict.youdao.com/dictvoice?audio=loved&type=1')
  })

  it('音频播放失败时降级系统 TTS 且不抛未处理异常', async () => {
    expect(() => speakWord('loved', 'us')).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
  })
})
