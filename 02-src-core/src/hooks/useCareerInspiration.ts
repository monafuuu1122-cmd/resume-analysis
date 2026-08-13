import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AIServiceError,
  requestAiHealth,
  type AIHealthResult,
} from '../ai/client'
import {
  careerInspirationResultSchema,
  type CareerInspirationResult,
} from '../domain/careerSchemas'

export type CareerInspirationLifecycle =
  | 'idle'
  | 'checking-ai-service'
  | 'reading-profile'
  | 'generating'
  | 'completed'
  | 'insufficient-profile'
  | 'auth-failed'
  | 'timeout'
  | 'model-failed'
  | 'parse-failed'
  | 'cancelled'

interface UseCareerInspirationOptions {
  request: (signal: AbortSignal) => Promise<unknown>
  healthCheck?: (signal?: AbortSignal) => Promise<AIHealthResult>
  timeoutMs?: number
}

export function useCareerInspiration({
  request,
  healthCheck = requestAiHealth,
  timeoutMs = 150_000,
}: UseCareerInspirationOptions) {
  const [status, setStatus] =
    useState<CareerInspirationLifecycle>('idle')
  const [result, setResult] = useState<CareerInspirationResult | null>(null)
  const [error, setError] = useState('')
  const activePromise = useRef<Promise<void> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const timeoutTriggered = useRef(false)

  const cancel = useCallback(() => {
    timeoutTriggered.current = false
    controller.current?.abort()
    setStatus('cancelled')
    setError('已取消本次生成')
  }, [])

  const generate = useCallback(() => {
    if (activePromise.current) return activePromise.current
    setStatus('checking-ai-service')
    setError('')

    const operation = Promise.resolve().then(async () => {
      const abortController = new AbortController()
      controller.current = abortController
      timeoutTriggered.current = false
      let phase: 'health' | 'request' | 'parse' = 'health'
      const timeout = window.setTimeout(() => {
        timeoutTriggered.current = true
        abortController.abort()
      }, timeoutMs)
      try {
        const health = await healthCheck(abortController.signal)
        if (!health.configured || !health.authenticated) {
          setStatus('auth-failed')
          setError('智能分析服务暂时不可用，请稍后重试。')
          return
        }
        if (!health.reachable || !health.modelAvailable) {
          setStatus('model-failed')
          setError('当前模型服务暂时不可用，请稍后重新检测。')
          return
        }
        phase = 'request'
        setStatus('reading-profile')
        await Promise.resolve()
        setStatus('generating')
        const body = await request(abortController.signal)
        phase = 'parse'
        const parsed = careerInspirationResultSchema.parse(body)
        if (
          parsed.status !== 'insufficient-profile' &&
          parsed.directions.length === 0
        ) {
          throw new Error('没有生成可用方向，请补充经历后重试')
        }
        setResult(parsed)
        setStatus(
          parsed.status === 'insufficient-profile'
            ? 'insufficient-profile'
            : 'completed',
        )
      } catch (caught) {
        if (timeoutTriggered.current) {
          setStatus('timeout')
          setError('本次生成等待时间过长，已自动停止。已完成的内容不会丢失。')
        } else if (abortController.signal.aborted) {
          setStatus('cancelled')
          setError('已取消本次生成')
        } else if (
          caught instanceof AIServiceError &&
          ['DEEPSEEK_NOT_CONFIGURED', 'DEEPSEEK_AUTH_FAILED'].includes(
            caught.code ?? '',
          )
        ) {
          setStatus('auth-failed')
          setError('智能分析服务暂时不可用，请稍后重试。')
        } else if (phase === 'parse') {
          setStatus('parse-failed')
          setError(
            caught instanceof Error
              ? caught.message
              : '模型返回格式异常，请重新生成',
          )
        } else {
          setStatus('model-failed')
          setError(
            caught instanceof Error
              ? caught.message
              : '岗位灵感生成失败，请重试',
          )
        }
      } finally {
        window.clearTimeout(timeout)
        controller.current = null
        if (activePromise.current === operation) {
          activePromise.current = null
        }
      }
    })
    activePromise.current = operation
    return operation
  }, [healthCheck, request, timeoutMs])

  useEffect(() => () => controller.current?.abort(), [])

  return {
    status,
    busy: [
      'checking-ai-service',
      'reading-profile',
      'generating',
    ].includes(status),
    result,
    error,
    generate,
    retry: generate,
    cancel,
  }
}
