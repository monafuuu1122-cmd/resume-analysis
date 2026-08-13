import { describe, expect, it } from 'vitest'

import { calibrateJdMatchScore } from '../src/domain/jdCalibration'
import type { InterviewProfileContext, JdAnalysis } from '../src/domain/types'

const analysis = (overrides: Partial<JdAnalysis>): JdAnalysis => ({
  company: '示例公司',
  role: '产品运营',
  department: '产品部',
  location: '上海',
  level: '校招',
  businessKeywords: [],
  matchScore: 90,
  evidenceCoverage: '待校准',
  strengths: [],
  gaps: [],
  resumeRewrites: [],
  interviewDimensions: [],
  ...overrides,
})

const context: InterviewProfileContext = {
  experiences: [
    {
      id: 'experience-1',
      organization: '甲公司',
      role: '运营实习生',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-28T10:00:00.000Z',
      updatedAt: '2026-07-28T10:00:00.000Z',
    },
    {
      id: 'experience-2',
      organization: '乙公司',
      role: '产品实习生',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-28T10:00:00.000Z',
      updatedAt: '2026-07-28T10:00:00.000Z',
    },
  ],
  claims: [
    {
      id: 'claim-capability',
      experienceId: 'experience-1',
      kind: 'capability',
      label: '项目推进',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['span-1'],
      evidence: [
        {
          id: 'span-1',
          sourceArtifactId: 'artifact-1',
          quote: '推动项目按期上线',
          start: 0,
          end: 8,
        },
      ],
    },
    {
      id: 'claim-result-1',
      experienceId: 'experience-1',
      kind: 'result',
      label: '转化提升',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['span-2'],
      evidence: [
        {
          id: 'span-2',
          sourceArtifactId: 'artifact-1',
          quote: '转化率提升',
          start: 0,
          end: 5,
        },
      ],
    },
    {
      id: 'claim-action-2',
      experienceId: 'experience-2',
      kind: 'action',
      label: '用户访谈',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['span-3'],
      evidence: [
        {
          id: 'span-3',
          sourceArtifactId: 'artifact-2',
          quote: '完成用户访谈',
          start: 0,
          end: 6,
        },
      ],
    },
    {
      id: 'claim-result-2',
      experienceId: 'experience-2',
      kind: 'result',
      label: '效率提升',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['span-4'],
      evidence: [
        {
          id: 'span-4',
          sourceArtifactId: 'artifact-2',
          quote: '流程效率提升',
          start: 0,
          end: 6,
        },
      ],
    },
  ],
}

describe('calibrateJdMatchScore', () => {
  it('caps a high model score when evidence covers few requirements', () => {
    const result = calibrateJdMatchScore(
      analysis({
        strengths: [
          {
            title: '项目推进',
            explanation: '有一条证据',
            evidenceClaimIds: ['claim-capability'],
          },
        ],
        gaps: [
          { title: '数据分析', explanation: '无证据' },
          { title: '用户增长', explanation: '无证据' },
        ],
      }),
      context,
    )

    expect(result.matchScore).toBe(28)
  })

  it('allows a strong score only with broad, result-backed evidence', () => {
    const result = calibrateJdMatchScore(
      analysis({
        matchScore: 92,
        strengths: context.claims.map((claim) => ({
          title: claim.label,
          explanation: '匹配核心要求',
          evidenceClaimIds: [claim.id],
        })),
        gaps: [{ title: '行业深度', explanation: '仍需补充' }],
      }),
      context,
    )

    expect(result.matchScore).toBe(82)
  })
})
