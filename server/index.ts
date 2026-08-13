import express, {
  type NextFunction,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { z } from 'zod'

import { extractionInstruction } from '../src/ai/prompts'
import {
  buildJdAnalysisInput,
  jdAnalysisInstruction,
} from '../src/ai/interviewPrompts'
import {
  interviewProfileContextSchema,
  jdAnalysisSchema,
} from '../src/domain/schemas'
import { calibrateJdMatchScore } from '../src/domain/jdCalibration'
import {
  callQwen,
  callQwenForSchema,
  QwenProxyError,
  resolveQwenTimeout,
  type FetchImplementation,
} from './qwen'
import {
  createAnswerOptimizationHandler,
  createInterviewResearchHandler,
  createQuestionPracticeHandler,
  createMockInterviewCompleteHandler,
  createMockInterviewSessionHandler,
  createMockInterviewTurnHandler,
} from './interview'
import { createCareerInspirationHandler } from './career'
import { createCareerDirectionAnalysisHandler } from './careerDirectionAnalysis'
import { requestQwenKey } from './requestQwen'

const DEFAULT_MODEL = 'deepseek-v4-flash'
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
const DEFAULT_PORT = 8787
const HEALTH_MODEL_INSTRUCTION = '只回复 JSON：{"status":"ok"}'
const healthResponseSchema = z.object({ status: z.string().min(1) })
const jdAnalysisResponseSchema = z.unknown()

function rawRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function rawList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function rawText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeJdAnalysisPayload(payload: unknown) {
  const raw = rawRecord(payload)
  const score = typeof raw.matchScore === 'number' ? raw.matchScore : Number(raw.matchScore)
  const result = {
    company: rawText(raw.company, '待补充'),
    role: rawText(raw.role, '待补充'),
    department: rawText(raw.department, '待补充'),
    location: rawText(raw.location, '待补充'),
    level: rawText(raw.level, '待补充'),
    businessKeywords: rawList(raw.businessKeywords)
      .map((value) => rawText(value))
      .filter(Boolean),
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    evidenceCoverage: rawText(raw.evidenceCoverage, '待补充'),
    strengths: rawList(raw.strengths)
      .map((value) => {
        const item = rawRecord(value)
        return {
          title: rawText(item.title),
          explanation: rawText(item.explanation),
          evidenceClaimIds: rawList(item.evidenceClaimIds)
            .map((id) => rawText(id))
            .filter(Boolean),
          profileMaterialIds: rawList(item.profileMaterialIds)
            .map((id) => rawText(id))
            .filter(Boolean),
        }
      })
      .filter((item) => item.title && item.explanation),
    gaps: rawList(raw.gaps)
      .map((value) => {
        const item = rawRecord(value)
        return {
          title: rawText(item.title),
          explanation: rawText(item.explanation),
        }
      })
      .filter((item) => item.title && item.explanation),
    resumeRewrites: rawList(raw.resumeRewrites)
      .map((value) => {
        const item = rawRecord(value)
        return {
          sourceClaimId: rawText(item.sourceClaimId),
          original: rawText(item.original),
          rewritten: rawText(item.rewritten),
          rationale: rawText(item.rationale),
          supportingClaimIds: rawList(item.supportingClaimIds)
            .map((id) => rawText(id))
            .filter(Boolean),
          profileMaterialIds: rawList(item.profileMaterialIds)
            .map((id) => rawText(id))
            .filter(Boolean),
          ...(rawText(item.targetRequirement)
            ? { targetRequirement: rawText(item.targetRequirement) }
            : {}),
        }
      })
      .filter((item) => item.sourceClaimId && item.original && item.rewritten && item.rationale),
    interviewDimensions: rawList(raw.interviewDimensions)
      .map((value) => {
        const item = rawRecord(value)
        const priority = rawText(item.priority)
        return {
          dimension: rawText(item.dimension),
          priority: priority === 'high' || priority === 'low' ? priority : 'medium',
          focus: rawText(item.focus),
          evidenceClaimIds: rawList(item.evidenceClaimIds)
            .map((id) => rawText(id))
            .filter(Boolean),
        }
      })
      .filter((item) => item.dimension && item.focus),
  }
  return jdAnalysisSchema.parse(result)
}
type HealthErrorCode =
  | 'DEEPSEEK_MODEL_NOT_FOUND'
  | 'DEEPSEEK_AUTH_FAILED'
  | 'DEEPSEEK_RATE_LIMITED'
  | 'DEEPSEEK_TIMEOUT'
  | 'DEEPSEEK_NETWORK_ERROR'

function normalizeJdAnalysisResult(
  analysis: z.infer<typeof jdAnalysisSchema>,
  knownClaimIds: Iterable<string>,
  knownProfileMaterialIds: Iterable<string>,
) {
  const claims = new Set(knownClaimIds)
  const materials = new Set(knownProfileMaterialIds)
  return {
    ...analysis,
    strengths: analysis.strengths
      .map((item) => ({
        ...item,
        evidenceClaimIds: item.evidenceClaimIds.filter((id) => claims.has(id)),
        profileMaterialIds: item.profileMaterialIds?.filter((id) => materials.has(id)),
      }))
      .filter((item) => item.evidenceClaimIds.length || item.profileMaterialIds?.length),
    resumeRewrites: analysis.resumeRewrites
      .map((item) => ({
        ...item,
        supportingClaimIds: item.supportingClaimIds?.filter((id) => claims.has(id)),
        profileMaterialIds: item.profileMaterialIds?.filter((id) => materials.has(id)),
      }))
      .filter((item) => claims.has(item.sourceClaimId)),
    interviewDimensions: analysis.interviewDimensions.map((item) => ({
      ...item,
      evidenceClaimIds: item.evidenceClaimIds.filter((id) => claims.has(id)),
    })),
  }
}

export const productionDistDirectory = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  'dist',
  'client',
)

