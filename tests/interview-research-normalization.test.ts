import { describe, expect, it } from 'vitest'

import { normalizeInterviewResearchGeneration } from '../src/domain/interviewResearchNormalization'

describe('normalizeInterviewResearchGeneration', () => {
  it('keeps valid research while downgrading unsupported labels and references', () => {
    const result = normalizeInterviewResearchGeneration(
      {
        companyInsights: [
          {
            topic: 'culture',
            content: '强调长期用户价值',
            evidenceType: 'official',
            sourceIds: ['media-1', 'missing-source'],
          },
        ],
        competencies: [
          {
            competency: '产品判断',
            requirement: '能够判断需求优先级',
            priority: 'high',
            assessment: 'match',
            evidenceClaimIds: ['missing-claim'],
            sourceIds: ['media-1'],
          },
        ],
        interviewPriorities: [
          {
            title: '需求判断',
            priority: 'high',
            rationale: '岗位会重点验证',
            evidenceClaimIds: ['claim-1', 'missing-claim'],
          },
        ],
        predictedQuestions: [],
        preparationChecklist: [],
      },
      [{ id: 'media-1', sourceType: 'industry_media' }],
      ['claim-1'],
    )

    expect(result.partial).toBe(true)
    expect(result.value.companyInsights[0]).toMatchObject({
      evidenceType: 'public',
      sourceIds: ['media-1'],
    })
    expect(result.value.competencies[0]).toMatchObject({
      assessment: 'unknown',
      evidenceClaimIds: [],
    })
    expect(result.value.interviewPriorities[0].evidenceClaimIds).toEqual([
      'claim-1',
    ])
  })

  it('retains official classification when an official source is present', () => {
    const result = normalizeInterviewResearchGeneration(
      {
        companyInsights: [
          {
            topic: 'company',
            content: '公司的公开使命',
            evidenceType: 'official',
            sourceIds: ['official-1'],
          },
        ],
        competencies: [],
        interviewPriorities: [],
        predictedQuestions: [],
        preparationChecklist: [],
      },
      [{ id: 'official-1', sourceType: 'official_website' }],
      [],
    )

    expect(result.partial).toBe(false)
    expect(result.value.companyInsights[0].evidenceType).toBe('official')
  })
})
