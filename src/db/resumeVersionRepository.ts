import { resumeVersionSchema } from '../domain/schemas'
import type { ResumeVersion } from '../domain/types'
import { db } from './database'

export async function saveResumeVersion(value: ResumeVersion) {
  const parsed = resumeVersionSchema.parse(value)
  await db.resumeVersions.put(parsed)
  return parsed
}

export function getResumeVersion(id: string) {
  return db.resumeVersions.get(id)
}

export async function listResumeVersions() {
  const values = await db.resumeVersions.orderBy('updatedAt').reverse().toArray()
  return values
}

export function deleteResumeVersion(id: string) {
  return db.resumeVersions.delete(id)
}
