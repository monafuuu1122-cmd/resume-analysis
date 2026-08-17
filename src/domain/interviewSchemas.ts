import { z } from 'zod'
import { analysisJobSchema } from './analysisJobs'

import {
  careerDirectionFeedbackSchema,
  careerDirectionSchema,
  companyTargetSchema,
  evidenceSpanSchema,
  experienceSchema,
  extractedClaimSchema,
  jdRecordSchema,
  profileMaterialSchema,
  resumeVersionSchema,
  sourceArtifactSchema,
} from './schemas'

const idSchema = z.string().min(1)
const timestampSchema = z.string().datetime()

export const researchSourceTypeSchema = z.enum([
  'official_website',
  'official_careers',
  'official_report',
  'official_social',
  'industry_media',
  'job_platform',
  'other',
])

export const researchSourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  url: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://') || url.startsWith('http://'), {
      message: 'Research source URL must use HTTP or HTTPS',
    }),
  content: z.string().min(1),
  sourceType: researchSourceTypeSchema,
  domain: z.string().optional(),
  publisher: z.string().optional(),
  contentStatus: z
    .enum(['full', 'partial', 'snippet-only', 'failed'])
    .optional(),
  failureReason: z.string().optional(),
  publishedAt: timestampSchema.optional(),
  accessedAt: timestampSchema,
})

export const companyInsightSchema = z.object({
  id: idSchema,
  topic: z.enum(['company', 'culture', 'talent']),
  content: z.string().min(1),
  evidenceType: z.enum(['official', 'public', 'inference']),
  sourceIds: z.array(idSchema),
})

export const competencyItemSchema = z.object({
  id: idSchema,
  competency: z.string().min(1),
  requirement: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  assessment: z.enum(['match', 'gap', 'unknown']),
  evidenceClaimIds: z.array(idSchema),
  sourceIds: z.array(idSchema),
})

export const interviewPrioritySchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(1),
  evidenceClaimIds: z.array(idSchema),
})

export const predictedQuestionSchema = z.object({
  id: idSchema,
  question: z.string().min(1),
  category: z.enum([
    'motivation',
    'competency',
    'behavioral',
    'case',
    'culture',
    'other',
  ]),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(1),
  evidenceClaimIds: z.array(idSchema),
  sourceIds: z.array(idSchema),
  companyBasis: z.string().optional(),
  jdBasis: z.string().optional(),
  resumeBasis: z.string().optional(),
  validationGoal: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
})

export const preparationChecklistItemSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  completed: z.boolean(),
})

const officialSourceTypes = new Set<z.infer<typeof researchSourceTypeSchema>>([
  'official_website',
  'official_careers',
  'official_report',
  'official_social',
])

export const interviewResearchSchema = z
  .object({
    id: idSchema,
    analysisId: idSchema,
    jobId: idSchema.optional(),
    companyName: z.string().optional(),
    companyIdentityHash: z.string().optional(),
    jdHash: z.string().optional(),
    researchContextHash: z.string().optional(),
    researchStatus: z.enum([
      'researching',
      'generating',
      'completed',
      'partial',
      'uncertain',
      'no-reliable-info',
      'unavailable',
      'failed',
    ]),
    identityStatus: z.enum(['confirmed', 'uncertain', 'unavailable']),
    knowledgeMode: z.literal('model-knowledge').optional(),
    sources: z.array(researchSourceSchema),
    companyInsights: z.array(companyInsightSchema),
    competencies: z.array(competencyItemSchema),
    interviewPriorities: z.array(interviewPrioritySchema),
    predictedQuestions: z.array(predictedQuestionSchema),
    preparationChecklist: z.array(preparationChecklistItemSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((research, refinement) => {
    const sources = new Map(
      research.sources.map((source) => [source.id, source]),
    )
    const validateSourceIds = (
      ids: string[],
      path: Array<string | number>,
    ) => {
      ids.forEach((id, index) => {
        if (!sources.has(id)) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Research item references an unknown source',
            path: [...path, index],
          })
        }
      })
    }

    research.companyInsights.forEach((insight, index) => {
      validateSourceIds(insight.sourceIds, [
        'companyInsights',
        index,
        'sourceIds',
      ])
      if (insight.evidenceType === 'official') {
        const hasOfficialSource = insight.sourceIds.some((sourceId) => {
          const source = sources.get(sourceId)
          return source && officialSourceTypes.has(source.sourceType)
        })
        if (!hasOfficialSource) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Official information requires an official source',
            path: ['companyInsights', index, 'sourceIds'],
          })
        }
      }
    })
    research.competencies.forEach((item, index) =>
      validateSourceIds(item.sourceIds, ['competencies', index, 'sourceIds']),
    )
    research.predictedQuestions.forEach((question, index) =>
      validateSourceIds(question.sourceIds, [
        'predictedQuestions',
        index,
        'sourceIds',
      ]),
    )
  })

