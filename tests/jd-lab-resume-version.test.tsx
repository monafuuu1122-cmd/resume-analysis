import 'fake-indexeddb/auto'

import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import JdLabPage from '../src/pages/JdLabPage'

const timestamp = '2026-08-17T08:00:00.000Z'

beforeEach(async () => {
  await db.delete()
  await db.open()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          company: '星河科技',
          role: '品牌内容策略',
          department: '品牌部',
          location: '上海',
          level: '实习生',
          businessKeywords: ['内容'],
          matchScore: 60,
          evidenceCoverage: '待补充',
          strengths: [],
          gaps: [{ title: '证据', explanation: '待补充' }],
          resumeRewrites: [],
          interviewDimensions: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  )
  await db.resumeVersions.put({
    id: 'resume-version-1',
    name: '品牌营销版',
    source: 'pdf',
    fileName: 'brand.pdf',
    targetTags: [],
    resumeText: '品牌营销版简历正文，包含项目行动和结果。',
    profileSnapshot: { claims: [], experiences: [], profileMaterials: [] },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.delete()
})

it('uses the selected archived resume text and binds it to the JD record', async () => {
  render(<JdLabPage />)
  const fetchMock = vi.mocked(fetch)
  const resumeSelect = await screen.findByLabelText('选择简历版本')
  await waitFor(() => expect(resumeSelect).toHaveValue(''))
  fireEvent.change(resumeSelect, { target: { value: 'resume-version-1' } })
  fireEvent.change(screen.getByLabelText('企业名称'), {
    target: { value: '星河科技' },
  })
  fireEvent.click(screen.getByRole('button', { name: '添加企业' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '选择企业 星河科技' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  )
  fireEvent.change(screen.getByLabelText('岗位名称'), {
    target: { value: '品牌内容策略' },
  })
  fireEvent.change(screen.getByLabelText('完整 JD'), {
    target: { value: '负责品牌内容策略' },
  })
  fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

  await waitFor(async () => {
    const record = (await db.jdRecords.toArray())[0]
    expect(record).toMatchObject({
      resumeVersionId: 'resume-version-1',
      resumeVersionName: '品牌营销版',
      analysisStatus: 'completed',
    })
  })
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
  expect(body.profileContext.resumeText).toContain('品牌营销版简历正文')
})
