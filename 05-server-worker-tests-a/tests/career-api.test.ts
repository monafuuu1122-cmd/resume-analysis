// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { Request, Response as ExpressResponse } from 'express'

import { createCareerInspirationHandler } from '../server/career'
import type { FetchImplementation } from '../server/qwen'

const evidenceUnit = {
  id: 'claim-1:span-1',
  experienceId: 'experience-1',
  sourceLabel: '世界杯项目 · 直播执行',
  evidenceType: 'action',
  originalText: '参与直播脚本修改和现场流程测试',
  normalizedDescription: '协调脚本和现场测试',
  capabilities: ['内容适配', '流程设计'],
  domains: ['传播', '活动'],
  tools: [],
  stakeholders: [],
  confidence: 'high',
}

const validDirection = {
  name: '雇主品牌',
  category: '品牌与组织传播',
  directionType: 'adjacent',
  fitScore: 66,
  confidence: 'medium',
  summary: '以品牌传播能力迁移到组织人才沟通。',
  whySuitable: '已有传播项目执行证据。',
  matchedEvidenceIds: ['claim-1:span-1'],
  transferableCapabilities: ['内容适配'],
  evidenceGaps: ['内部传播案例'],
  differenceFromExisting: '服务组织人才沟通，而非消费者传播。',
  transitionDifficulty: 'medium',
  possibleTitles: ['雇主品牌专员'],
  nextActions: ['拆解三个雇主品牌案例'],
  searchKeywords: ['雇主品牌 校招'],
}

function qwenResponse(payload: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

async function runHandler(
  fetchImplementation: FetchImplementation,
  body: Record<string, unknown> = {},
) {
  let status = 200
  let payload: unknown
  const request = {
    body: {
      evidenceUnits: [evidenceUnit],
      savedDirections: ['品牌营销'],
      excludedDirections: ['用户运营'],
      model: 'deepseek-v4-flash',
      ...body,
    },
    header: (name: string) =>
      name === 'x-deepseek-key' ? 'test-key' : undefined,
  } as Request
  const response = {
    json: (value: unknown) => {
      payload = value
      return response
    },
    status: (value: number) => {
      status = value
      return response
    },
  } as ExpressResponse
  await createCareerInspirationHandler({ fetchImplementation })(request, response)
  return { payload, status }
}

describe('POST /api/career-inspiration', () => {
  it('sends complete evidence and accepts a non-predefined direction', async () => {
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(
        qwenResponse({
          profileSummary: {
            recurringWorkPatterns: ['内容与现场执行'],
            coreCapabilities: ['流程设计'],
            transferableCapabilities: ['内容适配'],
            domainAssets: ['品牌传播'],
            interestSignals: [],
          },
          directions: [validDirection],
        }),
      )

    const result = await runHandler(fetchImplementation)
    const upstream = JSON.parse(
      String(fetchImplementation.mock.calls[0][1]?.body),
    )

    expect(upstream.messages[1].content).toContain('claim-1:span-1')
    expect(result).toMatchObject({
      status: 200,
      payload: {
        status: 'completed',
        directions: [{ name: '雇主品牌' }],
      },
    })
  })

  it('keeps valid cards and reports partial when another card is invalid', async () => {
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(
        qwenResponse({
          profileSummary: {
            recurringWorkPatterns: [],
            coreCapabilities: [],
            transferableCapabilities: [],
            domainAssets: [],
            interestSignals: [],
          },
          directions: [
            validDirection,
            { ...validDirection, name: '', matchedEvidenceIds: ['missing'] },
          ],
        }),
      )

    const result = await runHandler(fetchImplementation)

    expect(result).toMatchObject({
      status: 200,
      payload: {
        status: 'partial',
        directions: [{ name: '雇主品牌' }],
      },
    })
  })

  it('returns insufficient-profile without calling DeepSeek', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>()
    const result = await runHandler(fetchImplementation, {
      evidenceUnits: [],
    })

    expect(result).toMatchObject({
      status: 200,
      payload: { status: 'insufficient-profile', directions: [] },
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})
