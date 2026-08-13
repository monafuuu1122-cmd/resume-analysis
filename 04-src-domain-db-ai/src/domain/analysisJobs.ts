import { z } from 'zod'

export const analysisStageSchema = z.enum([
  'jd-analysis',
  'company-research',
  'resume-match',
  'interview-preparation',
])

export const analysisJobStatusSchema = z.enum([
  'queued',
  'running',
  'partial',
  'completed',
  'failed',
  'timeout',
  'cancelled',
])

export const analysisJobSchema = z.object({
  id: z.string().min(1),
  analysisId: z.string().min(1),
  inputHash: z.string().min(1),
  status: analysisJobStatusSchema,
  currentStage: analysisStageSchema,
  attempt: z.number().int().positive(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
})

export type AnalysisJob = z.infer<typeof analysisJobSchema>
export type AnalysisStage = z.infer<typeof analysisStageSchema>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

export async function createAnalysisInputHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`
}
