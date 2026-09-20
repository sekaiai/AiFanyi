import { describe, expect, it } from 'vitest'
import { cloneDefaultSettings } from '../../src/core/settings'
import { SYNC_CHUNK_MAX_BYTES, byteSize, decodeSyncSettings, encodeSyncSettings, splitSyncPayload } from '../../src/extension/sync-codec'

describe('sync codec', () => {
  it('round-trips compact settings with every credential-bearing scheme', () => {
    const settings = cloneDefaultSettings()
    settings.uiLocale = 'en'
    settings.siteBlacklist = ['例子.中国', 'example.com']
    settings.bubble.colorPreset = 'custom'
    settings.bubble.background = '#010203'
    settings.word.sources.google = true
    settings.schemes.push(
      { id: '01f0c447-1a8b-4e91-a10e-48577e6ea6e5', type: 'deepl', enabled: false, authKey: 'deepl-key', endpoint: 'pro' },
      { id: 'google-cloud', type: 'googleCloud', enabled: true, apiKey: 'google-key' },
      { id: 'baidu', type: 'baidu', enabled: true, appId: 'app', secretKey: 'secret' },
      { id: 'baidu-ai', type: 'baiduAi', enabled: true, appId: 'ai-app', secretKey: 'ai-secret', modelType: 'llm' },
      { id: 'volc', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-beijing' },
      { id: 'ai', type: 'ai', enabled: true, label: '自定义', apiUrl: 'https://api.example.com', apiKey: 'token', model: 'model', timeoutMs: 8000 },
    )
    const payload = encodeSyncSettings(settings)
    expect(decodeSyncSettings(payload)).toEqual(settings)
  })

  it('omits defaults and safely splits unicode payloads', () => {
    const defaults = cloneDefaultSettings()
    const compact = encodeSyncSettings(defaults)
    expect(compact.length).toBeLessThan(JSON.stringify(defaults).length)
    const changed = cloneDefaultSettings()
    changed.schemes.push({ id: 'ai', type: 'ai', enabled: true, label: '', apiUrl: 'https://example.com', apiKey: '密钥🙂'.repeat(3000), model: 'm', timeoutMs: 5000 })
    const chunks = splitSyncPayload(encodeSyncSettings(changed))
    expect(chunks.join('')).toBe(encodeSyncSettings(changed))
    expect(chunks.every((chunk) => byteSize(JSON.stringify(chunk)) <= SYNC_CHUNK_MAX_BYTES)).toBe(true)
  })

  it('rejects unsupported or malformed compact payloads', () => {
    expect(() => decodeSyncSettings('not-json')).toThrow('同步数据不是有效 JSON')
    expect(() => decodeSyncSettings('[2,0]')).toThrow('同步数据格式不受支持')
  })
})
