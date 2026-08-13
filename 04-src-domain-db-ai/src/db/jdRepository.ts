import type { JdRecord } from '../domain/types'
import { db } from './database'
import { deleteInterviewContextByAnalysisId } from './interviewRepository'

export const saveJdRecord = (record: JdRecord) =>
  db.jdRecords.put(record)

export const getJdRecord = (id: string) =>
  db.jdRecords.get(id)

export const listJdRecords = () =>
  db.jdRecords.orderBy('updatedAt').reverse().toArray()

export async function deleteJdRecordCascade(id: string) {
  await deleteInterviewContextByAnalysisId(id)
  await db.transaction('rw', [db.jdRecords, db.analysisJobs], async () => {
    await Promise.all([
      db.jdRecords.delete(id),
      db.analysisJobs.where('analysisId').equals(id).delete(),
    ])
  })
}
