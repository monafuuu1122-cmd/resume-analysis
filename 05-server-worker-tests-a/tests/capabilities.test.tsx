import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import CapabilitiesPage from '../src/pages/CapabilitiesPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.delete()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <CapabilitiesPage />
    </MemoryRouter>,
  )

async function seedEvidence() {
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
    {
      id: 'span-confirmed',
      sourceArtifactId: 'artifact-1',
      quote: '制定季度内容策略，并用数据完成复盘。',
      start: 0,
      end: 18,
    },
    {
      id: 'span-pending',
      sourceArtifactId: 'artifact-1',
      quote: '使用 Midjourney。',
      start: 19,
      end: 32,
    },
  ])
  await db.claims.bulkPut([
    {
      id: 'claim-confirmed',
      experienceId: 'experience-1',
      kind: 'capability',
      label: '内容策略',
      detail: '负责选题和复盘。',
      status: 'confirmed',
      evidenceSpanIds: ['span-confirmed'],
    },
    {
      id: 'claim-pending',
      experienceId: 'experience-1',
      kind: 'ai',
      label: 'Midjourney',
      detail: '',
      status: 'pending',
      evidenceSpanIds: ['span-pending'],
    },
  ])
}

describe('CapabilitiesPage', () => {
  it('links the empty state to experience entry', async () => {
    renderPage()

    expect(await screen.findByText('还没有已确认的能力证据')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去补充经历' })).toHaveAttribute(
      'href',
      '/experiences',
    )
  })

  it('expands confirmed evidence with its source and excludes pending claims', async () => {
    await seedEvidence()
    renderPage()

    expect(await screen.findByText('内容策略')).toBeInTheDocument()
    expect(screen.queryByText('Midjourney')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: '展开“内容策略”的证据' }),
    )

    expect(
      screen.getByText('制定季度内容策略，并用数据完成复盘。'),
    ).toBeInTheDocument()
    expect(screen.getByText('北极星工作室 · 内容运营')).toBeInTheDocument()
  })

  it('surfaces storage failures as an alert', async () => {
    vi.spyOn(db.claims, 'toArray').mockRejectedValueOnce(
      new Error('能力证据读取失败'),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地存储失败：能力证据读取失败',
    )
  })

  it('shows independent language and AI application materials', async () => {
    await db.profileMaterials.bulkPut([
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
        title: 'AI 辅助用户访谈',
        detail: '用于纪要归纳和洞察聚类',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
      },
    ])

    renderPage()

    expect(await screen.findByText('英语')).toBeInTheDocument()
    expect(screen.getByText('AI 辅助用户访谈')).toBeInTheDocument()
    expect(screen.getByText('语言能力')).toBeInTheDocument()
  })

  it('shows a concrete professional dimension and counts AI action evidence', async () => {
    await db.evidenceSpans.put({
      id: 'span-ai-action',
      sourceArtifactId: 'artifact-1',
      quote: '运用AI工具独立完成海报原型及版式方案。',
      start: 0,
      end: 22,
    })
    await db.claims.put({
      id: 'claim-ai-action',
      experienceId: 'experience-1',
      kind: 'responsibility',
      label: '创意视觉主导',
      detail: '运用AI工具独立完成海报原型及版式方案。',
      status: 'confirmed',
      evidenceSpanIds: ['span-ai-action'],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '内容策划与传播' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'AI 应用证据强度' })).not.toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps every radar label inside the readable SVG safe area', async () => {
    await seedEvidence()
    const view = renderPage()

    await screen.findByRole('img', { name: '六项能力雷达总览' })
    const labels = Array.from(
      view.container.querySelectorAll<SVGTextElement>('.radar-label'),
    )

    expect(labels).toHaveLength(6)
    expect(labels.every((label) => {
      const x = Number(label.getAttribute('x'))
      return x >= 60 && x <= 270
    })).toBe(true)
  })
})