export function resolveServerDistDirectory(value: string | undefined) {
  const candidate = value?.trim()
  return candidate ? resolve(candidate) : productionDistDirectory
}

export function resolveServerPort(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return DEFAULT_PORT
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : DEFAULT_PORT
}

export function createServiceStatusHandler(
  _env: Record<string, string | undefined> = process.env,
) {
  return (_request: ExpressRequest, response: ExpressResponse) => {
    response.json({
      researchConfigured: true,
    })
  }
}

export function createAiHealthHandler(
  fetchImplementation: FetchImplementation = fetch,
) {
  return async (request: ExpressRequest, response: ExpressResponse) => {
    const apiKey = requestQwenKey(request)
    if (!apiKey) {
      response.json({
        provider: 'deepseek',
        configured: false,
        reachable: false,
        authenticated: false,
        modelAvailable: false,
        errorCode: 'DEEPSEEK_NOT_CONFIGURED',
      })
      return
    }

    const modelValue = request.body?.clientDeepSeek?.model ?? DEFAULT_MODEL
    if (
      typeof modelValue !== 'string' ||
      !MODEL_PATTERN.test(modelValue.trim())
    ) {
      response.json({
        provider: 'deepseek',
        configured: true,
        reachable: true,
        authenticated: true,
        modelAvailable: false,
        errorCode: 'DEEPSEEK_MODEL_NOT_FOUND',
      })
      return
    }

    const startedAt = Date.now()
    try {
      await callQwenForSchema(
        apiKey,
        modelValue.trim(),
        HEALTH_MODEL_INSTRUCTION,
        HEALTH_MODEL_INSTRUCTION,
        healthResponseSchema,
        fetchImplementation,
        resolveQwenTimeout('health'),
      )
      response.json({
        provider: 'deepseek',
        configured: true,
        reachable: true,
        authenticated: true,
        modelAvailable: true,
        latencyMs: Date.now() - startedAt,
      })
    } catch (error) {
      const errorCode: HealthErrorCode =
        error instanceof QwenProxyError
          ? error.status === 401
            ? 'DEEPSEEK_AUTH_FAILED'
            : error.status === 404
              ? 'DEEPSEEK_MODEL_NOT_FOUND'
            : error.status === 429
              ? 'DEEPSEEK_RATE_LIMITED'
              : error.status === 504
                ? 'DEEPSEEK_TIMEOUT'
                : 'DEEPSEEK_NETWORK_ERROR'
          : 'DEEPSEEK_NETWORK_ERROR'
      response.json({
        provider: 'deepseek',
        configured: true,
        reachable: !['DEEPSEEK_NETWORK_ERROR', 'DEEPSEEK_TIMEOUT'].includes(errorCode),
        authenticated: errorCode !== 'DEEPSEEK_AUTH_FAILED',
        modelAvailable: String(errorCode) !== 'DEEPSEEK_MODEL_NOT_FOUND',
        latencyMs: Date.now() - startedAt,
        errorCode,
      })
    }
  }
}

