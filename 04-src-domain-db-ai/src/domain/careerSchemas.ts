import { z } from 'zod'

const idSchema = z.string().min(1)

export const experienceEvidenceUnitSchema = z.object({
  id: idSchema,
  experienceId: z.string().optional(),
  claimId: z.string().optional(),
  sourceLabel: z.string().min(1),
  organization: z.string().optional(),
  role: z.string().optional(),
  project: z.string().optional(),
  evidenceType: z.enum([
    'responsibility',
    'action',
    'result',
    'skill',
    'method',
    'collaboration',
    'leadership',
    'insight',
    'interest',
    'domain-knowledge',
  ]),
  originalText: z.string().min(1),
  normalizedDescription: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  stakeholders: z.array(z.string()).default([]),
  measurableResult: z.string().optional(),
  personalContribution: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
})

export const careerProfileSummarySchema = z.object({
  recurringWorkPatterns: z.array(z.string()).default([]),
  coreCapabilities: z.array(z.string()).default([]),
  transferableCapabilities: z.array(z.string()).default([]),
  domainAssets: z.array(z.string()).default([]),
  interestSignals: z.array(z.string()).default([]),
})

export const careerInspirationCardSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().default(''),
  directionType: z.enum(['direct', 'adjacent', 'hybrid', 'exploratory']),
  fitScore: z.number().min(0).max(100),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: z.string().min(1),
  whySuitable: z.string().min(1),
  matchedEvidenceIds: z.array(idSchema).min(1),
  transferableCapabilities: z.array(z.string()).default([]),
  evidenceGaps: z.array(z.string()).default([]),
  differenceFromExisting: z.string().default(''),
  transitionDifficulty: z.enum(['low', 'medium', 'high']),
  possibleTitles: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  searchKeywords: z.array(z.string()).default([]),
})

export const careerInspirationStatusSchema = z.enum([
  'idle',
  'reading-profile',
  'extracting-capabilities',
  'generating',
  'completed',
  'partial',
  'insufficient-profile',
  'model-failed',
  'parse-failed',
])

export const careerInspirationResultSchema = z.object({
  id: idSchema,
  status: careerInspirationStatusSchema,
  profileSummary: careerProfileSummarySchema,
  directions: z.array(careerInspirationCardSchema.extend({ id: idSchema })),
  generatedAt: z.string().datetime(),
})

export const careerMarketSourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().optional(),
  accessedAt: z.string().datetime(),
})

export const careerRequirementMatchStatusSchema = z.enum([
  'advantage',
  'basic-match',
  'evidence-gap',
  'clear-gap',
  'confirm',
])

export const careerMarketRequirementSchema = z.object({
  id: idSchema,
  requirement: z.string().min(1),
  category: z.enum([
    'responsibility',
    'capability',
    'knowledge',
    'working-style',
  ]),
  importance: z.enum(['high', 'medium', 'low']),
  sourceIds: z.array(idSchema).default([]),
  evidenceIds: z.array(idSchema),
  evidenceExcerpts: z.array(z.string().min(1)),
  matchReason: z.string().min(1),
  matchStatus: careerRequirementMatchStatusSchema,
  preparationAdvice: z.string().min(1),
})

export const careerMarketGapSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  action: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
})

export const careerDirectionMarketAnalysisSchema = z.object({
  id: idSchema,
  directionId: idSchema,
  directionName: z.string().min(1),
  status: z.enum(['completed', 'partial', 'no-reliable-info']),
  fitScore: z.number().min(0).max(100),
  requirements: z.array(careerMarketRequirementSchema),
  capabilityGaps: z.array(careerMarketGapSchema),
  mindsetGaps: z.array(careerMarketGapSchema),
  sources: z.array(careerMarketSourceSchema),
  knowledgeMode: z.literal('model-knowledge').optional(),
  generatedAt: z.string().datetime(),
})

export type CareerInspirationCard = z.infer<
  typeof careerInspirationCardSchema
>
export type CareerInspirationResult = z.infer<
  typeof careerInspirationResultSchema
>
export type ExperienceEvidenceUnitInput = z.infer<
  typeof experienceEvidenceUnitSchema
>
export type CareerDirectionMarketAnalysis = z.infer<
  typeof careerDirectionMarketAnalysisSchema
>
