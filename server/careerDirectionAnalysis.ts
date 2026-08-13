import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { z } from 'zod'

import {
  buildCareerDirectionAnalysisInput,
  careerDirectionAnalysisInstruction,
} from '../src/ai/careerDirectionPrompts'
import { normalizeCareerDirectionMarketAnalysis } from '../src/ai/careerDirectionParsers'
import {
  careerDirectionMarketAnalysisSchema,
  experienceEvidenceUnitSchema,
} from '../src/domain/careerSchemas'
import {
  callQwenForSchema,
  QwenProxyError,
  resolveQwenTimeout,
  type FetchImplementation,
} from './qwen'
import { requestQwenKey } from './requestQwen'

const inputSchema = z.object({
  directionId: z.string().min(1),
  directionName: z.string().trim().min(1),
  possibleTitles: z.array(z.string()).default([]),
  evidenceUnits: z.array(experienceEvidenceUnitSchema),
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/).default('deepseek-v4-flash'),
})

const generatedSchema = z.object({
  requirements: z.array(z.record(z.unknown())).default([]),
  capabilityGaps: z.array(z.record(z.unknown())).default([]),
  mindsetGaps: z.array(z.record(z.unknown())).default([]),
})

export function createCareerDirectionAnalysisHandler({
  provider: _provider,
  qwenFetch = fetch,
  now = () => new Date(),
  createId = randomUUID,
}: {
  provider?: unknown
  qwenFetch?: FetchImplementation
  now?: () => Date
  createId?: () => string
}) {
  return async (request: Request, response: Response) => {
    const key = requestQwenKey(request)
    if (!key) return void response.status(400).json({ message: '请先配置DeepSeek API Key' })
    const input = inputSchema.safeParse(request.body)
    if (!input.success) return void response.status(400).json({ message: '岗位分析请求无效' })

    const controller = new AbortController()
    const abort = () => controller.abort()
    request.once?.('aborted', abort)
    try {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const generatedAt = now().toISOString()
      const generated = await callQwenForSchema(
        key,
        input.data.model,
        careerDirectionAnalysisInstruction,
        buildCareerDirectionAnalysisInput({
          directionName: input.data.directionName,
          possibleTitles: input.data.possibleTitles,
          evidenceUnits: input.data.evidenceUnits,
          sources: [],
        }),
        generatedSchema,
        (url, init) => qwenFetch(url, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, controller.signal])
            : controller.signal,
        }),
        resolveQwenTimeout('careerFit'),
      )
      const normalized = normalizeCareerDirectionMarketAnalysis(
        generated,
        [],
        input.data.evidenceUnits,
      )
      response.json(careerDirectionMarketAnalysisSchema.parse({
        id: createId(),
        directionId: input.data.directionId,
        directionName: input.data.directionName,
        status:
          normalized.partial ? 'partial' : 'completed',
        fitScore: normalized.fitScore,
        requirements: normalized.requirements,
        capabilityGaps: normalized.capabilityGaps,
        mindsetGaps: normalized.mindsetGaps,
        sources: [],
        knowledgeMode: 'model-knowledge',
        generatedAt,
      }))
    } catch (error) {
      if (controller.signal.aborted) {
        response.status(499).json({ message: '岗位分析已取消' })
      } else {
        response.status(error instanceof QwenProxyError ? error.status : 502).json({
          code: error instanceof QwenProxyError ? 'DEEPSEEK_INVALID_RESPONSE' : 'DEEPSEEK_NETWORK_ERROR',
          message: error instanceof QwenProxyError
            ? '岗位分析返回内容不完整，请重新生成。'
            : '岗位分析暂时不可用，请稍后重试。',
        })
      }
    } finally {
      request.off?.('aborted', abort)
    }
  }
}
