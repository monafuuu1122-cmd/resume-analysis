import 'fake-indexeddb/auto'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import RoleDirectionsPage from '../src/pages/RoleDirectionsPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  await db.delete()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <RoleDirectionsPage />
    </MemoryRouter>,
  )

describe('RoleDirectionsPage', () => {
  it('adds and deletes a custom direction without a four-item limit', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: '新增方向' }),
    )
    fireEvent.change(screen.getByLabelText('方向名称'), {
      target: { value: '企业文化' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存方向' }))

    expect(
      await screen.findByRole('heading', { name: '企业文化' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /删除方向/ }),
    ).toHaveLength(5)

    fireEvent.click(
      screen.getByRole('button', { name: '删除方向 企业文化' }),
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '企业文化' }),
      ).not.toBeInTheDocument()
    })
  })

  it('generates staged career inspiration and saves a recommendation', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '赛事项目',
      role: '传播实习生',
      project: '世界杯整合营销',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    })
    await db.evidenceSpans.put({
      id: 'span-1',
      sourceArtifactId: 'artifact-1',
      quote: '参与直播脚本修改和现场流程测试',
      start: 0,
      end: 16,
    })
    await db.claims.put({
      id: 'claim-1',
      experienceId: 'experience-1',
      kind: 'action',
      label: '直播执行',
      detail: '协调脚本和现场测试',
      status: 'confirmed',
      evidenceSpanIds: ['span-1'],
    })
    const generated = {
      id: 'batch-1',
      status: 'completed',
      profileSummary: {
        recurringWorkPatterns: ['内容与现场执行'],
        coreCapabilities: ['流程设计'],
        transferableCapabilities: ['内容适配'],
        domainAssets: ['传播'],
        interestSignals: [],
      },
      directions: [{
        id: 'inspiration-1',
        name: '雇主品牌',
        category: '组织传播',
        directionType: 'adjacent',
        fitScore: 65,
        confidence: 'medium',
        summary: '将传播能力迁移到人才沟通。',
        whySuitable: '具有内容与执行证据（claim-1:span-1）。',
        matchedEvidenceIds: ['claim-1:span-1'],
        transferableCapabilities: ['内容适配'],
        evidenceGaps: ['内部传播案例'],
        differenceFromExisting: '面向组织人才。',
        transitionDifficulty: 'medium',
        possibleTitles: ['雇主品牌专员'],
        nextActions: ['拆解岗位 JD'],
        searchKeywords: ['雇主品牌 校招'],
      }],
      generatedAt: '2026-07-29T10:00:00.000Z',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url === '/api/ai/health'
                ? {
                    provider: 'deepseek',
                    configured: true,
                    reachable: true,
                    authenticated: true,
                    modelAvailable: true,
                  }
                : generated,
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    )
    renderPage()

    fireEvent.click(
      await screen.findByRole('button', { name: '获取岗位灵感' }),
    )
    expect(
      screen.getByText('正在检测智能分析服务…'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '雇主品牌' }),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('claim-1:span-1')
    fireEvent.click(
      screen.getByRole('button', { name: '加入岗位方向 雇主品牌' }),
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '岗位灵感' }))
        .not.toBeInTheDocument()
    })
    expect(
      await screen.findAllByRole('heading', { name: '雇主品牌' }),
    ).toHaveLength(1)
    expect((await db.careerDirections.get('inspiration-1'))?.matchedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'claim-1:span-1' }),
      ]),
    )
  })

  it('shows every direction and encourages adding experience when evidence is empty', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: '品牌策划 / 品牌营销' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'AI 产品 / 产品运营' }),
    ).toBeInTheDocument()
    expect(screen.getByText('还没有已确认的证据')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去补充经历' })).toHaveAttribute(
      'href',
      '/experiences',
    )
  })

  it('shows score, confirmed reasons, strengths, gaps, and keyword chips', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '品牌项目',
      role: '传播实习生',
      project: '品牌活动',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    })
    await db.evidenceSpans.put({
      id: 'span-confirmed',
      sourceArtifactId: 'artifact-1',
      quote: '负责品牌内容策划与传播活动复盘',
      start: 0,
      end: 15,
    })
    await db.claims.bulkPut([
      {
        id: 'claim-confirmed',
        experienceId: 'experience-1',
        kind: 'capability',
        label: '品牌策略与内容策划',
        detail: '推动传播并完成活动复盘。',
        status: 'confirmed',
        evidenceSpanIds: ['span-confirmed'],
      },
      {
        id: 'claim-pending',
        experienceId: 'experience-1',
        kind: 'capability',
        label: '用户洞察',
        detail: '',
        status: 'pending',
        evidenceSpanIds: ['span-pending'],
      },
    ])
    renderPage()

    const heading = await screen.findByRole('heading', {
      name: '品牌策划 / 品牌营销',
    })
    const card = heading.closest('article')
    expect(card).not.toBeNull()
    expect(within(card!).getByLabelText(/匹配度 [1-9]\d*%/)).toBeInTheDocument()

    fireEvent.click(
      within(card!).getByRole('button', {
        name: '展开“品牌策划 / 品牌营销”的分析',
      }),
    )

    expect(within(card!).getByText('品牌活动 · 品牌策略与内容策划')).toBeInTheDocument()
    expect(within(card!).getByText(/直接支持该方向/)).toBeInTheDocument()
    expect(
      within(
        within(card!).getByRole('region', { name: '待补缺口' }),
      ).getByText(/根据目标 JD/),
    ).toBeInTheDocument()
    expect(
      within(card!).getByRole('button', {
        name: '复制搜索词“品牌策划 / 品牌营销”',
      }),
    ).toBeInTheDocument()
  })

  it('keeps long work-output labels out of the visible evidence heading', async () => {
    await db.experiences.put({
      id: 'experience-long',
      organization: '品牌项目',
      role: '传播实习生',
      project: '品牌活动整合营销项目工作输出与复盘说明'.repeat(5),
      startDate: '',
      endDate: '',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    })
    await db.evidenceSpans.put({
      id: 'span-long',
      sourceArtifactId: 'artifact-1',
      quote: '负责品牌传播内容执行，并持续整理项目资料、协同团队完成多轮内容迭代与复盘沉淀，形成可复用的工作方法与结果记录，'.repeat(5),
      start: 0,
      end: 10,
    })
    const longLabel = '品牌全链路内容策略与传播项目成果详细工作输出以及复盘说明'.repeat(4)
    await db.claims.put({
      id: 'claim-long',
      experienceId: 'experience-long',
      kind: 'action',
      label: longLabel,
      detail: '品牌传播内容执行',
      status: 'confirmed',
      evidenceSpanIds: ['span-long'],
    })
    renderPage()

    const heading = await screen.findByRole('heading', {
      name: '品牌策划 / 品牌营销',
    })
    const card = heading.closest('article')!
    fireEvent.click(within(card).getByRole('button', {
      name: '展开“品牌策划 / 品牌营销”的分析',
    }))

    expect(within(card).queryByText(longLabel)).not.toBeInTheDocument()
    const evidenceLabels = card.querySelectorAll('section[aria-label="匹配证据"] strong')
    expect(evidenceLabels[0]?.textContent?.length).toBeLessThanOrEqual(100)
    const excerpts = card.querySelectorAll('blockquote')
    expect(excerpts).toHaveLength(1)
    expect(excerpts[0]?.textContent).toMatch(/…$/)
  })

  it('surfaces storage failures as an alert', async () => {
    vi.spyOn(db.claims, 'toArray').mockRejectedValueOnce(
      new Error('方向证据读取失败'),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地存储失败：方向证据读取失败',
    )
  })

  it('treats independent profile materials as usable direction evidence', async () => {
    await db.profileMaterials.put({
      id: 'ai-material',
      type: 'ai_application',
      title: 'AI 产品工作流',
      detail: '用于需求分析和原型验证',
      createdAt: '2026-07-28T10:00:00.000Z',
      updatedAt: '2026-07-28T10:00:00.000Z',
    })

    renderPage()

    await screen.findByRole('heading', { name: 'AI 产品 / 产品运营' })
    expect(screen.queryByText('还没有已确认的证据')).not.toBeInTheDocument()
  })

  it('generates and renders market requirements one by one with evidence, gaps and sources', async () => {
    await db.profileMaterials.put({
      id: 'ai-material',
      type: 'ai_application',
      title: 'AI 产品工作流',
      detail: '梳理用户反馈并形成产品建议',
      createdAt: '2026-08-02T10:00:00.000Z',
      updatedAt: '2026-08-02T10:00:00.000Z',
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'market-1',
      directionId: 'legacy-direction-4',
      directionName: 'AI 产品 / 产品运营',
      status: 'completed',
      fitScore: 68,
      requirements: [{
        id: 'requirement-1',
        requirement: '将用户需求转化为产品方案',
        category: 'responsibility',
        importance: 'high',
        sourceIds: ['source-1'],
        evidenceIds: ['profile-material:ai-material'],
        evidenceExcerpts: ['梳理用户反馈并形成产品建议'],
        matchReason: '已有从用户反馈形成建议的可迁移经验',
        matchStatus: 'basic-match',
        preparationAdvice: '准备需求取舍和方案复盘案例',
      }],
      capabilityGaps: [{
        title: '产品指标体系',
        reason: '档案中缺少指标定义证据',
        action: '补充一次指标拆解案例',
        priority: 'high',
      }],
      mindsetGaps: [{
        title: '产品取舍思维',
        reason: '尚未体现优先级判断',
        action: '练习价值、成本和影响范围的取舍',
        priority: 'medium',
      }],
      sources: [{
        id: 'source-1',
        title: 'AI 产品运营招聘页',
        url: 'https://jobs.example.com/ai-product-ops',
        accessedAt: '2026-08-02T10:00:00.000Z',
      }],
      generatedAt: '2026-08-02T10:00:00.000Z',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'AI 产品 / 产品运营' })
    const card = heading.closest('article')!
    fireEvent.click(within(card).getByRole('button', {
      name: '展开“AI 产品 / 产品运营”的分析',
    }))
    fireEvent.click(within(card).getByRole('button', { name: '生成岗位分析' }))

    expect(await within(card).findByText('将用户需求转化为产品方案')).toBeInTheDocument()
    expect(within(card).getByText('梳理用户反馈并形成产品建议')).toBeInTheDocument()
    expect(within(card).getByText('已有从用户反馈形成建议的可迁移经验')).toBeInTheDocument()
    expect(within(card).getByRole('region', { name: '需补充能力' })).toHaveTextContent('产品指标体系')
    expect(within(card).getByRole('region', { name: '需建立的岗位思维' })).toHaveTextContent('产品取舍思维')
    expect(within(card).queryByRole('link', { name: 'AI 产品运营招聘页' })).not.toBeInTheDocument()
    expect((await db.careerDirections.get('legacy-direction-4'))?.marketAnalysis?.id).toBe('market-1')
  })
})
