import { z } from 'zod'

import {
  careerDirectionFeedbackSchema,
  careerDirectionSchema,
  companyTargetSchema,
  evidenceSpanSchema,
  experienceSchema,
  extractedClaimSchema,
  jdRecordSchema,
  profileMaterialSchema,
  sourceArtifactSchema,
} from './schemas'
import {
  answerOptimizationSchema,
  interviewResearchSchema,
  mockInterviewSessionSchema,
  questionPracticeSchema,
} from './interviewSchemas'

const timestampSchema = z.string().datetime()

export const localDataMetaSchema = z.object({
  id: z.literal('singleton'),
  schemaVersion: z.number().int().nonnegative(),
  lastMigratedAt: timestampSchema.optional(),
  migrationHistory: z.array(z.string()).default([]),
})

export const migrationSnapshotSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  payload: z.unknown(),
  createdAt: timestampSchema,
})

export const migrationRecoveryItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  payload: z.unknown(),
  reason: z.string().min(1),
  createdAt: timestampSchema,
})

export const migrationPackageSchema = z.object({
  version: z.literal(3),
  exportedAt: timestampSchema,
  experiences: z.array(experienceSchema).default([]),
  sourceArtifacts: z.array(sourceArtifactSchema).default([]),
  evidenceSpans: z.array(evidenceSpanSchema).default([]),
  claims: z.array(extractedClaimSchema).default([]),
  jdRecords: z.array(jdRecordSchema).default([]),
  profileMaterials: z.array(profileMaterialSchema).default([]),
  companyTargets: z.array(companyTargetSchema).default([]),
  careerDirections: z.array(careerDirectionSchema).default([]),
  careerDirectionFeedback: z.array(careerDirectionFeedbackSchema).default([]),
  interviewResearch: z.array(interviewResearchSchema).default([]),
  mockInterviewSessions: z.array(mockInterviewSessionSchema).default([]),
  answerOptimizations: z.array(answerOptimizationSchema).default([]),
  questionPractices: z.array(questionPracticeSchema).default([]),
})

export type LocalDataMeta = z.infer<typeof localDataMetaSchema>
export type MigrationSnapshot = z.infer<typeof migrationSnapshotSchema>
export type MigrationRecoveryItem = z.infer<
  typeof migrationRecoveryItemSchema
>
export type MigrationPackage = z.infer<typeof migrationPackageSchema>
