import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InterviewResearchPanel from '../src/components/interview/InterviewResearchPanel'
import { db } from '../src/db/database'
import type {
  InterviewResearch,
  JdAnalysis,
  JdRecord,
} from '../src/domain/types'

const timestamp = '2026-07-28T10:00:00.000Z'
const analysis: JdAnalysis = {
  company: '星河科技',
  role: '内容策略',
  department: '品牌部',
  location: '上海',
  level: '高级',
  businessKeywords: ['品牌'],
  matchScore: 80,
  evidenceCoverage: '一项确认证据',
  strengths: [],
  gaps: [{ title: '管理经验', explanation: '证据不足' }],
  resumeRewrites: [],
  interviewDimensions: [],
}
const record: JdRecord = {
  id: 'analysis-1',
  company: analysis.company,
  role: analysis.role,
  jdText: '负责品牌内容策略',
  analysisStatus: 'completed',
  analysis,
  profileSnapshot: { claims: [], experiences: [] },
  updatedAt: timestamp,
}
const completedResearch: InterviewResearch = {
  id: 'research-1',
  analysisId: record.id,
  researchStatus: 'completed',
  identityStatus: 'confirmed',
  sources: [
    {
      id: 'source-1',
      title: '星河科技招聘官网',
      url: 'https://example.com/careers',
      content: '招聘官网强调长期主义。',
      sourceType: 'official_careers',
      accessedAt: timestamp,
    },
  ],
  companyInsights: [
    {
      id: 'insight-1',
      topic: 'culture',
      content: '招聘官网强调长期主义。',
      evidenceType: 'official',
      sourceIds: ['source-1'],
    },
    {
      id: 'insight-2',
      topic: 'talent',
      content: '面试可能关注跨团队推动能力。',
      evidenceType: 'inference',
      sourceIds: ['source-1'],
    },
  ],
  competencies: [
    {
      id: 'competency-1',
      competency: '内容策略',
      requirement: '能够制定并复盘内容策略',
      priority: 'high',
      assessment: 'unknown',
      evidenceClaimIds: [],
      sourceIds: ['source-1'],
    },
  ],
  interviewPriorities: [
    {
      id: 'priority-1',
      title: '准备策略复盘案例',
      priority: 'high',
      rationale: '这是岗位核心要求',
      evidenceClaimIds: [],
    },
  ],
  predictedQuestions: [
    {
      id: 'question-1',
      question: '你如何制定内容策略？',
      category: 'competency',
      priority: 'high',
      rationale: '对应岗位核心能力',
      evidenceClaimIds: [],
      sourceIds: ['source-1'],
    },
  ],
  preparationChecklist: [
    {
      id: 'check-1',
      label: '准备一个策略复盘案例',
      completed: false,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
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

describe('InterviewResearchPanel', () => {
  it('显示四个研究 Tab 和非实时模型知识提示', async () => {
    await db.interviewResearch.put(completedResearch)
    render(<InterviewResearchPanel analysis={analysis} record={record} />)

    expect(await screen.findByText('面试研究摘要')).toBeInTheDocument()
    expect(screen.getByLabelText('研究摘要')).toHaveTextContent(
      '1 个高优先级重点',
    )
    ;[
      '企业与人才画像',
      '岗位能力矩阵',
      '重点准备',
      '高概率问题',
    ].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    })

    expect(screen.getByText('官方信息')).toBeInTheDocument()
    expect(screen.getByText('模型已有知识')).toBeInTheDocument()
    expect(screen.getByText(/基于模型已有知识，非实时联网结果/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '信息来源' })).not.toBeInTheDocument()
  })

  it('清单勾选只保存到本地且不触发 AI', async () => {
    await db.interviewResearch.put(completedResearch)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<InterviewResearchPanel analysis={analysis} record={record} />)

    await screen.findByText('面试研究摘要')
    fireEvent.click(screen.getByRole('tab', { name: '重点准备' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: '准备一个策略复盘案例' }),
    )

    await waitFor(async () => {
      expect(await db.interviewResearch.get('research-1')).toMatchObject({
        preparationChecklist: [
          {
            id: 'check-1',
            completed: true,
          },
        ],
      })
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('旧研究中的内部证据编号不会显示给用户', async () => {
    await db.interviewResearch.put({
      ...completedResearch,
      id: 'research-internal-ids',
      companyInsights: [{
        ...completedResearch.companyInsights[0],
        content: '强调长期主义（claim-4），并重视 AI（人工智能）能力。',
      }],
      competencies: [{
        ...completedResearch.competencies[0],
        requirement: '制定策略（profile-material-language-1）',
      }],
      interviewPriorities: [{
        ...completedResearch.interviewPriorities[0],
        rationale: '来自经历（artifact-a-claim-0）',
      }],
    })
    render(<InterviewResearchPanel analysis={analysis} record={record} />)

    expect(await screen.findByText(/强调长期主义/)).toHaveTextContent(
      '强调长期主义，并重视 AI（人工智能）能力。',
    )
    expect(document.body).not.toHaveTextContent('claim-4')
    fireEvent.click(screen.getByRole('tab', { name: '岗位能力矩阵' }))
    expect(document.body).not.toHaveTextContent('profile-material-language-1')
    fireEvent.click(screen.getByRole('tab', { name: '重点准备' }))
    expect(document.body).not.toHaveTextContent('artifact-a-claim-0')
  })

  it.each([
    ['researching', '正在整理企业与岗位信息'],
    ['generating', '正在生成面试重点'],
    ['partial', '部分信息现有知识不足'],
    ['uncertain', '企业身份仍需核实'],
    ['no-reliable-info', '现有知识不足'],
    ['unavailable', '旧研究未完成，可直接使用DeepSeek重新生成。'],
    ['failed', '面试研究生成失败'],
  ] as const)('为 %s 状态提供明确反馈', async (researchStatus, copy) => {
    await db.interviewResearch.put({
      ...completedResearch,
      id: `research-${researchStatus}`,
      researchStatus,
      identityStatus:
        researchStatus === 'uncertain' ? 'uncertain' : 'confirmed',
      sources:
        researchStatus === 'no-reliable-info' ||
        researchStatus === 'unavailable' ||
        researchStatus === 'failed'
          ? []
          : completedResearch.sources,
    })
    render(<InterviewResearchPanel analysis={analysis} record={record} />)

    expect(await screen.findByText(copy)).toBeInTheDocument()
    if (researchStatus === 'failed') {
      expect(
        screen.getByRole('button', { name: '重试面试研究' }),
      ).toBeInTheDocument()
    }
    if (researchStatus === 'unavailable') {
      expect(
        screen.getByRole('button', { name: '重新生成面试研究' }),
      ).toBeInTheDocument()
    }
  })

  it('旧 JD 没有研究时可生成并保存返回结果', async () => {
    await db.jdRecords.put(record)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completedResearch), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<InterviewResearchPanel analysis={analysis} record={record} />)

    expect(
      await screen.findByText('这条 JD 还没有面试研究'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '生成面试研究' }))

    expect(await screen.findByText('面试研究摘要')).toBeInTheDocument()
    const [, init] = fetchMock.mock.calls[0]
    expect(fetchMock.mock.calls[0][0]).toBe('/api/interview-research')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      analysisId: record.id,
      jdText: record.jdText,
      analysis,
      profileContext: record.profileSnapshot,
    })
    const stored = await db.interviewResearch.toArray()
    expect(stored).toHaveLength(1)
    expect((await db.jdRecords.get(record.id))?.companyResearchId).toBe(
      stored[0].id,
    )
  })
})
