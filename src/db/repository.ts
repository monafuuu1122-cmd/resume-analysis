import type { Experience } from '../domain/types'
import { db } from './database'

export const saveExperience = (value: Experience) =>
  db.experiences.put(value)

export const listExperiences = () =>
  db.experiences.orderBy('updatedAt').reverse().toArray()

export async function deleteExperienceCascade(experienceId: string) {
  await db.transaction(
    'rw',
    db.experiences,
    db.sourceArtifacts,
    db.evidenceSpans,
    db.claims,
    async () => {
      const artifacts = await db.sourceArtifacts
        .where('experienceId')
        .equals(experienceId)
        .toArray()
      const artifactIds = artifacts.map(({ id }) => id)
      const spans = artifactIds.length
        ? await db.evidenceSpans
            .where('sourceArtifactId')
            .anyOf(artifactIds)
            .toArray()
        : []

      await db.claims.where('experienceId').equals(experienceId).delete()
      if (spans.length) {
        await db.evidenceSpans.bulkDelete(spans.map(({ id }) => id))
      }
      if (artifactIds.length) {
        await db.sourceArtifacts.bulkDelete(artifactIds)
      }
      await db.experiences.delete(experienceId)
    },
  )
}
