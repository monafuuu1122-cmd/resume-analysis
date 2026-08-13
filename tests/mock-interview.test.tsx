import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/app/App'
import InterviewReport from '../src/components/interview/InterviewReport'
import { db } from '../src/db/database'

const now = '2026-07-28T08:00:00.000Z'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.jdRecords.put({
    id: 'analysis-1',
    company: '星河科技',
    role: '内容策略负责人',
    jdText: '负责内容策略与跨团队协作',
    analysisStatus: 'completed',
    analysis: {
      company: '星河科技',
      role: '内容策略负责人',
      department: '品牌',
      location: '上海',
      level: '负责人',
      businessKeywords: ['内容策略'],
      matchScore: 82,
      evidenceCoverage: '较充分',
      strengths: [],
      gaps: [],
      resumeRewrites: [],
      interviewDimensions: [],
    },
    profileSnapshot: { claims: [], experiences: [] },
    updatedAt: now,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('mock interview', () => {
  it('loads the analysis context and offers both practice modes without research', async () => {
    render(
      <MemoryRouter initialEntries={['/jd-lab/analysis-1/interview']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '模拟面试训练场' }),
    ).toBeInTheDocument()
    expect(screen.getByText('星河科技 · 内容策略负责人')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '开始 HR 面' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '开始业务面' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '返回补充面试研究' }),
    ).toHaveAttribute('href', '/jd-lab?analysisId=analysis-1&tab=interview')
  })

  it('单题练习返回到 HR 与业务面入口，而不是空白页', async () => {
    render(
      <MemoryRouter initialEntries={['/jd-lab/analysis-1/interview?mode=practice&questionId=q-1&question=请介绍一个代表项目']}>
        <App />
      </MemoryRouter>,
    )

    await new Promise((resolve) => setTimeout(resolve, 80))
    const back = await screen.findByText('← 返回 HR / 业务面')
    fireEvent.click(back)
    expect(await screen.findByRole('button', { name: '开始 HR 面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始业务面' })).toBeInTheDocument()
  })

  it('shows a focused practice input for a predicted question', async () => {
    render(
      <MemoryRouter initialEntries={['/jd-lab/analysis-1/interview?mode=practice&questionId=q-1&question=请介绍一个代表项目']}>
        <App />
      </MemoryRouter>,
    )
    const submit = await screen.findByRole('button', { name: '提交回答' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('你的回答'), {
      target: { value: '我负责过品牌升级。' },
    })
    expect(submit).toBeEnabled()
  })

  it('renders a completed report with review and export actions', async () => {
    render(
      <InterviewReport
        report={{
          summary: '表达清楚，结构完整。',
          strengths: ['目标明确'],
          improvements: ['补充具体数据'],
        }}
        session={{
          id: 'session-1',
          analysisId: 'analysis-1',
          mode: 'text',
          status: 'completed',
          turns: [
            {
              id: 'turn-1',
              sequence: 1,
              question: '请介绍代表项目。',
              answer: '我负责品牌升级。',
              inputMode: 'text',
              feedback: '结构清晰。',
              createdAt: now,
            },
          ],
          createdAt: now,
          updatedAt: now,
          completedAt: now,
        }}
        onRestart={vi.fn()}
        onWeaknessPractice={vi.fn()}
        onCoachAnswer={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '本轮复盘' })).toBeInTheDocument()
    expect(screen.getByText('结构清晰。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('AI 模拟，不代表企业真实录用判断')).toBeInTheDocument(),
    )
  })
})
