import type { Experience, ExtractedClaim } from '../src/domain/types'

export const validExperience: Experience = {
  id: 'experience-1',
  organization: 'Northstar Studio',
  role: 'Product Designer',
  project: 'Application redesign',
  startDate: '2025-01',
  endDate: '2026-06',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
}

export const validConfirmedClaim: ExtractedClaim = {
  id: 'claim-1',
  experienceId: validExperience.id,
  kind: 'result',
  label: 'Improved application completion',
  detail: 'Increased completed applications by simplifying the flow.',
  status: 'confirmed',
  evidenceSpanIds: ['evidence-span-1'],
}
