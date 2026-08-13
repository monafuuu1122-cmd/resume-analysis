import type {
  EvidenceSpan,
  Experience,
  ExtractedClaim,
  ProfileMaterial,
} from '../domain/types'
import { db } from './database'

export interface ConfirmedEvidenceSnapshot {
  claims: ExtractedClaim[]
  evidenceSpans: EvidenceSpan[]
  experiences: Experience[]
  profileMaterials?: ProfileMaterial[]
}

export async function loadConfirmedEvidenceSnapshot(): Promise<ConfirmedEvidenceSnapshot> {
  const [claims, evidenceSpans, experiences, profileMaterials] = await Promise.all([
    db.claims.toArray(),
    db.evidenceSpans.toArray(),
    db.experiences.toArray(),
    db.profileMaterials.toArray(),
  ])

  return {
    claims: claims.filter(({ status }) => status === 'confirmed'),
    evidenceSpans,
    experiences,
    profileMaterials,
  }
}
