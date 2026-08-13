import { describe, expect, it } from 'vitest'

import { derivePreparationProgress } from '../src/domain/dashboardProgress'

describe('derivePreparationProgress', () => {
  it('explains every missing milestone with a destination', () => {
    const result = derivePreparationProgress({
      experienceCount: 0,
      confirmedClaimCount: 0,
      profileMaterialCount: 0,
      careerDirectionCount: 0,
      analyzedJdCount: 0,
      interviewResearchCount: 0,
      completedInterviewCount: 0,
      hasQwenConfig: false,
    })

    expect(result.overallPercent).toBe(0)
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'experience',
          completed: false,
          targetRoute: '/experiences',
          missingReason: '还没有保存经历',
        }),
        expect.objectContaining({
          id: 'direction',
          targetRoute: '/role-directions',
        }),
      ]),
    )
  })

  it('uses actual interview and JD records for completion', () => {
    const result = derivePreparationProgress({
      experienceCount: 2,
      confirmedClaimCount: 5,
      profileMaterialCount: 1,
      careerDirectionCount: 1,
      analyzedJdCount: 1,
      interviewResearchCount: 1,
      completedInterviewCount: 1,
      hasQwenConfig: true,
    })

    expect(result.overallPercent).toBe(100)
    expect(result.items.every((item) => item.completed)).toBe(true)
  })
})
