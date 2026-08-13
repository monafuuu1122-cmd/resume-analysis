// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response as ExpressResponse } from 'express'

import { createExtractionHandler } from '../server/index'
import {
  DASHSCOPE_BASE_URL,
  callQwen,
  QWEN_TIMEOUTS,
  resolveQwenTimeout,
  type FetchImplementation,
} from '../server/qwen'

afterEach(() => {
  vi.restoreAllMocks()
})

function qwenResponse(content: string, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

describe('callQwen', () => {
  it('keeps long JD work alive longer than short interview turns', () => {
    expect(QWEN_TIMEOUTS.jdAnalysis).toBeGreaterThan(QWEN_TIMEOUTS.mockInterviewTurn)
    expect(resolveQwenTimeout('jdAnalysis', {})).toBe(120_000)
    expect(resolveQwenTimeout('jdAnalysis', {
      DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS: '90000',
    })).toBe(90_000)
    expect(resolveQwenTimeout('jdAnalysis', {
      DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS: 'invalid',
    })).toBe(120_000)
  })

  it('calls the fixed chat completions endpoint with structured output', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse(JSON.stringify({ claims: [] })))

    await expect(
      callQwen(
        'server-secret',
        'deepseek-v4-flash',
        'system instruction',
        'user content',
        fetchMock,
      ),
    ).resolves.toEqual({ claims: [] })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${DASHSCOPE_BASE_URL}/chat/completions`)
    expect(init?.headers).toEqual({
      authorization: 'Bearer server-secret',
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'system instruction' },
        { role: 'user', content: 'user content' },
      ],
      response_format: { type: 'json_object' },
      stream: false,
      thinking: { type: 'disabled' },
      max_tokens: 8192,
    })
  })

  it('disables V4 thinking for structured requests so JD analysis can deliver promptly', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse(JSON.stringify({ claims: [] })))

    await callQwen(
      'server-secret',
      'deepseek-v4-flash',
      'system instruction',
      'user content',
      fetchMock,
    )

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it.each([401, 403])('maps status %s to an invalid key error', async (status) => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse('{}', status))

    await expect(
      callQwen('bad-secret', 'deepseek-v4-flash', 'system', 'content', fetchMock),
    ).rejects.toThrow('DeepSeek API Key 无效')
  })

  it('maps an unavailable model to a distinct error', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse('{}', 404))

    await expect(
      callQwen('secret', 'missing-model', 'system', 'content', fetchMock),
    ).rejects.toMatchObject({
      message: 'DeepSeek 模型不可用',
      status: 404,
    })
  })

  it('maps rate limiting to a recoverable error', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse('{}', 429))

    await expect(
      callQwen('secret', 'deepseek-v4-flash', 'system', 'content', fetchMock),
    ).rejects.toThrow('请求过于频繁')
  })

  it('rejects invalid message JSON', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse('not-json'))

    await expect(
      callQwen('secret', 'deepseek-v4-flash', 'system', 'content', fetchMock),
    ).rejects.toThrow('DeepSeek 返回内容不完整，请重试')
  })

  it('rejects a parsed response that cannot be consumed by the extractor', async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse(JSON.stringify({ answer: 'no claims' })))

    await expect(
      callQwen('secret', 'deepseek-v4-flash', 'system', 'content', fetchMock),
    ).rejects.toThrow('DeepSeek 返回内容不完整，请重试')
  })

  it('keeps the timeout active while consuming the response body', async () => {
    const fetchMock = vi.fn<FetchImplementation>(
      async (_input, init) =>
        ({
          json: () =>
            new Promise((_, reject) => {
              const signal = init?.signal
              const fallback = setTimeout(
                () => reject(new Error('response body did not abort')),
                100,
              )
              const rejectAsAborted = () => {
                clearTimeout(fallback)
                reject(new DOMException('Aborted', 'AbortError'))
              }
              if (signal?.aborted) {
                rejectAsAborted()
              } else {
                signal?.addEventListener('abort', rejectAsAborted, {
                  once: true,
                })
              }
            }),
          ok: true,
          status: 200,
        }) as Response,
    )

    await expect(
      callQwen('secret', 'deepseek-v4-flash', 'system', 'content', fetchMock, 10),
    ).rejects.toMatchObject({
      message: 'DeepSeek 请求超时，请重试',
      status: 504,
    })
  })
})

describe('DeepSeek extraction proxy', () => {
  async function runExtractionHandler(
    body: unknown,
    fetchImplementation: FetchImplementation,
    apiKey?: string,
  ) {
    let status = 200
    let payload: unknown
    const request = {
      body,
      header: (name: string) =>
        name === 'x-deepseek-key' ? apiKey : undefined,
    } as Request
    const response = {
      json: (nextPayload: unknown) => {
        payload = nextPayload
        return response
      },
      status: (nextStatus: number) => {
        status = nextStatus
        return response
      },
    } as ExpressResponse

    await createExtractionHandler(fetchImplementation)(request, response)
    return {
      json: async () => payload,
      status,
    }
  }

  it.each([
    [{ content: 'source' }, undefined, '请先配置DeepSeek API Key'],
    [{ content: '  ' }, 'test-key', '请输入需要提炼的内容'],
    [
      { content: 'source', model: 'https://evil.example' },
      'test-key',
      'DeepSeek模型名称无效',
    ],
  ])(
    'rejects invalid browser input before calling DeepSeek',
    async (body, apiKey, message) => {
      const upstreamFetch = vi.fn<FetchImplementation>()

      const response = await runExtractionHandler(body, upstreamFetch, apiKey)

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ message })
      expect(upstreamFetch).not.toHaveBeenCalled()
    },
  )

  it('forwards only validated model and content to the fixed DeepSeek caller', async () => {
    const upstreamFetch = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(qwenResponse(JSON.stringify({ claims: [] })))

    const response = await runExtractionHandler(
      {
        baseUrl: 'https://evil.example',
        content: 'source',
        model: 'deepseek-v4-flash',
      },
      upstreamFetch,
      'test-key',
    )

    expect(response.status).toBe(200)
    expect(upstreamFetch.mock.calls[0][0]).toBe(
      `${DASHSCOPE_BASE_URL}/chat/completions`,
    )
    expect(JSON.parse(String(upstreamFetch.mock.calls[0][1]?.body))).toMatchObject(
      {
        model: 'deepseek-v4-flash',
        messages: [
          expect.any(Object),
          { role: 'user', content: 'source' },
        ],
      },
    )
  })

  it.each([
    [
      'invalid key',
      () =>
        vi
          .fn<FetchImplementation>()
          .mockResolvedValue(qwenResponse('{}', 401)),
      401,
      'DeepSeek API Key 无效',
    ],
    [
      'rate limit',
      () =>
        vi
          .fn<FetchImplementation>()
          .mockResolvedValue(qwenResponse('{}', 429)),
      429,
      '请求过于频繁',
    ],
    [
      'timeout',
      () =>
        vi
          .fn<FetchImplementation>()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      504,
      'DeepSeek 请求超时，请重试',
    ],
    [
      'malformed response',
      () =>
        vi
          .fn<FetchImplementation>()
          .mockResolvedValue(qwenResponse('not-json')),
      502,
      'DeepSeek 返回内容不完整，请重试',
    ],
    [
      'unavailable service',
      () =>
        vi.fn<FetchImplementation>().mockRejectedValue(new Error('offline')),
      502,
      'DeepSeek 服务暂时不可用，请稍后重试',
    ],
  ])(
    'maps an upstream %s to its typed HTTP status',
    async (_name, createUpstreamFetch, expectedStatus, message) => {
      const upstreamFetch = createUpstreamFetch()
      const response = await runExtractionHandler(
        { content: 'source', model: 'deepseek-v4-flash' },
        upstreamFetch,
        'test-key',
      )

      expect(response.status).toBe(expectedStatus)
      await expect(response.json()).resolves.toEqual({ message })
    },
  )
})
