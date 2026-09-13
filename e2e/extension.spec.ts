import { chromium, expect, test } from '@playwright/test'
import path from 'node:path'

const extensionPath = path.resolve('.output/chrome-mv3')
const settingsKey = 'aifanyi.settings.v1'
const wordSourcePatterns = [
  'https://dict.youdao.com/**',
  'https://cn.bing.com/**',
  'https://translate.googleapis.com/**',
]

async function launchExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  await Promise.all(wordSourcePatterns.map((pattern) => context.route(pattern, (route) => route.abort())))
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker')
  await new Promise((resolve) => setTimeout(resolve, 800))
  const page = context.pages()[0] ?? await context.newPage()
  return { context, page, worker }
}

async function setSettings(worker: Awaited<ReturnType<typeof launchExtension>>['worker'], value: object) {
  await worker.evaluate(async ({ key, settings }) => {
    await (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome.storage.local.set({ [key]: settings })
  }, { key: settingsKey, settings: value })
}

test.describe('AiFanyi extension', () => {
  test('shows a dictionary bubble after hovering an English word', async () => {
    const { context, page, worker } = await launchExtension()
    await setSettings(worker, { version: 1, enabled: true, hoverEnabled: true, selectionEnabled: true, hoverDelayMs: 0, bubble: { highlightColor: '#ff8800' } })
    await context.route('https://freedictionaryapi.com/**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ entries: [{ partOfSpeech: 'adj.', senses: [{ translations: [{ language: 'zh', word: '美丽的；漂亮的；出色的；令人愉悦的；绝妙的；非常好的；用来加强语气表示甚至' }] }] }] }),
      })
    })
    await page.route('https://fixture.test/**', async (route) => {
      await route.fulfill({
        path: path.resolve('e2e/fixtures/translation-page.html'),
        contentType: 'text/html',
      })
    })

    await page.goto('https://fixture.test/')
    const target = page.locator('#dictionary-target')
    const box = await target.boundingBox()
    if (!box) throw new Error('Dictionary fixture is not visible')
    await page.mouse.move(box.x + 24, box.y + box.height / 2)

    const bubble = page.locator('.aifanyi-bubble, .bubble').first()
    await expect(bubble).toBeVisible()
    await expect(bubble).toContainText(/美|beautiful/i)
    // 悬停高亮跟随设置的「单词高亮」颜色（Chrome CSSOM 将 8 位 hex 序列化为 rgba）
    expect(await page.locator('#aifanyi-word-highlight').evaluate(el => el.style.background)).toBe('rgba(255, 136, 0, 0.22)')
    // 回归：长释义不许把气泡拉超 290px 固定最大宽度（单词 even 的词典结果即触发）
    const bubbleBox = await bubble.boundingBox()
    expect(bubbleBox).not.toBeNull()
    expect(bubbleBox!.width).toBeLessThanOrEqual(290)

    await context.close()
  })

  test('uses AI translation for multi-word selections', async () => {
    const { context, page, worker } = await launchExtension()
    await page.route('https://fixture.test/**', async (route) => {
      await route.fulfill({
        path: path.resolve('e2e/fixtures/translation-page.html'),
        contentType: 'text/html',
      })
    })
    await context.route('https://api.example.com/v1/chat/completions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '学习另一种语言可以帮助你理解不同文化。' } }] }),
      })
    })

    await setSettings(worker, {
          version: 1,
          enabled: true,
          hoverEnabled: true,
          selectionEnabled: true,
          hoverDelayMs: 0,
          ai: {
            apiUrl: 'https://api.example.com/v1/chat/completions',
            apiKey: 'sk-e2e',
            model: 'gpt-4o-mini',
            prompt: 'Translate into Simplified Chinese: {text}',
            timeoutMs: 5000,
          },
    })

    await page.goto('https://fixture.test/')
    await page.locator('#ai-target').evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })

    const bubble = page.locator('.aifanyi-bubble, .bubble').first()
    await expect(bubble).toContainText('学习另一种语言')
    await expect(bubble).toContainText('Learning another language can help you understand different cultures.')

    await context.close()
  })

  test('skips translation when the selected text is already in the target language', async () => {
    const { context, page, worker } = await launchExtension()
    await page.route('https://fixture.test/**', async (route) => {
      await route.fulfill({
        path: path.resolve('e2e/fixtures/translation-page.html'),
        contentType: 'text/html',
      })
    })
    await setSettings(worker, { version: 1, enabled: true, hoverEnabled: false, selectionEnabled: true })

    await page.goto('https://fixture.test/')
    await page.locator('#zh-target').evaluate((node) => {
      const text = node.firstChild
      if (!text) throw new Error('中文文本不可用')
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 10)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })

    // 未 mock 任何翻译 API：若门控失效会发出真实请求并弹出错误气泡
    await page.waitForTimeout(400)
    await expect(page.locator('.aifanyi-bubble, .bubble').first()).toBeHidden()

    await context.close()
  })

  test('does not translate when the current host is blacklisted', async () => {
    const { context, page, worker } = await launchExtension()
    await page.route('https://fixture.test/**', async (route) => {
      await route.fulfill({
        path: path.resolve('e2e/fixtures/translation-page.html'),
        contentType: 'text/html',
      })
    })
    await setSettings(worker, {
          version: 1,
          enabled: true,
          hoverEnabled: true,
          selectionEnabled: true,
          siteBlacklist: ['fixture.test'],
    })

    await page.goto('https://fixture.test/')
    await page.getByText('Beautiful').hover()

    await expect(page.locator('.aifanyi-bubble, .bubble').first()).toBeHidden()

    await context.close()
  })

  test('applies settings live and keeps edge bubbles inside the viewport', async () => {
    const { context, page, worker } = await launchExtension()
    await context.route('https://freedictionaryapi.com/**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ entries: [{ partOfSpeech: 'n.', senses: [{ translations: [{ language: 'zh', word: '语境' }] }] }] }),
      })
    })
    await page.route('https://fixture.test/**', async (route) => {
      await route.fulfill({ path: path.resolve('e2e/fixtures/translation-page.html'), contentType: 'text/html' })
    })
    await setSettings(worker, { version: 1, enabled: true, hoverEnabled: true, selectionEnabled: true, hoverDelayMs: 0 })
    await page.goto('https://fixture.test/')

    await page.locator('#edge-word').hover()
    const bubble = page.locator('.bubble').first()
    await expect(bubble).toBeVisible()
    const box = await bubble.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)

    await setSettings(worker, { version: 1, enabled: false, hoverEnabled: true, selectionEnabled: true })
    await expect(bubble).toBeHidden()
    await context.close()
  })

  test('keeps the options demo visible and applies presets and all preview directions', async () => {
    const { context, page, worker } = await launchExtension()
    await context.route('https://freedictionaryapi.com/**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ entries: [{ partOfSpeech: 'pronoun', senses: [{ translations: [{ language: 'zh', word: '某人' }] }] }] }),
      })
    })
    const optionsUrl = await worker.evaluate(() => chrome.runtime.getURL('/options.html'))
    await page.goto(optionsUrl)

    await expect(page.getByRole('heading', { name: '翻译交互演示' })).toBeVisible()
    await page.getByTestId('color-preset').selectOption('night')
    await expect(page.getByTestId('bubble-preview')).toHaveCSS('background-color', 'rgb(32, 36, 45)')

    const preview = page.getByTestId('bubble-preview')
    const source = page.locator('.preview-source')
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      await page.getByTestId('bubble-side').selectOption(side)
      await expect(preview).toHaveAttribute('data-side', side)
      const bubbleBox = await preview.boundingBox()
      const sourceBox = await source.boundingBox()
      expect(bubbleBox).not.toBeNull()
      expect(sourceBox).not.toBeNull()
      if (side === 'top') expect(bubbleBox!.y + bubbleBox!.height).toBeLessThanOrEqual(sourceBox!.y)
      if (side === 'bottom') expect(bubbleBox!.y).toBeGreaterThanOrEqual(sourceBox!.y + sourceBox!.height)
      if (side === 'left') expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(sourceBox!.x)
      if (side === 'right') expect(bubbleBox!.x).toBeGreaterThanOrEqual(sourceBox!.x + sourceBox!.width)
    }

    // 中文段落 + 默认目标简体中文：同语言不触发翻译，气泡不出现
    await page.locator('.reading-copy p').last().evaluate((element) => {
      const text = element.firstChild
      if (!text) throw new Error('演示文本不可用')
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 5)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await page.waitForTimeout(300)
    await expect(page.locator('#aifanyi-shadow-host .bubble')).toBeHidden()

    await page.locator('.reading-copy p').first().evaluate((element) => {
      const text = element.firstChild
      if (!text) throw new Error('演示文本不可用')
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 7)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await expect(page.locator('#aifanyi-shadow-host .bubble')).toContainText('某人')

    await context.close()
  })
})
