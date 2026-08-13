import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import {
  answerOptimizationInstruction,
  buildInterviewInput,
  interviewResearchInstruction,
  mockInterviewInstruction,
  questionPracticeInstruction,
} from '../src/ai/interviewPrompts'
import {
  answerOptimizationGenerationSchema,
  createInterviewResearchGenerationSchema,
  mockCompleteGenerationSchema,
  mockSessionGenerationSchema,
  mockTurnGenerationSchema,
  questionPracticeGenerationSchema,
} from '../src/ai/interviewParsers'
import {
  answerOptimizationSchema,
  interviewResearchSchema,
  mockInterviewSessionSchema,
  questionPracticeSchema,
} from '../src/domain/interviewSchemas'
import { normalizeInterviewResearchGeneration } from '../src/domain/interviewResearchNormalization'
import {
  interviewProfileContextSchema,
  jdAnalysisSchema,
} from '../src/domain/schemas'
import {
  callQwenForSchema,
  QwenProxyError,
  resolveQwenTimeout,
  type FetchImplementation,
} from './qwen'
import type { ResearchProvider } from './research/provider'
import { requestQwenKey } from './requestQwen'

const modelSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/).default('deepseek-v4-flash')
const researchInputSchema = z.object({
  analysisId: z.string().min(1),
  companyName: z.string().trim().min(1).optional(),
  companyWebsite: z.string().trim().optional(),
  companyIndustry: z.string().trim().optional(),
  roleName: z.string().trim().optional(),
  jdText: z.string().trim().min(1),
  analysis: jdAnalysisSchema,
  profileContext: interviewProfileContextSchema,
  model: modelSchema.optional(),
})
const answerInputSchema = z.object({
  analysisId: z.string().min(1),
  question: z.string().trim().min(1),
  originalAnswer: z.string().trim().min(1),
  companyIdentity: z.record(z.unknown()).optional(),
  jdText: z.string().optional(),
  analysis: jdAnalysisSchema.optional(),
  research: interviewResearchSchema.optional(),
  profileContext: interviewProfileContextSchema,
  model: modelSchema.optional(),
})
const questionPracticeInputSchema = z.object({
  analysisId: z.string().min(1),
  questionId: z.string().min(1),
  question: z.string().trim().min(1),
  originalAnswer: z.string().trim().min(1),
  inputMode: z.enum(['text', 'voice']).default('text'),
  companyIdentity: z.record(z.unknown()).optional(),
  jdText: z.string().optional(),
  analysis: jdAnalysisSchema.optional(),
  research: interviewResearchSchema.optional(),
  profileContext: interviewProfileContextSchema,
  model: modelSchema.optional(),
})
const contextSchema = z.record(z.unknown()).default({})
const sessionInputSchema = z.object({
  analysisId: z.string().min(1),
  mode: z.enum(['text', 'voice']),
  interviewType: z.enum(['hr', 'business']).default('business'),
  context: contextSchema,
  model: modelSchema.optional(),
})
const turnInputSchema = z.object({
  session: mockInterviewSessionSchema,
  answer: z.string().trim().min(1),
  context: contextSchema,
  model: modelSchema.optional(),
})
const completeInputSchema = z.object({
  session: mockInterviewSessionSchema,
  context: contextSchema,
  model: modelSchema.optional(),
})

export interface InterviewHandlerDependencies {
  /** Legacy test seam; model-knowledge research no longer calls a search provider. */
  provider?: ResearchProvider
  qwenFetch?: FetchImplementation
  contentFetch?: FetchImplementation
  now?: () => Date
  createId?: () => string
}

const inFlightResearch = new Set<string>()

function requestController(request: Request) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  request.once?.('aborted', abort)
  return { controller, cleanup: () => {
    request.off?.('aborted', abort)
  } }
}

function abortableFetch(fetchImplementation: FetchImplementation, signal: AbortSignal): FetchImplementation {
  return (input, init) => fetchImplementation(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
  })
}

