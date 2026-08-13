import { careerDirectionMarketAnalysisSchema } from '../domain/careerSchemas'
import { safeAIErrorMessage } from './safeOutput'

export const DEEPSEEK_API_KEY_STORAGE_KEY = 'offer-adventure:deepseek-api-key'
export const DEEPSEEK_MODEL_STORAGE_KEY = 'offer-adventure:deepseek-model'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export type BrowserDeepSeekConfig = {
  apiKey: string
  model: string
}

export function readBrowserDeepSeekConfig(): BrowserDeepSeekConfig | null {
  if (typeof localStorage === 'undefined') return null
  const apiKey = localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY)?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    model:
      localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY)?.trim() ||
      DEFAULT_DEEPSEEK_MODEL,
  }
}

export function aiRequestBody(payload: Record<string, unknown>) {
  const clientDeepSeek = readBrowserDeepSeekConfig()
  return JSON.stringify(clientDeepSeek ? { ...payload, clientDeepSeek } : payload)
}

export type AIServiceErrorCode =
  | 'DEEPSEEK_NOT_CONFIGURED'
  | 'DEEPSEEK_AUTH_FAILED'
  | 'DEEPSEEK_MODEL_NOT_FOUND'
  | 'DEEPSEEK_RATE_LIMITED'
  | 'DEEPSEEK_QUOTA_EXHAUSTED'
  | 'DEEPSEEK_TIMEOUT'
  | 'DEEPSEEK_ABORTED'
  | 'DEEPSEEK_NETWORK_ERROR'
  | 'DEEPSEEK_INVALID_RESPONSE'
  | 'DEEPSEEK_SCHEMA_VALIDATION_FAILED'

type ProxyErrorBody = {
  message?: unknown
  code?: unknown
  taskName?: unknown
  requestId?: unknown
  timeoutMs?: unknown
  retryable?: unknown
}

export class AIServiceError extends Error {
  readonly name = 'AIServiceError'

  constructor(
    message: string,
    readonly code?: AIServiceErrorCode,
    readonly taskName?: string,
    readonly requestId?: string,
    readonly timeoutMs?: number,
    readonly retryable?: boolean,
  ) {
    super(message)
  }
}

export function serviceError(body: unknown, fallback: string) {
  const value = (body ?? {}) as ProxyErrorBody
  const message = safeAIErrorMessage(body, fallback)
  const knownCodes: AIServiceErrorCode[] = [
    'DEEPSEEK_NOT_CONFIGURED',
    'DEEPSEEK_AUTH_FAILED',
    'DEEPSEEK_MODEL_NOT_FOUND',
    'DEEPSEEK_RATE_LIMITED',
    'DEEPSEEK_QUOTA_EXHAUSTED',
    'DEEPSEEK_TIMEOUT',
    'DEEPSEEK_ABORTED',
    'DEEPSEEK_NETWORK_ERROR',
    'DEEPSEEK_INVALID_RESPONSE',
    'DEEPSEEK_SCHEMA_VALIDATION_FAILED',
  ]
  const code =
    typeof value.code === 'string' &&
    knownCodes.includes(value.code as AIServiceErrorCode)
      ? (value.code as AIServiceErrorCode)
      : undefined
  return new AIServiceError(
    message,
    code,
    typeof value.taskName === 'string' ? value.taskName : undefined,
    typeof value.requestId === 'string' ? value.requestId : undefined,
    typeof value.timeoutMs === 'number' ? value.timeoutMs : undefined,
    typeof value.retryable === 'boolean' ? value.retryable : undefined,
  )
}

export async function requestExtraction(
  content: string,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/ai/extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: aiRequestBody({ content }),
    ...(signal ? { signal } : {}),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('DeepSeek请求失败，请重试')
  }

  if (!response.ok) {
    throw serviceError(body, 'DeepSeek请求失败，请重试')
  }

  return body
}

export async function requestJdAnalysis(
  jdText: string,
  profileContext: unknown,
  identity?: {
    companyName: string
    companyWebsite?: string
    companyIndustry?: string
    roleName: string
  },
  signal?: AbortSignal,
) {
  if (!jdText.trim()) {
    throw new Error('请输入完整 JD')
  }

  const response = await fetch('/api/jd-analysis', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: aiRequestBody({ jdText, profileContext, ...identity }),
    ...(signal ? { signal } : {}),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('JD 分析失败，请重试')
  }

  if (!response.ok) {
    throw serviceError(body, 'JD 分析失败，请重试')
  }

  return body
}

export async function requestCareerInspiration(
  payload: {
    evidenceUnits: unknown[]
    savedDirections: string[]
    excludedDirections: string[]
    feedback: unknown[]
  },
  signal?: AbortSignal,
) {
  const response = await fetch('/api/career-inspiration', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: aiRequestBody(payload),
    signal,
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('岗位灵感生成失败，请重试')
  }
  if (!response.ok) {
    throw serviceError(body, '岗位灵感生成失败，请重试')
  }
  return body
}

export async function requestCareerDirectionAnalysis(
  payload: {
    directionId: string
    directionName: string
    possibleTitles: string[]
    evidenceUnits: unknown[]
  },
  signal?: AbortSignal,
) {
  const response = await fetch('/api/career-direction-analysis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: aiRequestBody(payload),
    signal,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw serviceError(body, '岗位分析暂时不可用，请稍后重试。')
  }
  return careerDirectionMarketAnalysisSchema.parse(body)
}

export interface AIHealthResult {
  provider: 'deepseek'
  configured: boolean
  reachable: boolean
  authenticated: boolean
  modelAvailable: boolean
  latencyMs?: number
  errorCode?: AIServiceErrorCode
}

export async function requestAiHealth(signal?: AbortSignal) {
  const clientDeepSeek = readBrowserDeepSeekConfig()
  const response = await fetch(
    '/api/ai/health',
    clientDeepSeek
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientDeepSeek }),
          signal,
        }
      : { signal },
  )
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw serviceError(body, '智能分析服务状态检查失败')
  }
  return body as AIHealthResult
}