export const interviewTurnSchema = z.object({
  id: idSchema,
  sequence: z.number().int().positive(),
  question: z.string().min(1),
  answer: z.string(),
  inputMode: z.enum(['text', 'voice']),
  questionType: z
    .enum([
      'motivation',
      'experience',
      'business',
      'competency',
      'scenario',
      'behavioral',
    ])
    .optional(),
  focusDimension: z.string().min(1).optional(),
  followUpReason: z.string().min(1).optional(),
  feedback: z.string().min(1).optional(),
  createdAt: timestampSchema,
})

export const mockInterviewSessionSchema = z.object({
  id: idSchema,
  analysisId: idSchema,
  mode: z.enum(['text', 'voice']),
  // Stored sessions from before the HR/business split have no type. Treat
  // those records as business interviews while accepting their old shape.
  interviewType: z.enum(['hr', 'business']).default('business'),
  status: z.enum([
    'created',
    'active',
    'paused',
    'completed',
    'abandoned',
  ]),
  turns: z.array(interviewTurnSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
})

export const questionPracticeSchema = z.object({
  id: idSchema,
  analysisId: idSchema,
  questionId: idSchema,
  question: z.string().min(1),
  originalAnswer: z.string().min(1),
  inputMode: z.enum(['text', 'voice']).default('text'),
  answerCoverage: z.string().min(1),
  evidenceAssessment: z.string().min(1),
  roleRelevance: z.string().min(1),
  risks: z.array(z.string().min(1)).default([]),
  improvements: z.array(z.string().min(1)).default([]),
  followUpQuestions: z.array(z.string().min(1)).default([]),
  evidenceClaimIds: z.array(idSchema).default([]),
  status: z.enum(['completed', 'failed']).default('completed'),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const answerOptimizationSchema = z.object({
  id: idSchema,
  analysisId: idSchema,
  question: z.string().min(1),
  originalAnswer: z.string().min(1),
  optimizedAnswerZh: z.string().min(1),
  optimizedAnswerEn: z.string().min(1),
  improvements: z.array(z.string().min(1)),
  evidenceClaimIds: z.array(idSchema),
  status: z.enum(['completed', 'failed']),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const interviewBackupV2Schema = z.object({
  version: z.literal(2),
  exportedAt: timestampSchema,
  experiences: z.array(experienceSchema),
  sourceArtifacts: z.array(sourceArtifactSchema),
  evidenceSpans: z.array(evidenceSpanSchema),
  claims: z.array(extractedClaimSchema),
  jdRecords: z.array(jdRecordSchema),
  interviewResearch: z.array(interviewResearchSchema),
  mockInterviewSessions: z.array(mockInterviewSessionSchema),
  answerOptimizations: z.array(answerOptimizationSchema),
  questionPractices: z.array(questionPracticeSchema).default([]),
  profileMaterials: z.array(profileMaterialSchema).default([]),
  resumeVersions: z.array(resumeVersionSchema).default([]),
  companyTargets: z.array(companyTargetSchema).default([]),
  careerDirections: z.array(careerDirectionSchema).default([]),
  careerDirectionFeedback: z
    .array(careerDirectionFeedbackSchema)
    .default([]),
  analysisJobs: z.array(analysisJobSchema).default([]),
})
