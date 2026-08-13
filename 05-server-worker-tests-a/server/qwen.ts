import { z } from 'zod'

export const DASHSCOPE_BASE_URL = 'https://api.deepseek.com'

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type QwenProxyStatus = 401 | 404 | 429 | 502 | 504

export class QwenProxyError extends Error {
  constructor(
    message: string,
    readonly status: QwenProxyStatus,
  ) {
    super(message)
    this.name = 'QwenProxyError'
  }
}

export const QWEN_TIMEOUTS = Object.freeze({
  resumeExtraction: 45_000,
  jdAnalysis: 120_000,
  companyResearch: 120_000,
  careerFit: 120_000,
  careerInspiration: 120_000,
  answerOptimization: 45_000,
  mockInterviewStart: 45_000,
  mockInterviewTurn: 30_000,
  interviewReport: 90_000,
  health: 10_000,
  default: 45_000,
})

const QWEN_TIMEOUT_ENV = Object.freeze({
  resumeExtraction: 'DEEPSEEK_TIMEOUT_RESUME_EXTRACTION_MS',
  jdAnalysis: 'DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS',
  companyResearch: 'DEEPSEEK_TIMEOUT_COMPANY_RESEARCH_MS',
  careerFit: 'DEEPSEEK_TIMEOUT_CAREER_FIT_MS',
  careerInspiration: 'DEEPSEEK_TIMEOUT_CAREER_INSPIRATION_MS',
  answerOptimization: 'DEEPSEEK_TIMEOUT_ANSWER_OPTIMIZATION_MS',
  mockInterviewStart: 'DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_START_MS',
  mockInterviewTurn: 'DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_TURN_MS',
  interviewReport: 'DEEPSEEK_TIMEOUT_INTERVIEW_REPORT_MS',
  health: 'DEEPSEEK_TIMEOUT_HEALTH_MS',
  default: 'DEEPSEEK_TIMEOUT_DEFAULT_MS',
})

export function resolveQwenTimeout(
  taskName: keyof typeof QWEN_TIMEOUTS,
  env: Record<string, string | undefined> = process.env,
) {
  const fallback = QWEN_TIMEOUTS[taskName] ?? QWEN_TIMEOUTS.default
  const raw = env[QWEN_TIMEOUT_ENV[taskName] ?? QWEN_TIMEOUT_ENV.default]
    ?? env[QWEN_TIMEOUT_ENV.default]
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 300_000
    ? Math.round(parsed)
    : fallback
}

const extractionPayloadSchema = z.object({
  claims: z.array(
    z.object({
      kind: z.enum([
        'responsibility',
        'action',
        'result',
        'capability',
        'tool',
        'ai',
        'certificate',
      ]),
      label: z.string().min(1),
      detail: z.string().default(''),
      quote: z.string().min(1),
    }),
  ),
})

function formatError(): QwenProxyError {
  return new QwenProxyError('DeepSeek 返回内容不完整，请重试', 502)
}

function timeoutError(): QwenProxyError {
  return new QwenProxyError('DeepSeek 请求超时，请重试', 504)
}

function isAbortError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

async function callQwenWithSchema<T>(
  apiKey: string,
  model: string,
  instruction: string,
  input: string,
  payloadSchema: z.ZodType<T>,
  fetchImplementation: FetchImplementation = fetch,
  timeoutMs = resolveQwenTimeout('default'),
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImplementation(
      `${DASHSCOPE_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: input },
          ],
          response_format: { type: 'json_object' },
          stream: false,
          thinking: { type: 'disabled' },
          max_tokens: 8192,
        }),
        signal: controller.signal,
      },
    )

    if (response.status === 401 || response.status === 403) {
      throw new QwenProxyError('DeepSeek API Key 无效', 401)
    }
    if (response.status === 429) {
      throw new QwenProxyError('请求过于频繁', 429)
    }
    if (response.status === 404) {
      throw new QwenProxyError('DeepSeek 模型不可用', 404)
    }
    if (!response.ok) {
      throw new QwenProxyError('DeepSeek 服务暂时不可用，请稍后重试', 502)
    }

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw timeoutError()
      }
      throw formatError()
    }

    const choice = (
      responseBody as {
        choices?: Array<{
          finish_reason?: unknown
          message?: { content?: unknown }
        }>
      }
    ).choices?.[0]
    if (choice?.finish_reason === 'length') {
      throw formatError()
    }
    const content = choice?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw formatError()
    }

    let payload: unknown
    try {
      const normalizedContent = content
        .trim()
        .replace(/^```(?:json)?\s*/iu, '')
        .replace(/\s*```$/u, '')
      payload = JSON.parse(normalizedContent)
    } catch {
      throw formatError()
    }

    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) {
      throw formatError()
    }
    return parsed.data
  } catch (error) {
    if (error instanceof QwenProxyError) {
      throw error
    }
    if (controller.signal.aborted || isAbortError(error)) {
      throw timeoutError()
    }
    throw new QwenProxyError('DeepSeek 服务暂时不可用，请稍后重试', 502)
  } finally {
    clearTimeout(timeout)
  }
}

export function callQwen(
  apiKey: string,
  model: string,
  instruction: string,
  input: string,
  fetchImplementation: FetchImplementation = fetch,
  timeoutMs = 30_000,
) {
  return callQwenWithSchema(
    apiKey,
    model,
    instruction,
    input,
    extractionPayloadSchema,
    fetchImplementation,
    timeoutMs,
  )
}

export function callQwenForSchema<T>(
  apiKey: string,
  model: string,
  instruction: string,
  input: string,
  schema: z.ZodType<T>,
  fetchImplementation: FetchImplementation = fetch,
  timeoutMs = 30_000,
) {
  return callQwenWithSchema(
    apiKey,
    model,
    instruction,
    input,
    schema,
    fetchImplementation,
    timeoutMs,
  )
}
