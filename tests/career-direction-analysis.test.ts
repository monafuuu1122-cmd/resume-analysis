import { describe, expect, it } from 'vitest'

import { normalizeCareerDirectionMarketAnalysis } from '../src/ai/careerDirectionParsers'

describe('normalizeCareerDirectionMarketAnalysis', () => {
  it('maps market requirements only to known sources and profile evidence', () => {
    const result = normalizeCareerDirectionMarketAnalysis(
      {
        requirements: [
          {
            requirement: '能够把用户需求转化为产品方案（内部分析过程）',
            category: 'responsibility',
            importance: 'high',
            sourceIds: ['source-1', 'invented-source'],
            evidenceIds: ['claim-1', 'invented-claim'],
            evidenceExcerpts: ['独立梳理用户反馈（claim-1）'],
            matchReason: '已有需求梳理经验（claim-1）',
            matchStatus: 'advantage',
            preparationAdvice: '补充需求取舍案例',
          },
        ],
        capabilityGaps: [
          { title: '商业指标', reason: '证据不足', action: '准备指标拆解案例', priority: 'high' },
        ],
        mindsetGaps: [
          { title: '产品取舍', reason: '尚未体现', action: '练习优先级判断', priority: 'medium' },
        ],
      },
      [{ id: 'source-1', title: '产品运营招聘页', url: 'https://jobs.example.com/1' }],
      [{ id: 'claim-1', originalText: '独立梳理用户反馈并形成方案建议' }],
    )

    expect(result.partial).toBe(true)
    expect(result.requirements[0]).toMatchObject({
      sourceIds: ['source-1'],
      evidenceIds: ['claim-1'],
      evidenceExcerpts: ['独立梳理用户反馈'],
      matchReason: '已有需求梳理经验',
    })
    expect(result.requirements[0].matchStatus).toBe('advantage')
    expect(result.fitScore).toBeGreaterThan(0)
  })

  it('downgrades a claimed match when no profile evidence supports it', () => {
    const result = normalizeCareerDirectionMarketAnalysis(
      {
        requirements: [{
          requirement: '能独立完成经营分析',
          category: 'capability',
          importance: 'high',
          sourceIds: ['source-1'],
          evidenceIds: [],
          evidenceExcerpts: [],
          matchReason: '当前档案没有直接证据',
          matchStatus: 'basic-match',
          preparationAdvice: '补充经营分析案例',
        }],
        capabilityGaps: [],
        mindsetGaps: [],
      },
      [{ id: 'source-1', title: '招聘页', url: 'https://jobs.example.com/1' }],
      [],
    )

    expect(result.requirements[0].matchStatus).toBe('evidence-gap')
    expect(result.partial).toBe(true)
  })
})
