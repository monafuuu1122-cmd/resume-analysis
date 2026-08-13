import { describe, expect, it, vi } from 'vitest'

import {
  buildCapabilitySummaries,
  buildRoleDirectionScores,
  ROLE_TAXONOMY,
} from '../src/domain/scoring'
import type { ExtractedClaim, ProfileMaterial } from '../src/domain/types'

const claim = (
  overrides: Partial<ExtractedClaim> & Pick<ExtractedClaim, 'id' | 'label'>,
): ExtractedClaim => ({
  experienceId: 'experience-1',
  kind: 'capability',
  detail: '',
  status: 'confirmed',
  evidenceSpanIds: [`span-${overrides.id}`],
  ...overrides,
})

describe('buildCapabilitySummaries', () => {
  it('maps actions and results to market-recognized capability labels', () => {
    const summaries = buildCapabilitySummaries([
      claim({
        id: 'action',
        kind: 'action',
        label: '推动跨部门上线',
        detail: '协调设计、研发与业务团队按期交付。',
      }),
      claim({
        id: 'result',
        kind: 'result',
        label: '复盘转化数据',
        detail: '分析转化率并调整方案。',
      }),
    ])

    expect(summaries.map(({ label }) => label)).toEqual(
      expect.arrayContaining(['项目推进与执行', '数据分析与复盘']),
    )
  })

  it('extracts AI application evidence from an action claim instead of dropping it', () => {
    const summaries = buildCapabilitySummaries([
      claim({
        id: 'ai-action',
        kind: 'responsibility',
        label: '创意视觉主导',
        detail: '运用AI工具独立完成海报原型及版式方案。',
      }),
    ])

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ai',
          label: 'AI 应用与工作流',
          evidenceSpanIds: ['span-ai-action'],
          experienceIds: ['experience-1'],
        }),
      ]),
    )
  })

  it('includes independent certificate, AI, and language materials', () => {
    const materials: ProfileMaterial[] = [
      {
        id: 'language-1',
        type: 'language',
        title: '英语',
        detail: '可进行英文工作沟通',
        proficiency: 'CET-6',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
      },
      {
        id: 'ai-1',
        type: 'ai_application',
        title: 'AI 辅助用户研究',
        detail: '用于访谈纪要归纳和洞察聚类',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
      },
      {
        id: 'tool-1',
        type: 'skill_tool',
        title: 'Figma',
        detail: '用于界面设计和交互原型',
        proficiency: '熟练',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
      } as unknown as ProfileMaterial,
    ]

    const summaries = buildCapabilitySummaries([], materials)

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'language',
          label: '英语',
          profileMaterialIds: ['language-1'],
        }),
        expect.objectContaining({
          kind: 'ai',
          label: 'AI 辅助用户研究',
          profileMaterialIds: ['ai-1'],
        }),
        expect.objectContaining({
          kind: 'tool',
          label: 'Figma',
          profileMaterialIds: ['tool-1'],
        }),
      ]),
    )
  })

  it('ignores pending, rejected, and non-capability claims', () => {
    const summaries = buildCapabilitySummaries([
      claim({ id: 'confirmed', label: '内容策划' }),
      claim({ id: 'pending', label: '数据分析', status: 'pending' }),
      claim({ id: 'rejected', label: '用户研究', status: 'rejected' }),
      claim({ id: 'result', label: '增长 20%', kind: 'result' }),
    ])

    expect(summaries.map(({ label }) => label)).toEqual(['内容策划'])
  })

  it('normalizes labels and deduplicates evidence and experiences', () => {
    const summaries = buildCapabilitySummaries([
      claim({
        id: 'a',
        label: ' 内容 策划 ',
        evidenceSpanIds: ['span-1', 'span-2'],
      }),
      claim({
        id: 'b',
        label: '内容策划',
        evidenceSpanIds: ['span-2', 'span-3'],
      }),
      claim({
        id: 'c',
        label: '内容策划',
        experienceId: 'experience-2',
        evidenceSpanIds: ['span-4'],
      }),
    ])

    expect(summaries).toEqual([
      {
        label: '内容策划',
        kind: 'capability',
        evidenceSpanIds: ['span-1', 'span-2', 'span-3', 'span-4'],
        experienceIds: ['experience-1', 'experience-2'],
        profileMaterialIds: [],
        evidenceCount: 4,
        experienceCount: 2,
      },
    ])
  })

  it('keeps the same label separate across kinds and sorts deterministically', () => {
    const summaries = buildCapabilitySummaries([
      claim({ id: 'tool', label: '飞书', kind: 'tool' }),
      claim({ id: 'capability', label: '飞书', kind: 'capability' }),
      claim({
        id: 'b',
        label: '用户洞察',
        evidenceSpanIds: ['span-b-1', 'span-b-2'],
      }),
      claim({
        id: 'a',
        label: '内容策划',
        evidenceSpanIds: ['span-a-1', 'span-a-2'],
      }),
    ])

    expect(
      summaries.map(({ evidenceCount, kind, label }) => ({
        evidenceCount,
        kind,
        label,
      })),
    ).toEqual([
      { evidenceCount: 2, kind: 'capability', label: '内容策划' },
      { evidenceCount: 2, kind: 'capability', label: '用户洞察' },
      { evidenceCount: 1, kind: 'capability', label: '飞书' },
      { evidenceCount: 1, kind: 'tool', label: '飞书' },
    ])
  })

  it('uses kind as a stable tie-breaker when input order is reversed', () => {
    const claims = [
      claim({ id: 'tool', label: '飞书', kind: 'tool' }),
      claim({ id: 'capability', label: '飞书', kind: 'capability' }),
      claim({ id: 'ai', label: '飞书', kind: 'ai' }),
    ]

    const forward = buildCapabilitySummaries(claims)
    const reversed = buildCapabilitySummaries([...claims].reverse())

    expect(reversed).toEqual(forward)
    expect(forward.map(({ kind }) => kind)).toEqual([
      'ai',
      'capability',
      'tool',
    ])
  })
})

