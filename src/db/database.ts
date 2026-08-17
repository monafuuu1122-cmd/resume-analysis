import Dexie, { type EntityTable } from 'dexie'

import type {
  AnswerOptimization,
  AnalysisJob,
  CompanyTarget,
  CareerDirection,
  CareerDirectionFeedback,
  EvidenceSpan,
  Experience,
  ExtractedClaim,
  InterviewResearch,
  JdRecord,
  MockInterviewSession,
  QuestionPractice,
  ProfileMaterial,
  ResumeVersion,
  SourceArtifact,
} from '../domain/types'
import type {
  LocalDataMeta,
  MigrationRecoveryItem,
  MigrationSnapshot,
} from '../domain/localDataSchemas'

export const db = new Dexie('offer-adventure') as Dexie & {
  experiences: EntityTable<Experience, 'id'>
  sourceArtifacts: EntityTable<SourceArtifact, 'id'>
  evidenceSpans: EntityTable<EvidenceSpan, 'id'>
  claims: EntityTable<ExtractedClaim, 'id'>
  jdRecords: EntityTable<JdRecord, 'id'>
  interviewResearch: EntityTable<InterviewResearch, 'id'>
  mockInterviewSessions: EntityTable<MockInterviewSession, 'id'>
  answerOptimizations: EntityTable<AnswerOptimization, 'id'>
  questionPractices: EntityTable<QuestionPractice, 'id'>
  profileMaterials: EntityTable<ProfileMaterial, 'id'>
  resumeVersions: EntityTable<ResumeVersion, 'id'>
  companyTargets: EntityTable<CompanyTarget, 'id'>
  careerDirections: EntityTable<CareerDirection, 'id'>
  careerDirectionFeedback: EntityTable<CareerDirectionFeedback, 'id'>
  localDataMeta: EntityTable<LocalDataMeta, 'id'>
  migrationSnapshots: EntityTable<MigrationSnapshot, 'id'>
  migrationRecoveryItems: EntityTable<MigrationRecoveryItem, 'id'>
  analysisJobs: EntityTable<AnalysisJob, 'id'>
}

db.version(1).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
})

db.version(2).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
})

db.version(3).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
})

db.version(4).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  companyTargets: 'id, name, updatedAt',
})

db.version(5).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  companyTargets: 'id, name, updatedAt',
  careerDirections: 'id, name, source, status, updatedAt',
  careerDirectionFeedback: 'id, directionId, feedback, createdAt',
})

db.version(6).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  companyTargets: 'id, name, updatedAt',
  careerDirections: 'id, name, source, status, updatedAt',
  careerDirectionFeedback: 'id, directionId, feedback, createdAt',
  localDataMeta: 'id, schemaVersion, lastMigratedAt',
  migrationSnapshots: 'id, source, createdAt',
  migrationRecoveryItems: 'id, source, createdAt',
})

db.version(7).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  companyTargets: 'id, name, updatedAt',
  careerDirections: 'id, name, source, status, updatedAt',
  careerDirectionFeedback: 'id, directionId, feedback, createdAt',
  localDataMeta: 'id, schemaVersion, lastMigratedAt',
  migrationSnapshots: 'id, source, createdAt',
  migrationRecoveryItems: 'id, source, createdAt',
  analysisJobs: 'id, analysisId, status, currentStage, updatedAt',
})

db.version(8).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  questionPractices: 'id, analysisId, questionId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  companyTargets: 'id, name, updatedAt',
  careerDirections: 'id, name, source, status, updatedAt',
  careerDirectionFeedback: 'id, directionId, feedback, createdAt',
  localDataMeta: 'id, schemaVersion, lastMigratedAt',
  migrationSnapshots: 'id, source, createdAt',
  migrationRecoveryItems: 'id, source, createdAt',
  analysisJobs: 'id, analysisId, status, currentStage, updatedAt',
})

db.version(9).stores({
  experiences: 'id, organization, role, updatedAt',
  sourceArtifacts: 'id, experienceId, createdAt',
  evidenceSpans: 'id, sourceArtifactId',
  claims: 'id, experienceId, kind, status',
  jdRecords: 'id, company, role, updatedAt',
  interviewResearch: 'id, analysisId, researchStatus, updatedAt',
  mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
  answerOptimizations: 'id, analysisId, updatedAt',
  questionPractices: 'id, analysisId, questionId, updatedAt',
  profileMaterials: 'id, type, title, updatedAt',
  resumeVersions: 'id, source, updatedAt',
  companyTargets: 'id, name, updatedAt',
  careerDirections: 'id, name, source, status, updatedAt',
  careerDirectionFeedback: 'id, directionId, feedback, createdAt',
  localDataMeta: 'id, schemaVersion, lastMigratedAt',
  migrationSnapshots: 'id, source, createdAt',
  migrationRecoveryItems: 'id, source, createdAt',
  analysisJobs: 'id, analysisId, status, currentStage, updatedAt',
})
