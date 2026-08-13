import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db/database'
import App from '../src/app/App'
import InterviewPreparationPage from '../src/pages/InterviewPreparationPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  await db.delete()
})

describe('InterviewPreparationPage', () => {
  it('shows actionable guidance even before evidence is added', async () => {
    render(
      <MemoryRouter>
        <InterviewPreparationPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '面试准备' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '能力缺口' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '岗位思维提示' })).toBeInTheDocument()
    expect(screen.getByText('还没有已确认的内容策划与传播证据，先从一段真实经历里补出可验证的动作和结果。')).toBeInTheDocument()
  })

  it('adds 面试准备 to the left navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/interview-prep']}>
        <App />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: '面试准备' })
    expect(link).toHaveAttribute('href', '/interview-prep')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('uses different preparation actions for different strong dimensions', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '北极星工作室',
      role: '内容运营',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    await db.evidenceSpans.bulkPut([
      { id: 'span-content', sourceArtifactId: 'artifact-1', quote: '负责内容策划与传播。', start: 0, end: 10 },
      { id: 'span-project', sourceArtifactId: 'artifact-1', quote: '统筹项目推进与交付。', start: 11, end: 22 },
      { id: 'span-strategy', sourceArtifactId: 'artifact-1', quote: '制定品牌策略与规划。', start: 23, end: 34 },
    ])
    await db.claims.bulkPut([
      { id: 'claim-content', experienceId: 'experience-1', kind: 'capability', label: '内容策划与传播', detail: '', status: 'confirmed', evidenceSpanIds: ['span-content'] },
      { id: 'claim-project', experienceId: 'experience-1', kind: 'capability', label: '项目推进与交付', detail: '', status: 'confirmed', evidenceSpanIds: ['span-project'] },
      { id: 'claim-strategy', experienceId: 'experience-1', kind: 'capability', label: '品牌策略与规划', detail: '', status: 'confirmed', evidenceSpanIds: ['span-strategy'] },
    ])

    render(
      <MemoryRouter>
        <InterviewPreparationPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('整理一段“洞察—内容方案—传播结果”的案例')).toBeInTheDocument()
    expect(screen.getByText('画出一次项目的关键节点、角色和风险')).toBeInTheDocument()
    expect(screen.getByText('为一个项目补写“为什么选这个方案”')).toBeInTheDocument()
  })
})
