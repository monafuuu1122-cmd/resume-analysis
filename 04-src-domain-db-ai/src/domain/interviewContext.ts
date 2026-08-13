import type { ConfirmedEvidenceSnapshot } from '../db/evidenceRepository'
import {
  interviewProfileContextSchema,
} from './schemas'

export function buildInterviewProfileContext(
  snapshot: ConfirmedEvidenceSnapshot,
) {
  const evidenceById = new Map(
    snapshot.evidenceSpans.map((evidence) => [evidence.id, evidence]),
  )
  const experienceById = new Map(
    snapshot.experiences.map((experience) => [experience.id, experience]),
  )
  const claims = snapshot.claims.flatMap((claim) => {
    if (claim.status !== 'confirmed') return []
    const evidence = claim.evidenceSpanIds.flatMap((id) => {
      const match = evidenceById.get(id)
      return match ? [match] : []
    })
    if (evidence.length === 0) return []
    return [
      {
        ...claim,
        status: 'confirmed' as const,
        evidence,
        experience: experienceById.get(claim.experienceId),
      },
    ]
  })
  return interviewProfileContextSchema.parse({
    claims,
    // Keep every saved experience in the context. A legacy or newly-entered
    // experience may not have extracted claims yet, but it is still useful
    // for the model to identify a relevant background and suggest what to
    // verify next. Only confirmed claims with source evidence remain usable
    // as hard candidate facts.
    experiences: snapshot.experiences,
    profileMaterials: snapshot.profileMaterials ?? [],
  })
}
