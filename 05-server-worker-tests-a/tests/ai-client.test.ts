import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestAiHealth, requestExtraction } from '../src/ai/client'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('requestExtraction', () => {
  it('never sends a Qwen credential or model from the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claims: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await requestExtraction('source content')

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/extract', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'source content',
      }),
    })
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('secret')
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('qwen-max')
  })

  it('adds a saved browser-local Qwen key only to the same-origin request body', async () => {
    localStorage.setItem('offer-adventure:deepseek-api-key', 'local-secret')
    localStorage.setItem('offer-adventure:deepseek-model', 'deepseek-v4-flash')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claims: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await requestExtraction('source content')

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({
      content: 'source content',
      clientDeepSeek: { apiKey: 'local-secret', model: 'deepseek-v4-flash' },
    })
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('uses a JSON error message returned by the proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: '请求过于频繁' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(
      requestExtraction('source content'),
    ).rejects.toThrow('请求过于频繁')
  })

  it('preserves structured timeout details returned by the production Worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'DEEPSEEK_TIMEOUT',
            taskName: 'resumeExtraction',
            requestId: 'request-1',
            timeoutMs: 45_000,
            retryable: true,
            message:
              '本次生成等待时间过长，已自动停止。你可以重新尝试，已完成的内容不会丢失。',
          }),
          {
            status: 504,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    await expect(
      requestExtraction('source content'),
    ).rejects.toMatchObject({
      name: 'AIServiceError',
      code: 'DEEPSEEK_TIMEOUT',
      taskName: 'resumeExtraction',
      requestId: 'request-1',
      timeoutMs: 45_000,
      retryable: true,
    })
  })
})

describe('requestAiHealth', () => {
  it('returns the Worker health status without browser credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: 'deepseek',
          configured: true,
          reachable: true,
          authenticated: true,
          modelAvailable: true,
          latencyMs: 12,
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestAiHealth()).resolves.toMatchObject({
      authenticated: true,
      modelAvailable: true,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/health', {
      signal: undefined,
    })
  })
})
