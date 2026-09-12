import { afterEach, describe, expect, it } from 'vitest'
import { cloneDefaultSettings } from '../../src/core/settings'
import { createBubbleRenderer } from '../../src/extension/renderer'
import type { BubbleSettings } from '../../src/core/types'

function bubbleSettings(overrides: Partial<BubbleSettings> = {}): BubbleSettings {
  return { ...cloneDefaultSettings().bubble, ...overrides }
}

describe('createBubbleRenderer 原文显示', () => {
  let renderer: ReturnType<typeof createBubbleRenderer> | null = null

  afterEach(() => {
    renderer?.destroy()
    renderer = null
  })

  it('showOriginal 为真时，弱化原文行排在译文之前', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showText('学习另一种语言', 'Learning another language')

    const source = renderer.content.querySelector('.source')
    expect(source?.textContent).toBe('Learning another language')
    expect(source?.querySelector('.source-text')).not.toBeNull()

    const nodes = Array.from(renderer.content.children)
    expect(nodes.map((node) => node.className)).toEqual(['source', 'sentence'])
    expect(nodes[1]?.textContent).toBe('学习另一种语言')
  })

  it('showOriginal 为假时不渲染原文行', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: false }))
    renderer.showText('学习另一种语言', 'Learning another language')

    expect(renderer.content.querySelector('.source')).toBeNull()
    expect(renderer.content.querySelector('.sentence')?.textContent).toBe('学习另一种语言')
  })

  it('未传原文时保持向后兼容，不渲染原文行', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showText('学习另一种语言')

    expect(renderer.content.querySelector('.source')).toBeNull()
    expect(renderer.content.querySelectorAll('.sentence')).toHaveLength(1)
  })

  it('可经 applySettings 实时开关 showOriginal', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: false }))
    renderer.showText('译文', 'Original')
    expect(renderer.content.querySelector('.source')).toBeNull()

    renderer.applySettings(bubbleSettings({ showOriginal: true }))
    renderer.showText('译文', 'Original')
    expect(renderer.content.querySelector('.source')?.textContent).toBe('Original')
  })

  it('加载态与结果态的原文保持一致', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showLoading('正在翻译...', 'Learning another language')
    expect(renderer.content.querySelector('.source')?.textContent).toBe('Learning another language')
    expect(renderer.content.querySelector('.sentence')).toBeNull()

    renderer.showText('学习另一种语言', 'Learning another language')
    expect(renderer.content.querySelector('.source')?.textContent).toBe('Learning another language')
    expect(renderer.content.querySelector('.sentence')?.textContent).toBe('学习另一种语言')
  })

  // 方案 A：原文行刻意与词典原词（freedictionaryapi 兜底）共用同一套标题样式，
  // 只改其中一条路径就会让这条断言失败。注意 happy-dom 不解析 calc()，比较的是声明串本身。
  it('原文行与词典原词的标题样式逐项一致', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showDictionary('loved', {
      source: 'loved',
      pronunciation: '/lʌvd/',
      meanings: [{ partOfSpeech: 'v.', translations: ['爱；喜欢'] }],
    })
    // 先把词典路径的字号/字重取成字符串——CSSStyleDeclaration 是活的，节点被替换后就量不到了
    const wordStyle = getComputedStyle(renderer.content.querySelector('.word') as HTMLElement)
    const wordFont = { size: wordStyle.fontSize, weight: wordStyle.fontWeight }

    renderer.showText('爱；喜欢', 'loved')
    const wrap = renderer.content.querySelector('.source') as HTMLElement
    const sourceStyle = getComputedStyle(renderer.content.querySelector('.source-text') as HTMLElement)

    expect(sourceStyle.fontSize).toBe(wordFont.size)
    expect(sourceStyle.fontWeight).toBe(wordFont.weight)
    expect(sourceStyle.fontWeight).toBe('650')
    // 词典原词是首行标题，原文行同样不画分隔线
    const wrapStyle = getComputedStyle(wrap)
    expect(wrapStyle.borderBottomWidth).toBe('')
    expect(wrapStyle.paddingBottom).toBe('')
  })

  it('传入 onSpeak 时在右上角渲染朗读按钮并绑定点击', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    let spoken = 0
    renderer.showDictionary('loved', {
      source: 'youdao',
      sourceLabel: '有道词典',
      pronunciation: '/lʌvd/',
      meanings: [{ partOfSpeech: 'v.', translations: ['爱，热爱'] }],
    }, { onSpeak: () => { spoken += 1 } })

    const speak = renderer.content.querySelector('.speak') as HTMLButtonElement
    expect(speak.textContent).toBe('▶')
    expect(speak.title).toBe('朗读')
    // 原文行加 speakable 类，为按钮预留 22px 右侧空间
    expect(renderer.content.querySelector('.word')?.className).toBe('word speakable')

    speak.click()
    expect(spoken).toBe(1)
  })

  it('未传 onSpeak 时不渲染朗读按钮，原文行也不加 padding', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showDictionary('loved', {
      source: 'freedictionaryapi',
      sourceLabel: 'freedictionaryapi',
      pronunciation: '/lʌvd/',
      meanings: [{ partOfSpeech: 'v.', translations: ['爱；喜欢'] }],
    })

    expect(renderer.content.querySelector('.speak')).toBeNull()
    expect(renderer.content.querySelector('.word')?.className).toBe('word')
  })

  // 释义行 CSS 限单行省略（.result white-space:nowrap），完整文本挂在 title 上悬停可见。
  // happy-dom 不解析截断样式，这里断言 title 属性；CSS 效果由 Playwright 渲染自检兜底。
  it('释义行挂 title，内容为完整释义文本', () => {
    renderer = createBubbleRenderer(bubbleSettings({ showOriginal: true }))
    renderer.showDictionary('loved', {
      source: 'youdao',
      sourceLabel: '有道词典',
      pronunciation: '/lʌvd/',
      meanings: [
        { partOfSpeech: 'v.', translations: ['爱，热爱（love 的过去式和过去分词）'] },
        { partOfSpeech: 'adj.', translations: ['受珍爱的，被爱的，心爱的（常作定语，如 loved ones 亲人）'] },
      ],
    })

    const lines = [...renderer.content.querySelectorAll('.result')] as HTMLElement[]
    expect(lines).toHaveLength(2)
    expect(lines[0]?.title).toBe('爱，热爱（love 的过去式和过去分词）')
    expect(lines[1]?.title).toBe('受珍爱的，被爱的，心爱的（常作定语，如 loved ones 亲人）')
  })
})
