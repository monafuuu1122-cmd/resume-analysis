// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { Request, Response as ExpressResponse } from 'express'

import { createCareerDirectionAnalysisHandler } from '../server/careerDirectionAnalysis'
import type { FetchImplementation } from '../server/qwen'

const timestamp = '2026-08-02T10:00:00.000Z'

describe('POST /api/career-direction-analysis', () => {
  it('uses model knowledge without search and returns evidence-bound mappings', async () => {
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          requirements: [{
            requirement: '能够完成需求分析和产品复盘',
            category: 'responsibility',
            importance: 'high',
            sourceIds: [],
            evidenceIds: ['claim-1:span-1'],
            evidenceExcerpts: ['梳理用户反馈并形成建议'],
            matchReason: '已有用户反馈归纳和方案建议经验',
            matchStatus: 'basic-match',
            preparationAdvice: '准备需求取舍与复盘案例',
          }],
          capabilityGaps: [{
            title: '产品指标体系',
            reason: '档案中缺少指标拆解证据',
            action: '补充一次指标定义和复盘案例',
            priority: 'high',
          }],
          mindsetGaps: [{
            title: '产品取舍思维',
            reason: '尚未体现优先级判断',
            action: '练习目标、成本和影响范围的取舍',
            priority: 'medium',
          }],
        }) } }],
      }), { status: 200 }),
    )
    let status = 200
    let payload: unknown
    const request = {
      body: {
        directionId: 'direction-1',
        directionName: 'AI 产品 / 产品运营',
        possibleTitles: ['AI 产品运营'],
        evidenceUnits: [{
          id: 'claim-1:span-1',
          sourceLabel: '用户研究项目',
          evidenceType: 'action',
          originalText: '梳理用户反馈并形成建议',
          project: '完整项目档案'.repeat(1000),
          normalizedDescription: '归纳用户需求并形成建议',
          capabilities: ['用户研究'],
          domains: ['AI 产品'],
          tools: [],
          stakeholders: [],
          confidence: 'high',
        }],
      },
      header: (name: string) => name === 'x-deepseek-key' ? 'test-key' : undefined,
      once: vi.fn(),
      off: vi.fn(),
    } as unknown as Request
    const response = {
      status: (value: number) => { status = value; return response },
      json: (value: unknown) => { payload = value; return response },
    } as ExpressResponse

    await createCareerDirectionAnalysisHandler({
      qwenFetch,
      now: () => new Date(timestamp),
      createId: () => 'analysis-1',
    })(request, response)

    expect(status).toBe(200)
    expect(payload).toMatchObject({
      directionId: 'direction-1',
      status: 'completed',
      requirements: [{
        sourceIds: [],
        evidenceIds: ['claim-1:span-1'],
        matchReason: '已有用户反馈归纳和方案建议经验',
      }],
      capabilityGaps: [{ title: '产品指标体系' }],
      mindsetGaps: [{ title: '产品取舍思维' }],
    })
    expect(payload).toMatchObject({ knowledgeMode: 'model-knowledge', sources: [] })
    expect(qwenFetch).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(String(qwenFetch.mock.calls[0]?.[1]?.body))
    const promptInput = JSON.parse(requestBody.messages[1].content)
    expect(promptInput.evidenceUnits[0].project).toBeUndefined()
  })
})
