import { describe, expect, it } from 'vitest'

import { buildCareerEvidenceUnits } from '../src/domain/careerEvidence'

describe('buildCareerEvidenceUnits', () => {
  it('joins claims, original quotes, experience context and profile materials', () => {
    const units = buildCareerEvidenceUnits({
      experiences: [
        {
          id: 'world-cup',
          organization: '赛事项目',
          role: '传播实习生',
          project: '世界杯整合营销',
          startDate: '',
          endDate: '',
          createdAt: '2026-07-29T10:00:00.000Z',
          updatedAt: '2026-07-29T10:00:00.000Z',
        },
      ],
      evidenceSpans: [
        {
          id: 'span-1',
          sourceArtifactId: 'artifact-1',
          quote: '参与直播脚本修改和现场流程测试',
          start: 0,
          end: 16,
        },
      ],
      claims: [
        {
          id: 'claim-1',
          experienceId: 'world-cup',
          kind: 'action',
          label: '直播执行',
          detail: '协调脚本和现场测试',
          status: 'confirmed',
          evidenceSpanIds: ['span-1'],
        },
      ],
      profileMaterials: [
        {
          id: 'language-1',
          type: 'language',
          title: '英语',
          detail: '可进行工作沟通',
          proficiency: 'CET-6',
          createdAt: '2026-07-29T10:00:00.000Z',
          updatedAt: '2026-07-29T10:00:00.000Z',
        },
      ],
    })

    expect(units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'claim-1:span-1',
          experienceId: 'world-cup',
          organization: '赛事项目',
          project: '世界杯整合营销',
          originalText: '参与直播脚本修改和现场流程测试',
          evidenceType: 'action',
        }),
        expect.objectContaining({
          id: 'profile-material:language-1',
          originalText: '英语：可进行工作沟通（CET-6）',
          evidenceType: 'skill',
        }),
      ]),
    )
  })
})
