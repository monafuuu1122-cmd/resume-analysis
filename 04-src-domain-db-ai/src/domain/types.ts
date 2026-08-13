import { z } from 'zod'
import type { AnalysisJob } from './analysisJobs'

import {
  backupSchema,
  companyTargetSchema,
  careerDirectionFeedbackSchema,
  careerDirectionSchema,
  careerEvidenceGapSchema,
  careerEvidenceSchema,
  evidenceSpanSchema,
  experienceSchema,
  extractedClaimSchema,
  interviewProfileContextSchema,
  jdAnalysisSchema,
  jdRecordSchema,
  profileMaterialSchema,
  sourceArtifactSchema,
} from './schemas'
import {
  answerOptimizationSchema,
  companyInsightSchema,
  competencyItemSchema,
  interviewPrioritySchema,
  interviewBackupV2Schema,
  interviewResearchSchema,
  interviewTurnSchema,
  mockInterviewSessionSchema,
  questionPracticeSchema,
  predictedQuestionSchema,
  preparationChecklistItemSchema,
  researchSourceSchema,
} from './interviewSchemas'

export type Backup = z.infer<typeof backupSchema>
export type { AnalysisJob }
export type CompanyTarget = z.infer<typeof companyTargetSchema>
export type CareerDirection = z.infer<typeof careerDirectionSchema>
export type CareerDirectionFeedback = z.infer<
  typeof careerDirectionFeedbackSchema
>
export type CareerEvidence = z.infer<typeof careerEvidenceSchema>
export type CareerEvidenceGap = z.infer<typeof careerEvidenceGapSchema>
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>
export type Experience = z.infer<typeof experienceSchema>
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>
export type InterviewProfileContext = z.infer<
  typeof interviewProfileContextSchema
>
export type JdAnalysis = z.infer<typeof jdAnalysisSchema>
export type JdRecord = z.infer<typeof jdRecordSchema>
export type ProfileMaterial = z.infer<typeof profileMaterialSchema>
export type SourceArtifact = z.infer<typeof sourceArtifactSchema>
export type AnswerOptimization = z.infer<typeof answerOptimizationSchema>
export type CompanyInsight = z.infer<typeof companyInsightSchema>
export type CompetencyItem = z.infer<typeof competencyItemSchema>
export type InterviewPriority = z.infer<typeof interviewPrioritySchema>
export type InterviewBackupV2 = z.infer<typeof interviewBackupV2Schema>
export type InterviewResearch = z.infer<typeof interviewResearchSchema>
export type InterviewTurn = z.infer<typeof interviewTurnSchema>
type ParsedMockInterviewSession = z.infer<typeof mockInterviewSessionSchema>
// Keep the public stored-record type input-compatible with pre-split sessions
// while schema parsing supplies the business default at read boundaries.
export type MockInterviewSession = Omit<
  ParsedMockInterviewSession,
  'interviewType'
> & {
  interviewType?: ParsedMockInterviewSession['interviewType']
}
export type QuestionPractice = z.infer<typeof questionPracticeSchema>
export type PredictedQuestion = z.infer<typeof predictedQuestionSchema>
export type PreparationChecklistItem = z.infer<
  typeof preparationChecklistItemSchema
>
export type ResearchSource = z.infer<typeof researchSourceSchema>
