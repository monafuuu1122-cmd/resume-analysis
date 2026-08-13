import type {
  AnswerOptimization,
  InterviewResearch,
  JdRecord,
  MockInterviewSession,
  QuestionPractice,
} from '../domain/types'
import { db } from './database'

const newestFirst = <T extends { updatedAt: string }>(records: T[]) =>
  records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

export const saveInterviewResearch = (research: InterviewResearch) =>
  db.interviewResearch.put(research)

export async function getInterviewResearchByAnalysisId(analysisId: string) {
  const records = await db.interviewResearch
    .where('analysisId')
    .equals(analysisId)
    .toArray()
  return newestFirst(records)[0]
}

export async function getInterviewResearchForRecord(record: JdRecord) {
  if (record.companyResearchId) {
    const pointed = await db.interviewResearch.get(record.companyResearchId)
    if (pointed?.analysisId === record.id) return pointed
  }
  const records = await db.interviewResearch
    .where('analysisId')
    .equals(record.id)
    .toArray()
  const compatible = records.filter(
    (item) =>
      (!item.jobId || !record.activeJobId || item.jobId === record.activeJobId) &&
      (!item.companyName || item.companyName === record.company),
  )
  return newestFirst(compatible)[0]
}

export async function activateInterviewResearchVersion(
  research: InterviewResearch,
  expected: {
    expectedCurrentResearchId?: string
    jobId?: string
    inputHash?: string
  },
) {
  return db.transaction(
    'rw',
    [db.interviewResearch, db.jdRecords],
    async () => {
      await db.interviewResearch.put(research)
      const record = await db.jdRecords.get(research.analysisId)
      if (!record) return false
      if (
        record.companyResearchId !== expected.expectedCurrentResearchId ||
        (expected.jobId &&
          record.activeJobId &&
          record.activeJobId !== expected.jobId) ||
        (expected.inputHash &&
          record.inputHash &&
          record.inputHash !== expected.inputHash)
      ) {
        return false
      }
      await db.jdRecords.update(record.id, {
        companyResearchId: research.id,
        updatedAt: new Date().toISOString(),
      })
      return true
    },
  )
}

export const saveMockInterviewSession = (
  session: MockInterviewSession,
) => db.mockInterviewSessions.put(session)

export const getMockInterviewSession = (id: string) =>
  db.mockInterviewSessions.get(id)

export async function listMockInterviewSessionsByAnalysisId(
  analysisId: string,
) {
  const records = await db.mockInterviewSessions
    .where('analysisId')
    .equals(analysisId)
    .toArray()
  return newestFirst(records)
}

export const saveAnswerOptimization = (
  optimization: AnswerOptimization,
) => db.answerOptimizations.put(optimization)

export const getAnswerOptimization = (id: string) =>
  db.answerOptimizations.get(id)

export const saveQuestionPractice = (practice: QuestionPractice) =>
  db.questionPractices.put(practice)

export const getQuestionPractice = (id: string) =>
  db.questionPractices.get(id)

export async function listQuestionPracticesByAnalysisId(analysisId: string) {
  const records = await db.questionPractices
    .where('analysisId')
    .equals(analysisId)
    .toArray()
  return newestFirst(records)
}

export async function deleteInterviewContextByAnalysisId(analysisId: string) {
  await db.transaction(
    'rw',
    [
      db.interviewResearch,
      db.mockInterviewSessions,
      db.answerOptimizations,
      db.questionPractices,
    ],
    async () => {
      await Promise.all([
        db.interviewResearch.where('analysisId').equals(analysisId).delete(),
        db.mockInterviewSessions.where('analysisId').equals(analysisId).delete(),
        db.answerOptimizations.where('analysisId').equals(analysisId).delete(),
        db.questionPractices.where('analysisId').equals(analysisId).delete(),
      ])
    },
  )
}

export async function listAnswerOptimizationsByAnalysisId(
  analysisId: string,
) {
  const records = await db.answerOptimizations
    .where('analysisId')
    .equals(analysisId)
    .toArray()
  return newestFirst(records)
}
