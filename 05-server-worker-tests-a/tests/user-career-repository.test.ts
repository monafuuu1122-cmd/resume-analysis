import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import { userCareerRepository } from '../src/db/userCareerRepository'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

describe('userCareerRepository', () => {
  it('returns an explicit empty snapshot', async () => {
    const snapshot = await userCareerRepository.getSnapshot()

    expect(snapshot.sourceStatus).toBe('empty')
    expect(snapshot.moduleStatus).toMatchObject({
      profile: 'ready',
      targeting: 'ready',
      interviews: 'ready',
    })
    expect(snapshot.counts.experienceCount).toBe(0)
  })

  it('keeps usable progress when one module fails', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '远山科技',
      role: '内容运营',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    })
    vi.spyOn(db.interviewResearch, 'count').mockRejectedValueOnce(
      new Error('broken interview table'),
    )

    const snapshot = await userCareerRepository.getSnapshot()

    expect(snapshot.sourceStatus).toBe('partial')
    expect(snapshot.moduleStatus.interviews).toBe('failed')
    expect(snapshot.counts.experienceCount).toBe(1)
  })
})
