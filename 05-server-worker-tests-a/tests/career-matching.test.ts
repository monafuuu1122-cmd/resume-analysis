import { expect, it } from 'vitest'

import { analyzeCareerDirection } from '../src/domain/careerMatching'
import type { CareerDirection } from '../src/domain/types'

const direction = (id: string, name: string, description: string): CareerDirection => ({
  id,
  name,
  description,
  source: 'user-created',
  status: 'exploring',
  matchedEvidence: [],
  transferableCapabilities: [],
  evidenceGaps: [],
  possibleTitles: [],
  adjacentDirections: [],
  developmentSuggestions: [],
  updatedAt: '2026-07-29T10:00:00.000Z',
})

const units = [
  {
    id: 'claim-1:span-1',
    experienceId: 'world-cup',
    claimId: 'claim-1',
    sourceLabel: '世界杯整合营销 · 直播执行',
    organization: '赛事项目',
    role: '传播实习生',
    project: '世界杯整合营销',
    evidenceType: 'action' as const,
    originalText: '参与直播脚本修改和现场流程测试',
    normalizedDescription: '协调脚本和现场测试',
    capabilities: ['内容适配', '流程设计', '风险排查', '跨团队协作'],
    domains: ['传播', '活动'],
    tools: [],
    stakeholders: [],
    confidence: 'high' as const,
  },
]

it('reuses one evidence unit with different angles for different directions', () => {
  const brand = analyzeCareerDirection(
    direction('brand', '品牌营销', '品牌传播与内容策略'),
    units,
  )
  const event = analyzeCareerDirection(
    direction('event', '活动策划', '活动流程、现场执行与风险预案'),
    units,
  )

  expect(brand.matchedEvidence[0]).toMatchObject({
    evidenceType: 'ability-transfer',
    matchAngle: expect.stringContaining('传播'),
  })
  expect(event.matchedEvidence[0]).toMatchObject({
    evidenceType: 'direct',
    matchAngle: expect.stringContaining('流程'),
  })
  expect(brand.matchedEvidence[0].originalText).toBe(
    event.matchedEvidence[0].originalText,
  )
})

it('does not inflate fit score when many claims come from one experience', () => {
  const repeatedUnits = Array.from({ length: 8 }, (_, index) => ({
    ...units[0],
    id: `claim-${index}:span-1`,
    originalText: `负责品牌传播内容执行第${index + 1}项`,
    normalizedDescription: '品牌传播内容策划',
  }))

  const result = analyzeCareerDirection(
    direction('brand', '品牌营销', '品牌传播与内容策略'),
    repeatedUnits,
  )

  expect(result.fitScore).toBeGreaterThan(0)
  expect(result.fitScore).toBeLessThan(90)
})
