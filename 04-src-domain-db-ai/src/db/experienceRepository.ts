import type {
  EvidenceSpan,
  ExtractedClaim,
  SourceArtifact,
} from '../domain/types'
import { db } from './database'

export type ExtractionSet = {
  evidenceSpans: EvidenceSpan[]
  claims: ExtractedClaim[]
}

export type ExperienceWorkspace = ExtractionSet & {
  artifacts: SourceArtifact[]
}

export async function loadExperienceWorkspace(
  experienceId: string,
): Promise<ExperienceWorkspace> {
  const [artifacts, claims] = await Promise.all([
    db.sourceArtifacts.where('experienceId').equals(experienceId).toArray(),
    db.claims.where('experienceId').equals(experienceId).toArray(),
  ])
  const evidenceSpanIds = new Set(
    claims.flatMap(({ evidenceSpanIds }) => evidenceSpanIds),
  )
  const evidenceSpans = await db.evidenceSpans.bulkGet([...evidenceSpanIds])

  return {
    artifacts,
    claims,
    evidenceSpans: evidenceSpans.filter(
      (span): span is EvidenceSpan => span !== undefined,
    ),
  }
}

export function replaceArtifactPendingExtraction(
  sourceArtifactId: string,
  incoming: ExtractionSet,
): Promise<ExtractionSet> {
  return db.transaction(
    'rw',
    db.evidenceSpans,
    db.claims,
    async () => {
      const existingSpans = await db.evidenceSpans
        .where('sourceArtifactId')
        .equals(sourceArtifactId)
        .toArray()
      const existingSpanIds = new Set(existingSpans.map(({ id }) => id))
      const allClaims = await db.claims.toArray()
      const existingClaims = allClaims.filter(({ evidenceSpanIds }) =>
        evidenceSpanIds.some((id) => existingSpanIds.has(id)),
      )
      const finalizedClaims = existingClaims.filter(
        ({ status }) => status !== 'pending',
      )
      const finalizedClaimIds = new Set(finalizedClaims.map(({ id }) => id))
      const preservedSpanIds = new Set(
        finalizedClaims.flatMap(({ evidenceSpanIds }) => evidenceSpanIds),
      )
      const pendingClaimIds = existingClaims
        .filter(({ status }) => status === 'pending')
        .map(({ id }) => id)
      const obsoleteSpanIds = existingSpans
        .filter(({ id }) => !preservedSpanIds.has(id))
        .map(({ id }) => id)

      await db.claims.bulkDelete(pendingClaimIds)
      await db.evidenceSpans.bulkDelete(obsoleteSpanIds)
      await db.evidenceSpans.bulkPut(
        incoming.evidenceSpans.filter(({ id }) => !preservedSpanIds.has(id)),
      )
      await db.claims.bulkPut(
        incoming.claims.filter(({ id }) => !finalizedClaimIds.has(id)),
      )

      const evidenceSpans = await db.evidenceSpans
        .where('sourceArtifactId')
        .equals(sourceArtifactId)
        .toArray()
      const finalSpanIds = new Set(evidenceSpans.map(({ id }) => id))
      const claims = (await db.claims.toArray()).filter(({ evidenceSpanIds }) =>
        evidenceSpanIds.some((id) => finalSpanIds.has(id)),
      )
      return { claims, evidenceSpans }
    },
  )
}
