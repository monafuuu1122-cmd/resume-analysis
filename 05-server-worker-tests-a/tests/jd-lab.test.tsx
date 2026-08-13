import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import { migrateLegacyPayload } from '../src/db/localDataMigration'
import JdLabPage from '../src/pages/JdLabPage'

const structuredAnalysis = {
  company: '星河科技',
  role: '品牌内容策略',
  department: '品牌部',
  location: '上海',
  level: '高级',
  businessKeywords: ['品牌', '内容策略'],
  matchScore: 82,
  evidenceCoverage: '2 项要求有已确认证据',
  strengths: [
    {
      title: '内容策略',
      explanation: '有品牌内容策略原文证据',
      evidenceClaimIds: ['claim-confirmed'],
    },
  ],
  gaps: [{ title: '行业经验', explanation: '现有证据未覆盖' }],
  resumeRewrites: [
    {
      sourceClaimId: 'claim-confirmed',
      original: '负责品牌内容策略',
      rewritten: '制定并复盘品牌内容策略',
      rationale: '保持原事实并突出行动',
    },
  ],
  interviewDimensions: [
    {
      dimension: '策略方法',
      priority: 'high' as const,
      focus: '说明策略制定与复盘过程',
      evidenceClaimIds: ['claim-confirmed'],
    },
  ],
}

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('JdLabPage', () => {
  it('分析前先完成本地旧档案迁移并发送已确认经历', async () => {
    await migrateLegacyPayload({
      experiences: [{
        id: 'legacy-experience',
        organization: '旧公司',
        role: '内容运营',
        content: '负责内容策划与数据复盘',
      }],
    }, 'test-legacy')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(structuredAnalysis), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<JdLabPage />)

    fireEvent.change(screen.getByLabelText('企业名称'), { target: { value: '星河科技' } })
    fireEvent.click(screen.getByRole('button', { name: '添加企业' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '选择企业 星河科技' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    fireEvent.change(screen.getByLabelText('岗位名称'), { target: { value: '内容运营' } })
    fireEvent.change(screen.getByLabelText('完整 JD'), { target: { value: '负责内容策划' } })
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await screen.findByText('82%')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.profileContext.experiences).toEqual([
      expect.objectContaining({ id: 'legacy-experience', organization: '旧公司' }),
    ])
  })

  it('从带 analysisId 的返回链接恢复上一份 JD 分析并保留面试页签', async () => {
    await db.jdRecords.put({
      id: 'analysis-return',
      company: '星河科技',
      role: '内容策略',
      jdText: '负责内容策略',
      analysisStatus: 'completed',
      analysis: structuredAnalysis,
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    window.history.pushState({}, '', '/jd-lab?analysisId=analysis-return&tab=interview')
    render(<JdLabPage />)

    expect(await screen.findByText('面试准备维度')).toBeInTheDocument()
    expect(screen.getByLabelText('完整 JD')).toHaveValue('负责内容策划')
  })

  it('独立新增、选择并单条删除企业目标', async () => {
    render(<JdLabPage />)

    expect(screen.getByRole('heading', { name: '企业目标' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('企业名称'), {
      target: { value: '星河科技' },
    })
    fireEvent.change(screen.getByLabelText('企业官网（可选）'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加企业' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '选择企业 星河科技' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    fireEvent.change(screen.getByLabelText('企业名称'), {
      target: { value: '远山集团' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加企业' }))

    expect(await screen.findByText('星河科技')).toBeInTheDocument()
    expect(await screen.findByText('远山集团')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '删除企业 星河科技' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择企业 星河科技' }))
    expect(
      screen.getByRole('button', { name: '选择企业 星河科技' }),
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '删除企业 远山集团' }))
    await waitFor(() => {
      expect(screen.queryByText('远山集团')).not.toBeInTheDocument()
    })
    expect(screen.getByText('星河科技')).toBeInTheDocument()
  })

  it('切换适配诊断、简历改写、面试准备时保留 JD 草稿', async () => {
    render(<JdLabPage />)
    const input = screen.getByLabelText('完整 JD')

    fireEvent.change(input, {
      target: { value: '负责品牌内容策略与复盘' },
    })
    fireEvent.click(screen.getByRole('tab', { name: '简历改写' }))
    fireEvent.click(screen.getByRole('tab', { name: '面试准备' }))
    fireEvent.click(screen.getByRole('tab', { name: '适配诊断' }))

    expect(input).toHaveValue('负责品牌内容策略与复盘')
  })

  it('每次分析在历史记录中只显示一个紧凑橙色胶囊', async () => {
    await db.jdRecords.put({
      id: 'compact-history',
      company: '星河科技',
      role: '营销策划经理',
      jdText: '这段很长的 JD 正文不应出现在历史记录中',
      analysisStatus: 'timeout',
      updatedAt: '2026-07-29T10:00:00.000Z',
    })

    render(<JdLabPage />)

    const history = await screen.findByLabelText('历史 JD')
    const pill = await within(history).findByRole('button', {
      name: '星河科技 · 营销策划经理',
    })
    expect(pill).toHaveClass('jd-history-pill-main')
    expect(within(history).queryByText('已超时')).not.toBeInTheDocument()
    expect(
      within(history).queryByText('这段很长的 JD 正文不应出现在历史记录中'),
    ).not.toBeInTheDocument()
  })

  it('只发送有原文的已确认证据并把结果保存到同一记录', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '原公司',
      role: '内容策划',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    await db.evidenceSpans.put({
      id: 'evidence-1',
      sourceArtifactId: 'artifact-1',
      quote: '负责品牌内容策略',
      start: 0,
      end: 8,
    })
    await db.claims.bulkPut([
      {
        id: 'claim-confirmed',
        experienceId: 'experience-1',
        kind: 'responsibility',
        label: '品牌策略',
        detail: '',
        status: 'confirmed',
        evidenceSpanIds: ['evidence-1'],
      },
      {
        id: 'claim-pending',
        experienceId: 'experience-1',
        kind: 'result',
        label: '未确认成果',
        detail: '',
        status: 'pending',
        evidenceSpanIds: ['evidence-1'],
      },
    ])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(structuredAnalysis), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<JdLabPage />)

    fireEvent.change(screen.getByLabelText('企业名称'), {
      target: { value: '星河科技' },
    })
    fireEvent.change(screen.getByLabelText('企业官网（可选）'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByLabelText('所属行业（可选）'), {
      target: { value: '互联网' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加企业' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '选择企业 星河科技' }),
      ).toHaveAttribute('aria-pressed', 'true')
    })
    fireEvent.change(screen.getByLabelText('岗位名称'), {
      target: { value: '品牌内容策略' },
    })
    fireEvent.change(screen.getByLabelText('完整 JD'), {
      target: { value: '负责品牌内容策略与复盘' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await screen.findByText('82%')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      jdText: '负责品牌内容策略与复盘',
      companyName: '星河科技',
      companyWebsite: 'https://example.com',
      companyIndustry: '互联网',
      roleName: '品牌内容策略',
      profileContext: {
        claims: [
          {
            id: 'claim-confirmed',
            evidence: [{ quote: '负责品牌内容策略' }],
          },
        ],
      },
    })
    expect(JSON.stringify(body)).not.toContain('claim-pending')
    expect(JSON.stringify(body)).not.toContain('browser-secret')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })

    const saved = await db.jdRecords.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      id: expect.any(String),
      company: '星河科技',
      companyWebsite: 'https://example.com',
      companyIndustry: '互联网',
      role: '品牌内容策略',
      analysisStatus: 'completed',
      analysis: structuredAnalysis,
      activeJobId: expect.any(String),
      inputHash: expect.stringMatching(/^sha256:/),
    })
    expect(await db.analysisJobs.count()).toBe(1)
    expect((await db.analysisJobs.toArray())[0].status).toBe('completed')
  })

  it('打开无结构化分析的旧记录时提示重新分析且不抛错', async () => {
    await db.jdRecords.put({
      id: 'legacy-jd',
      company: '旧公司',
      role: '旧岗位',
      jdText: '旧 JD 原文',
      analysis: { legacy: true },
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'DEEPSEEK_NOT_CONFIGURED',
            message: '智能分析服务尚未完成配置',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    render(<JdLabPage />)

    fireEvent.click(
      await screen.findByRole('button', { name: '旧公司 · 旧岗位' }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('完整 JD')).toHaveValue('旧 JD 原文')
    })
    expect(screen.getByRole('button', { name: '重新分析' })).toBeInTheDocument()
    expect(screen.getByText('此记录需要重新分析')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新分析' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '智能分析服务尚未完成配置',
    )
    expect(screen.getByLabelText('完整 JD')).toHaveValue('旧 JD 原文')
    await waitFor(async () => {
      expect(await db.jdRecords.get('legacy-jd')).toMatchObject({
        analysis: { legacy: true },
      })
    })
    expect(await db.jdRecords.count()).toBe(2)
  })

  it('reanalyzes into a child archive without overwriting history', async () => {
    await db.jdRecords.put({
      id: 'analysis-old',
      company: '星河科技',
      role: '品牌内容策略',
      jdText: '负责品牌策略',
      analysisStatus: 'completed',
      analysis: structuredAnalysis,
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(structuredAnalysis), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    render(<JdLabPage />)
    fireEvent.click(
      await screen.findByRole('button', { name: '星河科技 · 品牌内容策略' }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('完整 JD')).toHaveValue('负责品牌策略'),
    )
    fireEvent.click(screen.getByRole('button', { name: '开始新分析' }))

    await waitFor(async () => {
      const records = await db.jdRecords.toArray()
      expect(records).toHaveLength(2)
      expect(
        records.find(({ id }) => id !== 'analysis-old')?.analysisStatus,
      ).toBe('completed')
    })
    expect(await db.jdRecords.get('analysis-old')).toMatchObject({
      analysis: structuredAnalysis,
    })
    expect(await db.jdRecords.get('analysis-old')).not.toHaveProperty(
      'parentAnalysisId',
    )
    const child = (await db.jdRecords.toArray()).find(
      ({ id }) => id !== 'analysis-old',
    )
    expect(child).toMatchObject({
      parentAnalysisId: 'analysis-old',
      analysisStatus: 'completed',
    })
  })
})