function sendError(response: Response, error: unknown) {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
    response.status(499).json({ message: '请求已取消' })
    return
  }
  const status = error instanceof QwenProxyError ? error.status : 502
  response.status(status).json({
    code:
      error instanceof QwenProxyError &&
      error.message.includes('格式')
        ? 'parse_failed'
        : 'model_failed',
    message: error instanceof QwenProxyError ? error.message : '面试服务暂时不可用，请稍后重试',
  })
}

function apiKey(request: Request, response: Response) {
  const key = requestQwenKey(request)
  if (!key) response.status(400).json({ message: '请先配置DeepSeek API Key' })
  return key
}

function deps(input: InterviewHandlerDependencies) {
  return {
    ...input,
    qwenFetch: input.qwenFetch ?? fetch,
    now: input.now ?? (() => new Date()),
    createId: input.createId ?? randomUUID,
  }
}

export function createInterviewResearchHandler(inputDependencies: InterviewHandlerDependencies, companyOnly = false) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const key = apiKey(request, response)
    if (!key) return
    const input = researchInputSchema.safeParse(request.body)
    if (!input.success) return void response.status(400).json({ message: '面试研究请求无效' })
    if (request.params.analysisId && request.params.analysisId !== input.data.analysisId) {
      return void response.status(400).json({ message: '面试研究请求无效' })
    }
    const companyName =
      input.data.companyName || input.data.analysis.company
    if (!companyName || companyName === '待补充') {
      return void response.status(400).json({
        code: 'company_missing',
        message: '请先补充并选择企业名称',
      })
    }
    if (inFlightResearch.has(input.data.analysisId)) return void response.status(409).json({ message: '该岗位的面试研究正在进行中' })
    inFlightResearch.add(input.data.analysisId)
    const { controller, cleanup } = requestController(request)
    try {
      const sources: Array<never> = []
      const allowCompanyInsights = true
      const companyGeneratedRaw = await callQwenForSchema(
        key,
        input.data.model ?? 'deepseek-v4-flash',
        interviewResearchInstruction,
        buildInterviewInput({
          jdText: input.data.jdText,
          analysis: { ...input.data.analysis, company: companyName },
          companyIdentity: {
            companyName,
            companyWebsite: input.data.companyWebsite,
            companyIndustry: input.data.companyIndustry,
            roleName: input.data.roleName || input.data.analysis.role,
          },
          profileContext: input.data.profileContext,
          sources,
          allowCompanyInsights,
          companyOnly,
        }),
        createInterviewResearchGenerationSchema(
          sources.map(({ id }) => id),
          input.data.profileContext.claims.map(({ id }) => id),
          allowCompanyInsights,
        ),
        abortableFetch(dependencies.qwenFetch, controller.signal),
        resolveQwenTimeout('companyResearch'),
      )
      const normalizedCompany = normalizeInterviewResearchGeneration(
        companyGeneratedRaw,
        sources,
        input.data.profileContext.claims.map(({ id }) => id),
      )
      const companyGenerated = normalizedCompany.value
      let normalizationPartial = normalizedCompany.partial
      let generated = companyGenerated
      if (!companyOnly) {
        try {
          const roleGeneratedRaw = await callQwenForSchema(
              key,
              input.data.model ?? 'deepseek-v4-flash',
              interviewResearchInstruction,
              buildInterviewInput({
                jdText: input.data.jdText,
                analysis: { ...input.data.analysis, company: companyName },
                profileContext: input.data.profileContext,
                sources,
                companyInsights: companyGenerated.companyInsights,
                allowCompanyInsights,
                companyOnly: false,
              }),
              createInterviewResearchGenerationSchema(
                sources.map(({ id }) => id),
                input.data.profileContext.claims.map(({ id }) => id),
                allowCompanyInsights,
              ),
              abortableFetch(dependencies.qwenFetch, controller.signal),
              resolveQwenTimeout('companyResearch'),
            )
          const normalizedRole = normalizeInterviewResearchGeneration(
            roleGeneratedRaw,
            sources,
            input.data.profileContext.claims.map(({ id }) => id),
          )
          normalizationPartial ||= normalizedRole.partial
          generated = {
            ...normalizedRole.value,
            companyInsights: companyGenerated.companyInsights,
          }
        } catch (error) {
          if (controller.signal.aborted) throw error
          // Preserve completed company research when the second generation stage fails.
          normalizationPartial = true
          generated = companyGenerated
        }
      }
      const now = dependencies.now().toISOString()
      const addIds = <T extends object>(items: T[]) =>
        items.map((item) => ({ id: dependencies.createId(), ...item }))
      const researchStatus = (generated.companyInsights ?? []).length === 0
        ? 'no-reliable-info'
        : normalizationPartial ? 'partial' : 'completed'
      const result = interviewResearchSchema.parse({
        id: dependencies.createId(),
        analysisId: input.data.analysisId,
        researchStatus,
        identityStatus: 'confirmed',
        knowledgeMode: 'model-knowledge',
        sources,
        companyInsights: addIds(generated.companyInsights ?? []),
        competencies: companyOnly ? [] : addIds(generated.competencies ?? []),
        interviewPriorities: companyOnly ? [] : addIds(generated.interviewPriorities ?? []),
        predictedQuestions: companyOnly
          ? []
          : addIds(
              (generated.predictedQuestions ?? []).map((question) => ({
                ...question,
                priority:
                  question.priority === 'high' &&
                  (!question.companyBasis ||
                    !question.jdBasis ||
                    !question.resumeBasis)
                    ? ('medium' as const)
                    : question.priority,
              })),
            ),
        preparationChecklist: companyOnly ? [] : addIds((generated.preparationChecklist ?? []).map((item) => ({ ...item, completed: false }))),
        createdAt: now,
        updatedAt: now,
      })
      response.json(result)
    } catch (error) {
      sendError(response, controller.signal.aborted ? new DOMException('Aborted', 'AbortError') : error)
    } finally {
      cleanup()
      inFlightResearch.delete(input.data.analysisId)
    }
  }
}

