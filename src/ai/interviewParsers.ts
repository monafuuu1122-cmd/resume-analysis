import { jdAnalysisSchema } from '../domain/schemas'
import { z } from 'zod'

export function parseJdAnalysis(payload: unknown) {
  return jdAnalysisSchema.parse(payload)
}

export function readJdAnalysis(payload: unknown) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('matchScore' in payload)
  ) {
    return null
  }
  const result = jdAnalysisSchema.safeParse(payload)
  return result.success ? result.data : null
}

const idSchema = z.string().min(1)

const safeEnum = <T extends string>(values: readonly T[], fallback: T) =>
  z.preprocess(
    (value) => (values.includes(value as T) ? value : fallback),
    z.enum(values as [T, ...T[]]),
  )

export function createInterviewResearchGenerationSchema(
  sourceIds: Iterable<string>,
  claimIds: Iterable<string>,
  allowCompanyInsights: boolean,
) {
  const knownSources = new Set(sourceIds)
  const knownClaims = new Set(claimIds)
  const schema = z.object({
    companyInsights: z.array(z.object({
      topic: safeEnum(['company', 'culture', 'talent'] as const, 'company'),
      content: z.string().min(1),
      evidenceType: safeEnum(['official', 'public', 'inference'] as const, 'inference'),
      sourceIds: z.array(idSchema).default([]),
    })).default([]),
    competencies: z.array(z.object({
      competency: z.string().min(1),
      requirement: z.string().min(1),
      priority: safeEnum(['high', 'medium', 'low'] as const, 'medium'),
      assessment: safeEnum(['match', 'gap', 'unknown'] as const, 'unknown'),
      evidenceClaimIds: z.array(idSchema).default([]),
      sourceIds: z.array(idSchema).default([]),
    })).default([]),
    interviewPriorities: z.array(z.object({
      title: z.string().min(1),
      priority: safeEnum(['high', 'medium', 'low'] as const, 'medium'),
      rationale: z.string().min(1),
      evidenceClaimIds: z.array(idSchema).default([]),
    })).default([]),
    predictedQuestions: z.array(z.object({
      question: z.string().min(1),
      category: safeEnum(['motivation', 'competency', 'behavioral', 'case', 'culture', 'other'] as const, 'other'),
      priority: safeEnum(['high', 'medium', 'low'] as const, 'medium'),
      rationale: z.string().min(1),
      evidenceClaimIds: z.array(idSchema).default([]),
      sourceIds: z.array(idSchema).default([]),
      companyBasis: z.string().optional(),
      jdBasis: z.string().optional(),
      resumeBasis: z.string().optional(),
      validationGoal: z.string().optional(),
      followUpQuestions: z.array(z.string()).default([]),
    })).default([]),
    preparationChecklist: z.array(z.object({
      label: z.string().min(1),
    })).default([]),
  })
  return schema.superRefine((value, refinement) => {
    if (!allowCompanyInsights && value.companyInsights.length) {
      refinement.addIssue({ code: z.ZodIssueCode.custom, message: 'Company insights require reliable sources', path: ['companyInsights'] })
    }
    const sourcePaths = [
      ...value.companyInsights.map((item, index) => [item.sourceIds, ['companyInsights', index, 'sourceIds']] as const),
      ...value.competencies.map((item, index) => [item.sourceIds, ['competencies', index, 'sourceIds']] as const),
      ...value.predictedQuestions.map((item, index) => [item.sourceIds, ['predictedQuestions', index, 'sourceIds']] as const),
    ]
    sourcePaths.forEach(([ids, path]) => ids.forEach((id, index) => {
      if (!knownSources.has(id)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown source', path: [...path, index] })
    }))
    const claimPaths = [
      ...value.competencies.map((item, index) => [item.evidenceClaimIds, ['competencies', index, 'evidenceClaimIds']] as const),
      ...value.interviewPriorities.map((item, index) => [item.evidenceClaimIds, ['interviewPriorities', index, 'evidenceClaimIds']] as const),
      ...value.predictedQuestions.map((item, index) => [item.evidenceClaimIds, ['predictedQuestions', index, 'evidenceClaimIds']] as const),
    ]
    claimPaths.forEach(([ids, path]) => ids.forEach((id, index) => {
      if (!knownClaims.has(id)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown claim', path: [...path, index] })
    }))
    value.competencies.forEach((item, index) => {
      if (item.assessment === 'match' && !item.evidenceClaimIds.length) {
        refinement.addIssue({ code: z.ZodIssueCode.custom, message: 'Match requires candidate evidence', path: ['competencies', index, 'evidenceClaimIds'] })
      }
    })
  })
}

export const answerOptimizationGenerationSchema = z.object({
  optimizedAnswerZh: z.string().min(1),
  optimizedAnswerEn: z.string().min(1),
  improvements: z.array(z.string().min(1)).default([]),
  evidenceClaimIds: z.array(idSchema).default([]),
})

export const questionPracticeGenerationSchema = z.object({
  answerCoverage: z.string().min(1),
  evidenceAssessment: z.string().min(1),
  roleRelevance: z.string().min(1),
  risks: z.array(z.string().min(1)).default([]),
  improvements: z.array(z.string().min(1)).default([]),
  followUpQuestions: z.array(z.string().min(1)).default([]),
  evidenceClaimIds: z.array(idSchema).default([]),
})

export const mockSessionGenerationSchema = z.object({
  question: z.string().min(1),
  questionType: z.enum(['motivation', 'experience', 'business', 'competency', 'scenario', 'behavioral']).default('experience'),
  focusDimension: z.string().min(1).default('综合表现'),
})
export const mockTurnGenerationSchema = z.object({
  feedback: z.string().min(1),
  nextQuestion: z.string().min(1),
  questionType: z.enum(['motivation', 'experience', 'business', 'competency', 'scenario', 'behavioral']).default('experience'),
  focusDimension: z.string().min(1).default('综合表现'),
  followUpReason: z.string().min(1).default('继续核实回答中的关键信息'),
})
export const mockCompleteGenerationSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string().min(1)).default([]),
  improvements: z.array(z.string().min(1)).default([]),
})