export function createSpaFallbackHandler(
  distDirectory = productionDistDirectory,
) {
  return (
    request: ExpressRequest,
    response: ExpressResponse,
    next: NextFunction,
  ) => {
    if (
      request.method !== 'GET' ||
      request.path?.startsWith('/api/')
    ) {
      next()
      return
    }
    response.sendFile('index.html', { root: distDirectory })
  }
}

export function createExtractionHandler(
  fetchImplementation: FetchImplementation = fetch,
) {
  return async (request: ExpressRequest, response: ExpressResponse) => {
    const apiKey = requestQwenKey(request)
    if (!apiKey) {
      response.status(400).json({ message: '请先配置DeepSeek API Key' })
      return
    }

    const content =
      typeof request.body?.content === 'string' ? request.body.content : ''
    if (!content.trim()) {
      response.status(400).json({ message: '请输入需要提炼的内容' })
      return
    }

    const modelValue = request.body?.model ?? DEFAULT_MODEL
    if (
      typeof modelValue !== 'string' ||
      !MODEL_PATTERN.test(modelValue.trim())
    ) {
      response.status(400).json({ message: 'DeepSeek模型名称无效' })
      return
    }

    try {
      const result = await callQwen(
        apiKey,
        modelValue.trim(),
        extractionInstruction,
        content,
        fetchImplementation,
        resolveQwenTimeout('resumeExtraction'),
      )
      response.json(result)
    } catch (error) {
      response.status(error instanceof QwenProxyError ? error.status : 502).json({
        message:
          error instanceof QwenProxyError
            ? error.message
            : 'DeepSeek服务暂时不可用，请稍后重试',
      })
    }
  }
}