export function createAnswerOptimizationHandler(inputDependencies: InterviewHandlerDependencies) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const key = apiKey(request, response)
    if (!key) return
    const input = answerInputSchema.safeParse(request.body)
    if (!input.success) return void response.status(400).json({ message: '回答优化请求无效' })
    const { controller, cleanup } = requestController(request)
    try {
      const generated = await callQwenForSchema(key, input.data.model ?? 'deepseek-v4-flash', answerOptimizationInstruction, buildInterviewInput(input.data), answerOptimizationGenerationSchema.superRefine((value, refinement) => value.evidenceClaimIds.forEach((id, index) => {
        if (!input.data.profileContext.claims.some((claim) => claim.id === id)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown claim', path: ['evidenceClaimIds', index] })
        })), abortableFetch(dependencies.qwenFetch, controller.signal), resolveQwenTimeout('answerOptimization'))
      const now = dependencies.now().toISOString()
      response.json(answerOptimizationSchema.parse({
        id: dependencies.createId(), analysisId: input.data.analysisId,
        question: input.data.question, originalAnswer: input.data.originalAnswer,
        ...generated, status: 'completed', createdAt: now, updatedAt: now,
      }))
    } catch (error) { sendError(response, controller.signal.aborted ? new DOMException('Aborted', 'AbortError') : error) }
    finally { cleanup() }
  }
}

export function createQuestionPracticeHandler(inputDependencies: InterviewHandlerDependencies) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const key = apiKey(request, response)
    if (!key) return
    const input = questionPracticeInputSchema.safeParse(request.body)
    if (!input.success) return void response.status(400).json({ message: '单题练习请求无效' })
    const { controller, cleanup } = requestController(request)
    try {
      const generated = await callQwenForSchema(
        key,
        input.data.model ?? 'deepseek-v4-flash',
        questionPracticeInstruction,
        buildInterviewInput(input.data),
        questionPracticeGenerationSchema.superRefine((value, refinement) =>
          value.evidenceClaimIds.forEach((id, index) => {
            if (!input.data.profileContext.claims.some((claim) => claim.id === id)) {
              refinement.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Unknown claim',
                path: ['evidenceClaimIds', index],
              })
            }
          }),
        ),
        abortableFetch(dependencies.qwenFetch, controller.signal),
        resolveQwenTimeout('answerOptimization'),
      )
      const now = dependencies.now().toISOString()
      response.json(questionPracticeSchema.parse({
        id: dependencies.createId(),
        analysisId: input.data.analysisId,
        questionId: input.data.questionId,
        question: input.data.question,
        originalAnswer: input.data.originalAnswer,
        inputMode: input.data.inputMode,
        ...generated,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      }))
    } catch (error) {
      sendError(response, controller.signal.aborted ? new DOMException('Aborted', 'AbortError') : error)
    } finally {
      cleanup()
    }
  }
}

