import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEEPSEEK_API_KEY_STORAGE_KEY } from '../src/ai/client'
import { db } from '../src/db/database'
import DashboardPage from '../src/pages/DashboardPage'

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await db.delete()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )

describe('DashboardPage', () => {
  it('renders the approved hero and four graphical destinations', async () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Offer 探险日' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2027 届秋招 / 校招')).toBeInTheDocument()
    expect(screen.getByAltText('小动物结伴开启求职旅程')).toHaveAttribute(
      'src',
      '/assets/dashboard/hero-job-journey.webp',
    )

    expect(
      screen.getByRole('link', { name: /进入经历档案/ }),
    ).toHaveAttribute('href', '/experiences')
    expect(
      screen.getByRole('link', { name: /进入能力星图/ }),
    ).toHaveAttribute('href', '/capabilities')
    expect(
      screen.getByRole('link', { name: /进入岗位方向/ }),
    ).toHaveAttribute('href', '/role-directions')
    expect(
      screen.getByRole('link', { name: /进入 JD 实验室/ }),
    ).toHaveAttribute('href', '/jd-lab')
    expect(
      screen.getByRole('link', { name: /本地设置/ }),
    ).toHaveTextContent('DeepSeek API 与模型')
    expect(screen.queryByText('JSON 备份与DeepSeek配置')).not.toBeInTheDocument()
  })

  it('searches the four real destinations and can reset empty results', () => {
    renderPage()

    const search = screen.getByRole('searchbox', {
      name: '搜索看板入口',
    })
    fireEvent.change(search, { target: { value: '星图' } })

    expect(
      screen.getByRole('link', { name: /进入能力星图/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /进入经历档案/ }),
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '不存在的入口' } })
    expect(screen.getByText('没有找到匹配的入口')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))

    expect(search).toHaveValue('')
    expect(
      screen.getByRole('link', { name: /进入经历档案/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /进入 JD 实验室/ }),
    ).toBeInTheDocument()
  })

  it('routes evidence confirmation back to the editable experience workspace', async () => {
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

    renderPage()

    expect(
      await screen.findByRole('link', { name: '确认一条能力证据' }),
    ).toHaveAttribute('href', '/experiences')
  })

  it('loads local progress without revealing the saved API key', async () => {
    localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, 'do-not-render-this-secret')
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
    await db.claims.put({
      id: 'claim-1',
      experienceId: 'experience-1',
      kind: 'capability',
      label: '内容策略',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['span-1'],
    })
    await db.jdRecords.put({
      id: 'jd-1',
      company: '远山科技',
      role: '内容策略',
      jdText: '负责内容策略。',
      analysis: { score: 80 },
      updatedAt: '2026-07-27T10:00:00.000Z',
    })

    renderPage()

    const progressBars = await screen.findAllByRole('progressbar')
    expect(progressBars).toHaveLength(2)
    expect(
      progressBars.map((bar) => bar.getAttribute('aria-valuenow')),
    ).toEqual(['100', '65'])
    expect(
      screen.getByRole('link', { name: '还没有保存岗位方向' }),
    ).toHaveAttribute('href', '/role-directions')
    expect(screen.queryByText('do-not-render-this-secret')).not.toBeInTheDocument()
  })

  it('announces local data loading failures', async () => {
    await db.close()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地数据读取失败',
    )
  })

  it('distinguishes an empty local profile from a read failure', async () => {
    renderPage()

    expect(
      await screen.findByText('还没有准备记录，可以从经历档案开始补充。'),
    ).toBeInTheDocument()
  })

  it('stops waiting when the local database upgrade is blocked', async () => {
    render(
      <MemoryRouter>
        <DashboardPage
          countsLoader={() => new Promise(() => undefined)}
          storageTimeoutMs={20}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地数据库可能被旧标签页占用',
    )
    expect(
      screen.getByRole('button', { name: '重新读取本地进度' }),
    ).toBeInTheDocument()
  })
})
