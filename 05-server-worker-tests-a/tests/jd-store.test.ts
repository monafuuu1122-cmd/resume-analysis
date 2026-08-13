import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import { createJdStore } from '../src/stores/jdStore'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('loads a legacy record without binding its id to a future submission', async () => {
  const legacy = {
    id: 'legacy-jd',
    company: '旧公司',
    role: '旧岗位',
    jdText: '旧 JD 原文',
    analysis: { legacy: true },
    updatedAt: '2026-07-27T10:00:00.000Z',
  }
  await db.jdRecords.put(legacy)
  const store = createJdStore()

  await store.getState().loadRecords()
  await store.getState().selectRecord(legacy.id)

  expect(store.getState().draft).toMatchObject({
    company: legacy.company,
    role: legacy.role,
    jdText: legacy.jdText,
  })
  expect(store.getState().draft).not.toHaveProperty('id')
  expect(store.getState().selectedRecord).toEqual(legacy)
})

it('adds, selects and deletes one company target without affecting the others', async () => {
  const store = createJdStore()
  await store.getState().loadCompanyTargets()

  const first = await store.getState().addCompanyTarget({
    name: '星河科技',
    website: 'https://example.com',
    industry: '互联网',
  })
  const second = await store.getState().addCompanyTarget({
    name: '远山集团',
  })

  store.getState().selectCompanyTarget(first.id)
  expect(store.getState().draft).toMatchObject({
    company: '星河科技',
    companyWebsite: 'https://example.com',
    companyIndustry: '互联网',
    selectedCompanyTargetId: first.id,
  })

  await store.getState().deleteCompanyTarget(second.id)
  expect(store.getState().companyTargets.map(({ name }) => name)).toEqual([
    '星河科技',
  ])
})

it('rejects invalid company input and exposes load failures', async () => {
  const store = createJdStore()

  await expect(
    store.getState().addCompanyTarget({
      name: '星河科技',
      website: 'not-a-url',
    }),
  ).rejects.toThrow('企业官网格式不正确')
  expect(await db.companyTargets.count()).toBe(0)

  vi.spyOn(db.companyTargets, 'orderBy').mockImplementationOnce(() => {
    throw new Error('企业数据读取失败')
  })
  await store.getState().loadCompanyTargets()
  expect(store.getState().companyTargetState).toBe('failed')
  expect(store.getState().companyTargetError).toContain('企业数据读取失败')
})

it('binds a selected company to an old JD without re-running analysis', async () => {
  await db.jdRecords.put({
    id: 'old-analysis',
    company: '待补充',
    role: '内容策略',
    jdText: '负责内容策略',
    analysisStatus: 'completed',
    analysis: { company: '待补充', role: '内容策略' },
    updatedAt: '2026-07-27T10:00:00.000Z',
  })
  const store = createJdStore()
  await store.getState().loadRecords()
  await store.getState().selectRecord('old-analysis')
  const company = await store.getState().addCompanyTarget({
    name: '星河科技',
    website: 'https://example.com',
  })

  await store.getState().applySelectedCompanyToRecord()

  expect(await db.jdRecords.get('old-analysis')).toMatchObject({
    company: '星河科技',
    companyWebsite: 'https://example.com',
    companyTargetId: company.id,
    analysis: { company: '星河科技', role: '内容策略' },
  })
})

it('deletes only the selected analysis and its jobs', async () => {
  const records = ['analysis-1', 'analysis-2'].map((id) => ({
    id,
    company: '星河科技',
    role: id,
    jdText: `JD ${id}`,
    updatedAt: '2026-07-27T10:00:00.000Z',
  }))
  await db.jdRecords.bulkPut(records)
  await db.analysisJobs.bulkPut(
    records.map((record) => ({
      id: `job-${record.id}`,
      analysisId: record.id,
      inputHash: 'sha256:input',
      status: 'completed' as const,
      currentStage: 'jd-analysis' as const,
      attempt: 1,
      updatedAt: '2026-07-27T10:00:00.000Z',
    })),
  )
  const store = createJdStore()
  await store.getState().loadRecords()

  await store.getState().deleteRecord('analysis-1')

  expect((await db.jdRecords.toArray()).map(({ id }) => id)).toEqual([
    'analysis-2',
  ])
  expect((await db.analysisJobs.toArray()).map(({ analysisId }) => analysisId))
    .toEqual(['analysis-2'])
})