async function qwen<T>(request: Request, response: Response, dependencies: ReturnType<typeof deps>, model: string, body: unknown, schema: z.ZodType<T>, taskName: 'mockInterviewStart' | 'mockInterviewTurn' | 'interviewReport') {
  const key = apiKey(request, response)
  if (!key) return
  const { controller, cleanup } = requestController(request)
  try {
    return await callQwenForSchema(key, model, mockInterviewInstruction, buildInterviewInput(body), schema, abortableFetch(dependencies.qwenFetch, controller.signal), resolveQwenTimeout(taskName))
  } catch (error) { sendError(response, controller.signal.aborted ? new DOMException('Aborted', 'AbortError') : error) }
  finally { cleanup() }
}

export function createMockInterviewSessionHandler(inputDependencies: InterviewHandlerDependencies) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const input = sessionInputSchema.safeParse(request.body)
    if (!input.success) return void response.status(400).json({ message: '模拟面试请求无效' })
    const generated = await qwen(request, response, dependencies, input.data.model ?? 'deepseek-v4-flash', { ...input.data.context, interviewType: input.data.interviewType }, mockSessionGenerationSchema, 'mockInterviewStart')
    if (!generated) return
    const now = dependencies.now().toISOString()
    response.json(mockInterviewSessionSchema.parse({
      id: dependencies.createId(), analysisId: input.data.analysisId, mode: input.data.mode, interviewType: input.data.interviewType,
      status: 'active', turns: [{ id: dependencies.createId(), sequence: 1, question: generated.question, answer: '', inputMode: input.data.mode, questionType: generated.questionType, focusDimension: generated.focusDimension, createdAt: now }],
      createdAt: now, updatedAt: now,
    }))
  }
}

export function createMockInterviewTurnHandler(inputDependencies: InterviewHandlerDependencies) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const input = turnInputSchema.safeParse(request.body)
    if (!input.success || input.data.session.id !== request.params.sessionId || input.data.session.status !== 'active') return void response.status(400).json({ message: '模拟面试轮次无效' })
    const generated = await qwen(request, response, dependencies, input.data.model ?? 'deepseek-v4-flash', input.data, mockTurnGenerationSchema, 'mockInterviewTurn')
    if (!generated) return
    const now = dependencies.now().toISOString()
    const turns = input.data.session.turns.map((turn, index, all) => index === all.length - 1 ? { ...turn, answer: input.data.answer, feedback: generated.feedback } : turn)
    turns.push({ id: dependencies.createId(), sequence: turns.length + 1, question: generated.nextQuestion, answer: '', inputMode: input.data.session.mode, questionType: generated.questionType, focusDimension: generated.focusDimension, followUpReason: generated.followUpReason, createdAt: now })
    response.json(mockInterviewSessionSchema.parse({ ...input.data.session, turns, updatedAt: now }))
  }
}

export function createMockInterviewCompleteHandler(inputDependencies: InterviewHandlerDependencies) {
  const dependencies = deps(inputDependencies)
  return async (request: Request, response: Response) => {
    const input = completeInputSchema.safeParse(request.body)
    if (!input.success || input.data.session.id !== request.params.sessionId) return void response.status(400).json({ message: '模拟面试会话无效' })
    const generated = await qwen(request, response, dependencies, input.data.model ?? 'deepseek-v4-flash', input.data, mockCompleteGenerationSchema, 'interviewReport')
    if (!generated) return
    const now = dependencies.now().toISOString()
    response.json({ session: mockInterviewSessionSchema.parse({ ...input.data.session, status: 'completed', updatedAt: now, completedAt: now }), ...generated })
  }
}