export function createJdAnalysisHandler(
  fetchImplementation: FetchImplementation = fetch,
) {
  return async (request: ExpressRequest, response: ExpressResponse) => {
    const apiKey = requestQwenKey(request)
    if (!apiKey) {
      response.status(400).json({ message: '请先配置DeepSeek API Key' })
      return
    }
    const jdText =
      typeof request.body?.jdText === 'string' ? request.body.jdText.trim() : ''
    if (!jdText) {
      response.status(400).json({ message: '请输入完整 JD' })
      return
    }
    const modelValue = request.body?.model ?? DEFAULT_MODEL
    if (
      typeof modelValue !== 'string' ||
      !MODEL_PATTERN.test(modelValue.trim())
    ) {
      response.status(400).json({ message: 'DeepSeek模型名称无效' })
      return
    }
    const profileContext = interviewProfileContextSchema.safeParse(
      request.body?.profileContext,
    )
    if (!profileContext.success) {
      response.status(400).json({ message: '候选人证据上下文无效' })
      return
    }
    const companyIdentity = {
      companyName:
        typeof request.body?.companyName === 'string'
          ? request.body.companyName.trim()
          : '',
      companyWebsite:
        typeof request.body?.companyWebsite === 'string'
          ? request.body.companyWebsite.trim()
          : '',
      companyIndustry:
        typeof request.body?.companyIndustry === 'string'
          ? request.body.companyIndustry.trim()
          : '',
      roleName:
        typeof request.body?.roleName === 'string'
          ? request.body.roleName.trim()
          : '',
    }

    try {
      const rawResult = await callQwenForSchema(
        apiKey,
        modelValue.trim(),
        jdAnalysisInstruction,
        buildJdAnalysisInput(jdText, profileContext.data, companyIdentity),
        jdAnalysisResponseSchema,
        fetchImplementation,
        resolveQwenTimeout('jdAnalysis'),
      )
      const result = normalizeJdAnalysisPayload(rawResult)
      const normalized = normalizeJdAnalysisResult(
        result,
        profileContext.data.claims.map((claim) => claim.id),
        profileContext.data.profileMaterials?.map((material) => material.id) ?? [],
      )
      const calibrated = calibrateJdMatchScore(normalized, profileContext.data)
      response.json({
        ...calibrated,
        company: companyIdentity.companyName || calibrated.company,
        role: companyIdentity.roleName || calibrated.role,
      })
    } catch (error) {
      response.status(error instanceof QwenProxyError ? error.status : 502).json({
        message:
          error instanceof QwenProxyError
            ? error.message
            : 'DeepSeek服务暂时不可用，请稍后重试',
      })
    }
  }
}

export function createServer(
  fetchImplementation: FetchImplementation = fetch,
  distDirectory = productionDistDirectory,
) {
  const app = express()
  const interviewDependencies = {
    qwenFetch: fetchImplementation,
  }
  app.use(express.json({ limit: '2mb' }))
  app.get('/api/service-status', createServiceStatusHandler())
  app.get('/api/ai/health', createAiHealthHandler(fetchImplementation))
  app.post('/api/ai/health', createAiHealthHandler(fetchImplementation))
  app.post('/api/ai/extract', createExtractionHandler(fetchImplementation))
  app.post('/api/jd-analysis', createJdAnalysisHandler(fetchImplementation))
  app.post(
    '/api/career-inspiration',
    createCareerInspirationHandler({ fetchImplementation }),
  )
  app.post(
    '/api/career-direction-analysis',
    createCareerDirectionAnalysisHandler({ qwenFetch: fetchImplementation }),
  )
  app.post(
    '/api/interview-research',
    createInterviewResearchHandler(interviewDependencies),
  )
  app.post(
    '/api/interview-research/:analysisId/regenerate',
    createInterviewResearchHandler(interviewDependencies),
  )
  app.post(
    '/api/interview-research/:analysisId/company-only',
    createInterviewResearchHandler(interviewDependencies, true),
  )
  app.post(
    '/api/answer-optimization',
    createAnswerOptimizationHandler(interviewDependencies),
  )
  app.post(
    '/api/mock-interview/question-practice',
    createQuestionPracticeHandler(interviewDependencies),
  )
  app.post(
    '/api/mock-interview/session',
    createMockInterviewSessionHandler(interviewDependencies),
  )
  app.post(
    '/api/mock-interview/:sessionId/turn',
    createMockInterviewTurnHandler(interviewDependencies),
  )
  app.post(
    '/api/mock-interview/:sessionId/complete',
    createMockInterviewCompleteHandler(interviewDependencies),
  )
  app.use(express.static(distDirectory))
  app.use(createSpaFallbackHandler(distDirectory))
  return app
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (fileURLToPath(import.meta.url) === entryPath) {
  createServer(
    fetch,
    resolveServerDistDirectory(process.env.HTML_DIST_DIR),
  ).listen(resolveServerPort(process.env.PORT))
}
