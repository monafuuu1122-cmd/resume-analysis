import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCareerInspiration } from '../src/hooks/useCareerInspiration'

const validResult = {
  id: 'inspiration-1',
  status: 'completed' as const,
  profileSummary: {
    recurringWorkPatterns: [],
    coreCapabilities: [],
    transferableCapabilities: [],
    domainAssets: [],
    interestSignals: [],
  },
  directions: [
    {
      id: 'direction-1',
      name: '内容策略',
      category: '内容',
      directionType: 'direct' as const,
      fitScore: 80,
      confidence: 'high' as const,
      summary: '匹配',
      whySuitable: '有证据',
      matchedEvidenceIds: ['evidence-1'],
      transferableCapabilities: [],
      possibleTitles: ['内容策略'],
      evidenceGaps: [],
      differenceFromExisting: '更偏策略',
      transitionDifficulty: 'low' as const,
      nextActions: [],
      searchKeywords: [],
    },
  ],
  generatedAt: '2026-07-29T00:00:00.000Z',
}

describe('useCareerInspiration', () => {
  const healthCheck = vi.fn().mockResolvedValue({
    provider: 'deepseek',
    configured: true,
    reachable: true,
    authenticated: true,
    modelAvailable: true,
  })

  it('prevents duplicate requests and settles on success', async () => {
    const request = vi.fn().mockResolvedValue(validResult)
    const { result } = renderHook(() =>
      useCareerInspiration({ request, healthCheck, timeoutMs: 100 }),
    )

    await act(async () => {
      await Promise.all([result.current.generate(), result.current.generate()])
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('completed')
    expect(result.current.busy).toBe(false)
    expect(result.current.result?.directions).toHaveLength(1)
  })

  it('aborts and exposes a retryable timeout state', async () => {
    vi.useFakeTimers()
    const request = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const { result } = renderHook(() =>
      useCareerInspiration({ request, healthCheck, timeoutMs: 50 }),
    )

    act(() => {
      void result.current.generate()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60)
    })

    expect(result.current.status).toBe('timeout')
    expect(result.current.busy).toBe(false)
    vi.useRealTimers()
  })

  it('rejects an empty completed payload', async () => {
    const request = vi.fn().mockResolvedValue({
      ...validResult,
      status: 'completed',
      directions: [],
    })
    const { result } = renderHook(() =>
      useCareerInspiration({ request, healthCheck, timeoutMs: 100 }),
    )

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.status).toBe('parse-failed')
    expect(result.current.error).toContain('没有生成可用方向')
  })

  it('short-circuits an invalid server configuration before generation', async () => {
    const request = vi.fn()
    const invalidHealth = vi.fn().mockResolvedValue({
      provider: 'deepseek',
      configured: true,
      reachable: true,
      authenticated: false,
      modelAvailable: false,
      errorCode: 'DEEPSEEK_AUTH_FAILED',
    })
    const { result } = renderHook(() =>
      useCareerInspiration({
        request,
        healthCheck: invalidHealth,
        timeoutMs: 100,
      }),
    )

    await act(async () => {
      await result.current.generate()
    })

    expect(request).not.toHaveBeenCalled()
    expect(result.current.status).toBe('auth-failed')
    expect(result.current.error).toContain('智能分析服务暂时不可用')
  })

  it('keeps the last successful result when a refresh fails', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(validResult)
      .mockRejectedValueOnce(new Error('network failed'))
    const { result } = renderHook(() =>
      useCareerInspiration({ request, healthCheck, timeoutMs: 100 }),
    )
    await act(async () => {
      await result.current.generate()
      await result.current.generate()
    })

    expect(result.current.result).toEqual(validResult)
    expect(result.current.status).toBe('model-failed')
  })
})
