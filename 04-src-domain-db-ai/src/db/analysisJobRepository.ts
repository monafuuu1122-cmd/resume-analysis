import { analysisJobSchema, type AnalysisJob } from '../domain/analysisJobs'
import { db } from './database'

function id() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

export async function createAnalysisJob(input: {
  analysisId: string
  inputHash: string
  currentStage?: AnalysisJob['currentStage']
}) {
  const updatedAt = new Date().toISOString()
  const job = analysisJobSchema.parse({
    id: id(),
    analysisId: input.analysisId,
    inputHash: input.inputHash,
    status: 'queued',
    currentStage: input.currentStage ?? 'jd-analysis',
    attempt: 1,
    updatedAt,
  })
  await db.analysisJobs.add(job)
  return job
}

export const getAnalysisJob = (id: string) => db.analysisJobs.get(id)

export const listAnalysisJobs = (analysisId: string) =>
  db.analysisJobs
    .where('analysisId')
    .equals(analysisId)
    .reverse()
    .sortBy('updatedAt')

export async function updateAnalysisJob(
  id: string,
  analysisId: string,
  change: Partial<Omit<AnalysisJob, 'id' | 'analysisId' | 'inputHash'>>,
) {
  const current = await db.analysisJobs.get(id)
  if (!current) throw new Error('未找到分析任务')
  if (current.analysisId !== analysisId) {
    throw new Error('分析任务与记录不匹配')
  }
  const completedAt =
    change.completedAt ??
    (change.status &&
    ['completed', 'failed', 'timeout', 'cancelled'].includes(change.status)
      ? new Date().toISOString()
      : current.completedAt)
  const updated = analysisJobSchema.parse({
    ...current,
    ...change,
    completedAt,
    updatedAt: new Date().toISOString(),
  })
  await db.analysisJobs.put(updated)
  return updated
}
