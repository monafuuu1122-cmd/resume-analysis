import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { z } from 'zod'

import {
  buildCareerInspirationInput,
  careerInspirationInstruction,
} from '../src/ai/careerPrompts'
import { parseCareerInspirationPayload } from '../src/ai/careerParsers'
import {
  careerInspirationResultSchema,
  careerProfileSummarySchema,
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
  evidenceUnits: z.array(experienceEvidenceUnitSchema),
  savedDirections: z.array(z.string()).default([]),
  excludedDirections: z.array(z.string()).default([]),
  feedback: z.array(z.record(z.unknown())).default([]),
  preferences: z.record(z.unknown()).optional(),
  model: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
    .default('deepseek-v4-flash'),
})

const looseOutputSchema = z.object({
  profileSummary: careerProfileSummarySchema.default({
    recurringWorkPatterns: [],
    coreCapabilities: [],
    transferableCapabilities: [],
    domainAssets: [],
    interestSignals: [],
  }),
  directions: z.array(z.unknown()).default([]),
})

export function createCareerInspirationHandler({
  fetchImplementation = fetch,
  now = () => new Date(),
  createId = randomUUID,
}: {
  fetchImplementation?: FetchImplementation
  now?: () => Date
  createId?: () => string
} = {}) {
  return async (request: Request, response: Response) => {
    const key = requestQwenKey(request)
    if (!key) {
      response.status(400).json({ message: '请先配置DeepSeek API Key' })
      return
    }
    const input = inputSchema.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ message: '岗位灵感请求无效' })
      return
    }
    const generatedAt = now().toISOString()
    if (input.data.evidenceUnits.length === 0) {
      response.json({
        id: createId(),
        status: 'insufficient-profile',
        profileSummary: looseOutputSchema.parse({}).profileSummary,
        directions: [],
        generatedAt,
      })
      return
    }

    try {
      let parsed:
        | ReturnType<typeof parseCareerInspirationPayload>
        | undefined
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const generated = await callQwenForSchema(
          key,
          input.data.model,
          careerInspirationInstruction,
          buildCareerInspirationInput(input.data),
          looseOutputSchema,
          fetchImplementation,
          resolveQwenTimeout('careerInspiration'),
        )
        parsed = parseCareerInspirationPayload(
          generated,
          input.data.evidenceUnits.map(({ id }) => id),
          [...input.data.savedDirections, ...input.data.excludedDirections],
        )
        if (parsed.directions.length > 0) break
      }
      const result = careerInspirationResultSchema.parse({
        id: createId(),
        status: parsed?.status ?? 'parse-failed',
        profileSummary: parsed?.profileSummary,
        directions: (parsed?.directions ?? []).map((direction) => ({
          id: createId(),
          ...direction,
        })),
        generatedAt,
      })
      response.json(result)
    } catch (error) {
      response
        .status(error instanceof QwenProxyError ? error.status : 502)
        .json({
          code:
            error instanceof QwenProxyError &&
            error.message.includes('格式')
              ? 'parse-failed'
              : 'model-failed',
          message:
            error instanceof Error
              ? error.message
              : '岗位灵感分析失败，请重试',
        })
    }
  }
}
