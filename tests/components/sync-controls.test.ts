import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SyncControls from '../../src/components/SyncControls.vue'

describe('SyncControls', () => {
  it('uses a three-row layout with a single sync summary and emits actions', async () => {
    const wrapper = mount(SyncControls, {
      props: {
        busy: false,
        status: '同步成功',
        state: { kind: 'upToDate', uploadedAt: Date.UTC(2029, 11, 23, 12, 34) },
      },
    })
    expect(wrapper.get('h2').text()).toBe('同步配置')
    expect(wrapper.get('section').element.children).toHaveLength(3)
    expect(wrapper.text()).toContain('API 密钥')
    expect(wrapper.get('.sync-docs').attributes('href')).toBe('https://developer.chrome.com/docs/extensions/reference/api/storage#sync')
    expect(wrapper.get('.sync-docs').attributes('target')).toBe('_blank')
    expect(wrapper.get('[data-testid="sync-summary"]').text()).toContain('同步成功，云端数据更新于')
    await wrapper.get('[data-testid="sync-upload"]').trigger('click')
    await wrapper.get('[data-testid="sync-download"]').trigger('click')
    expect(wrapper.emitted('upload')).toHaveLength(1)
    expect(wrapper.emitted('download')).toHaveLength(1)
  })

  it('uses cloud update wording when local and cloud data differ', () => {
    const wrapper = mount(SyncControls, {
      props: {
        busy: false,
        status: '',
        state: { kind: 'different', uploadedAt: Date.UTC(2029, 11, 23, 12, 34) },
      },
    })
    expect(wrapper.get('[data-testid="sync-summary"]').text()).toContain('本地和云端不同，云端数据更新于')
  })

  it('uses cloud update wording after a download', () => {
    const wrapper = mount(SyncControls, {
      props: {
        busy: false,
        status: '更新成功',
        state: { kind: 'upToDate', uploadedAt: Date.UTC(2029, 11, 23, 12, 34) },
      },
    })
    expect(wrapper.get('[data-testid="sync-summary"]').text()).toContain('更新成功，云端数据更新于')
  })

  it.each([
    [{ kind: 'upToDate' as const, uploadedAt: Date.UTC(2029, 11, 23, 12, 34) }, '已同步，云端数据更新于'],
    [{ kind: 'different' as const, uploadedAt: Date.UTC(2029, 11, 23, 12, 34) }, '本地和云端不同，云端数据更新于'],
    [{ kind: 'notUploaded' as const, uploadedAt: null }, '未同步，暂无云端数据'],
  ])('summarizes %o as %s', (state, expected) => {
    const wrapper = mount(SyncControls, { props: { busy: false, status: '', state } })
    expect(wrapper.get('[data-testid="sync-summary"]').text()).toContain(expected)
  })

  it('disables transfer actions while a transfer is active', () => {
    const wrapper = mount(SyncControls, { props: { busy: true, status: '', state: null } })
    expect(wrapper.get('[data-testid="sync-upload"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="sync-download"]').attributes('disabled')).toBeDefined()
  })
})
