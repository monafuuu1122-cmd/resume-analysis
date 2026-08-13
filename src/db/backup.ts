import { interviewBackupV2Schema } from '../domain/interviewSchemas'
import { backupSchema } from '../domain/schemas'
import { db } from './database'

export function parseBackup(text: string) {
  try {
    const value: unknown = JSON.parse(text)
    const v2 = interviewBackupV2Schema.safeParse(value)
    if (v2.success) {
      return v2.data
    }

    return backupSchema.parse(value)
  } catch {
    throw new Error('备份文件格式不受支持')
  }
}

export function parseBackupV2(text: string) {
  const backup = parseBackup(text)
  if (backup.version === 2) {
    return backup
  }

  return interviewBackupV2Schema.parse({
    ...backup,
    version: 2,
    interviewResearch: [],
    mockInterviewSessions: [],
    answerOptimizations: [],
  })
}

export async function createBackup(
  exportedAt = new Date().toISOString(),
) {
  const [
    experiences,
    sourceArtifacts,
    evidenceSpans,
    claims,
    jdRecords,
    interviewResearch,
    mockInterviewSessions,
    answerOptimizations,
    questionPractices,
    profileMaterials,
    companyTargets,
    careerDirections,
    careerDirectionFeedback,
    analysisJobs,
  ] = await Promise.all([
    db.experiences.toArray(),
    db.sourceArtifacts.toArray(),
    db.evidenceSpans.toArray(),
    db.claims.toArray(),
    db.jdRecords.toArray(),
    db.interviewResearch.toArray(),
    db.mockInterviewSessions.toArray(),
    db.answerOptimizations.toArray(),
    db.questionPractices.toArray(),
    db.profileMaterials.toArray(),
    db.companyTargets.toArray(),
    db.careerDirections.toArray(),
    db.careerDirectionFeedback.toArray(),
    db.analysisJobs.toArray(),
  ])

  return interviewBackupV2Schema.parse({
    version: 2,
    exportedAt,
    experiences,
    sourceArtifacts,
    evidenceSpans,
    claims,
    jdRecords,
    interviewResearch,
    mockInterviewSessions,
    answerOptimizations,
    questionPractices,
    profileMaterials,
    companyTargets,
    careerDirections,
    careerDirectionFeedback,
    analysisJobs,
  })
}
