import { db } from './database'
import { migrateIfNeeded } from './localDataMigration'

export type CareerModuleStatus = 'ready' | 'failed'
export type CareerSourceStatus = 'ready' | 'empty' | 'partial' | 'failed'

export interface CareerSnapshotCounts {
  experienceCount: number
  confirmedClaimCount: number
  profileMaterialCount: number
  careerDirectionCount: number
  analyzedJdCount: number
  interviewResearchCount: number
  completedInterviewCount: number
}

export interface UserCareerSnapshot {
  counts: CareerSnapshotCounts
  moduleStatus: {
    profile: CareerModuleStatus
    targeting: CareerModuleStatus
    interviews: CareerModuleStatus
  }
  sourceStatus: CareerSourceStatus
  recoveryCount: number
  updatedAt: string
}

const emptyCounts = (): CareerSnapshotCounts => ({
  experienceCount: 0,
  confirmedClaimCount: 0,
  profileMaterialCount: 0,
  careerDirectionCount: 0,
  analyzedJdCount: 0,
  interviewResearchCount: 0,
  completedInterviewCount: 0,
})

async function profileCounts() {
  const [experienceCount, confirmedClaimCount, profileMaterialCount] =
    await Promise.all([
      db.experiences.count(),
      db.claims.where('status').equals('confirmed').count(),
      db.profileMaterials.count(),
    ])
  return { experienceCount, confirmedClaimCount, profileMaterialCount }
}

async function targetingCounts() {
  const [careerDirectionCount, jdRecords] = await Promise.all([
    db.careerDirections.count(),
    db.jdRecords.toArray(),
  ])
  return {
    careerDirectionCount,
    analyzedJdCount: jdRecords.filter((record) => Boolean(record.analysis))
      .length,
  }
}

async function interviewCounts() {
  const [interviewResearchCount, completedInterviewCount] = await Promise.all([
    db.interviewResearch.count(),
    db.mockInterviewSessions.where('status').equals('completed').count(),
  ])
  return { interviewResearchCount, completedInterviewCount }
}

export const userCareerRepository = {
  async getSnapshot(): Promise<UserCareerSnapshot> {
    await migrateIfNeeded()
    const [profile, targeting, interviews] = await Promise.allSettled([
      profileCounts(),
      targetingCounts(),
      interviewCounts(),
    ])
    const counts = emptyCounts()
    const moduleStatus: UserCareerSnapshot['moduleStatus'] = {
      profile: profile.status === 'fulfilled' ? 'ready' : 'failed',
      targeting: targeting.status === 'fulfilled' ? 'ready' : 'failed',
      interviews: interviews.status === 'fulfilled' ? 'ready' : 'failed',
    }
    if (profile.status === 'fulfilled') Object.assign(counts, profile.value)
    if (targeting.status === 'fulfilled') Object.assign(counts, targeting.value)
    if (interviews.status === 'fulfilled') Object.assign(counts, interviews.value)

    const readyCount = Object.values(moduleStatus).filter(
      (status) => status === 'ready',
    ).length
    const totalRecords = Object.values(counts).reduce(
      (total, count) => total + count,
      0,
    )
    const sourceStatus: CareerSourceStatus =
      readyCount === 0
        ? 'failed'
        : readyCount < 3
          ? 'partial'
          : totalRecords === 0
            ? 'empty'
            : 'ready'

    return {
      counts,
      moduleStatus,
      sourceStatus,
      recoveryCount: await db.migrationRecoveryItems.count().catch(() => 0),
      updatedAt: new Date().toISOString(),
    }
  },
}
