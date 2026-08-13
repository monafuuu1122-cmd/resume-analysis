import { userCareerRepository } from './userCareerRepository'

export interface DashboardCounts {
  experienceCount: number
  confirmedClaimCount: number
  analyzedJdCount: number
}

export async function loadDashboardCounts(): Promise<DashboardCounts> {
  const { counts } = await userCareerRepository.getSnapshot()
  return {
    experienceCount: counts.experienceCount,
    confirmedClaimCount: counts.confirmedClaimCount,
    analyzedJdCount: counts.analyzedJdCount,
  }
}