describe('buildRoleDirectionScores', () => {
  it('scores only confirmed claim labels and details with deduplicated keyword matches', () => {
    const scores = buildRoleDirectionScores([
      claim({
        id: 'brand-a',
        label: '品牌策略与内容策划',
        detail: '负责整合传播，并完成活动复盘。',
        evidenceSpanIds: ['span-brand-a'],
      }),
      claim({
        id: 'brand-b',
        label: '品牌策略',
        detail: '重复出现的品牌策略不应重复计分。',
        evidenceSpanIds: ['span-brand-b'],
      }),
      claim({
        id: 'pending',
        label: '用户洞察',
        status: 'pending',
      }),
    ])
    const brand = scores.find(
      ({ direction }) => direction === '品牌策划 / 品牌营销',
    )

    expect(brand).toMatchObject({
      percentage: 62,
      band: '可尝试',
      matchedKeywords: ['品牌策略', '内容策划', '传播', '活动复盘'],
      gaps: ['用户洞察'],
      searchKeywords: ROLE_TAXONOMY[0].keywords,
    })
    expect(brand?.matchedEvidence).toHaveLength(2)
  })

  it.each([
    {
      claims: [
        claim({
          id: 'high',
          label: 'AI 工作流与需求分析',
          detail: '制作原型并推动跨团队协作。',
        }),
      ],
      band: '可尝试',
      percentage: 68,
    },
    {
      claims: [
        claim({
          id: 'try',
          label: '需求分析',
          detail: '能够制作原型。',
        }),
      ],
      band: '可尝试',
      percentage: 35,
    },
    {
      claims: [
        claim({
          id: 'grow',
          label: '需求分析',
        }),
      ],
      band: '待积累',
      percentage: 24,
    },
  ])('returns $band at $percentage%', ({ band, claims, percentage }) => {
    const score = buildRoleDirectionScores(claims).find(
      ({ direction }) => direction === 'AI 产品 / 产品运营',
    )

    expect(score).toMatchObject({ band, percentage })
  })

  it('returns all taxonomy directions and performs no live fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const scores = buildRoleDirectionScores([])

    expect(scores.map(({ direction }) => direction)).toEqual(
      ROLE_TAXONOMY.map(({ direction }) => direction),
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('does not let a generic claim reverse-match a longer role keyword', () => {
    const content = buildRoleDirectionScores([
      claim({ id: 'generic', label: '运营' }),
    ]).find(({ direction }) => direction === '内容运营 / 内容策略')

    expect(content).toMatchObject({
      percentage: 0,
      band: '待积累',
      matchedKeywords: [],
      gaps: ['内容策略', '选题', '文案', '账号运营', '数据复盘'],
    })
  })

  it.each([
    {
      label: 'Daily reporting',
      detail: '',
      percentage: 0,
      matchedKeywords: [],
    },
    {
      label: 'AI workflow',
      detail: '',
      percentage: 24,
      matchedKeywords: ['AI'],
    },
    {
      label: '用AI支持产品工作流',
      detail: '',
      percentage: 35,
      matchedKeywords: ['AI', '工作流'],
    },
  ])(
    'matches AI only as a Latin token for "$label"',
    ({ detail, label, matchedKeywords, percentage }) => {
      const aiDirection = buildRoleDirectionScores([
        claim({ id: 'ai-boundary', label, detail }),
      ]).find(({ direction }) => direction === 'AI 产品 / 产品运营')

      expect(aiDirection).toMatchObject({ matchedKeywords, percentage })
    },
  )

  it('stably sorts duplicate matched evidence and advantages by claim id', () => {
    const claims = [
      claim({
        id: 'claim-b',
        label: '内容策略',
        detail: '负责选题。',
        evidenceSpanIds: ['span-b'],
      }),
      claim({
        id: 'claim-a',
        label: '内容策略',
        detail: '负责选题。',
        evidenceSpanIds: ['span-a'],
      }),
    ]

    const forward = buildRoleDirectionScores(claims)
    const reversed = buildRoleDirectionScores([...claims].reverse())
    const content = forward.find(
      ({ direction }) => direction === '内容运营 / 内容策略',
    )

    expect(reversed).toEqual(forward)
    expect(content?.matchedEvidence.map(({ claimId }) => claimId)).toEqual([
      'claim-a',
      'claim-b',
    ])
    expect(content?.advantages).toHaveLength(2)
    expect(new Set(content?.advantages).size).toBe(1)
  })
})
