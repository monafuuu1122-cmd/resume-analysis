import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEEPSEEK_API_KEY_STORAGE_KEY } from '../src/ai/client'
import SettingsPage from '../src/pages/SettingsPage'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('SettingsPage', () => {
  it('shows non-sensitive research and browser speech availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: true,
          modelAvailable: true,
        }),
      }),
    )
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: class {},
    })

    render(<SettingsPage />)

    expect(
      await screen.findByText('智能分析服务可用'),
    ).toBeInTheDocument()
    expect(screen.getByText('当前浏览器支持语音输入')).toBeInTheDocument()
    expect(screen.queryByText(/TAVILY_API_KEY/)).not.toBeInTheDocument()
  })

  it('distinguishes an unreachable status endpoint from missing research configuration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<SettingsPage />)

    expect(
      await screen.findByText('智能分析服务暂时不可用，请稍后重试。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('智能分析服务可用'),
    ).not.toBeInTheDocument()
  })

  it('explains that a local DeepSeek key is required when the backend is reachable but unconfigured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: false,
          reachable: false,
          authenticated: false,
          modelAvailable: false,
          errorCode: 'DEEPSEEK_NOT_CONFIGURED',
        }),
      }),
    )

    render(<SettingsPage />)

    expect(
      await screen.findByText('尚未配置 DeepSeek API Key，请填写后保存并检测。'),
    ).toBeInTheDocument()
  })

  it('shows an actionable message when the production Qwen key is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: false,
          modelAvailable: false,
          errorCode: 'DEEPSEEK_AUTH_FAILED',
        }),
      }),
    )

    render(<SettingsPage />)

    expect(
      await screen.findByText(
        'DeepSeek API Key 无效或无权访问当前服务，请更新生产环境密钥。',
      ),
    ).toBeInTheDocument()
  })

  it('explains when the selected DeepSeek model is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: true,
          modelAvailable: false,
          errorCode: 'DEEPSEEK_MODEL_NOT_FOUND',
        }),
      }),
    )

    render(<SettingsPage />)

    expect(
      await screen.findByText(
        '当前模型不可用，请确认模型名称或更换为账号可用的 DeepSeek 模型。',
      ),
    ).toBeInTheDocument()
  })

  it('explains how to restore service when the free quota is exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: true,
          modelAvailable: true,
          errorCode: 'DEEPSEEK_QUOTA_EXHAUSTED',
        }),
      }),
    )

    render(<SettingsPage />)

    expect(
      await screen.findByText(
        'DeepSeek 账户余额不足，请充值后重新检测。',
      ),
    ).toBeInTheDocument()
  })

  it('allows saving and clearing a browser-local Qwen key', async () => {
    localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, 'legacy-secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: true,
          modelAvailable: true,
        }),
      }),
    )
    render(<SettingsPage />)

    expect(await screen.findByText('智能分析服务可用')).toBeInTheDocument()
    const keyInput = screen.getByLabelText('DeepSeek API Key')
    expect(keyInput).toHaveAttribute('type', 'password')
    expect(keyInput).toHaveValue('legacy-secret')
    fireEvent.change(keyInput, { target: { value: 'new-local-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并检测' }))
    expect(localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY)).toBe(
      'new-local-secret',
    )
    fireEvent.click(screen.getByRole('button', { name: '清除本地 Key' }))
    expect(localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY)).toBeNull()
  })

  it('can recheck the server-side service without exposing secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'deepseek',
        configured: true,
        reachable: true,
        authenticated: true,
        modelAvailable: true,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SettingsPage />)

    await screen.findByText('智能分析服务可用')
    fireEvent.click(screen.getByRole('button', { name: '重新检测' }))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
