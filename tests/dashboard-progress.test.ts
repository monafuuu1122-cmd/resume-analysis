import { describe, expect, it } from 'vitest'

import { deriveDashboardProgress } from '../src/domain/dashboardProgress'

describe('deriveDashboardProgress', () => {
  it('starts with four meaningful setup tasks', () => {
    expect(
      deriveDashboardProgress({
        experienceCount: 0,
        confirmedClaimCount: 0,
        hasQwenConfig: false,
        analyzedJdCount: 0,
      }),
    ).toEqual({
      profileCompleteness: 0,
      preparation: 0,
      tasks: [
        { label: '添加一段真实经历', to: '/experiences' },
        { label: '确认一条能力证据', to: '/experiences' },
        { label: '配置DeepSeek助手', to: '/settings' },
        { label: '分析一份意向 JD', to: '/jd-lab' },
      ],
    })
  })

  it('scores only boolean milestones and removes completed tasks', () => {
    expect(
      deriveDashboardProgress({
        experienceCount: 2,
        confirmedClaimCount: 4,
        hasQwenConfig: true,
        analyzedJdCount: 1,
      }),
    ).toEqual({
      profileCompleteness: 100,
      preparation: 100,
      tasks: [],
    })
  })

  it('offers capability confirmation after an experience exists', () => {
    expect(
      deriveDashboardProgress({
        experienceCount: 1,
        confirmedClaimCount: 0,
        hasQwenConfig: false,
        analyzedJdCount: 0,
      }),
    ).toMatchObject({
      profileCompleteness: 30,
      preparation: 15,
      tasks: [
        { label: '确认一条能力证据', to: '/experiences' },
        { label: '配置DeepSeek助手', to: '/settings' },
        { label: '分析一份意向 JD', to: '/jd-lab' },
      ],
    })
  })
})
