import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  getJdRecord,
  listJdRecords,
  saveJdRecord,
} from '../src/db/jdRepository'
import { listExperiences, saveExperience } from '../src/db/repository'
import { validExperience } from './fixtures'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('persists an experience after reopening the database', async () => {
  await saveExperience(validExperience)

  db.close()
  await db.open()

  expect(await listExperiences()).toEqual([validExperience])
})

it('lists experiences with the newest update first', async () => {
  const olderExperience = {
    ...validExperience,
    id: 'experience-older',
    updatedAt: '2026-07-26T10:00:00.000Z',
  }
  const newerExperience = {
    ...validExperience,
    id: 'experience-newer',
    updatedAt: '2026-07-28T10:00:00.000Z',
  }

  await saveExperience(olderExperience)
  await saveExperience(newerExperience)

  expect((await listExperiences()).map(({ id }) => id)).toEqual([
    'experience-newer',
    'experience-older',
  ])
})

it('persists JD records and returns the newest update first', async () => {
  const oldRecord = {
    id: 'jd-old',
    company: '旧公司',
    role: '旧岗位',
    jdText: '旧 JD',
    analysis: { legacy: true },
    updatedAt: '2026-07-27T10:00:00.000Z',
  }
  const newRecord = {
    id: 'jd-new',
    company: '新公司',
    role: '新岗位',
    jdText: '新 JD',
    updatedAt: '2026-07-28T10:00:00.000Z',
  }

  await saveJdRecord(oldRecord)
  await saveJdRecord(newRecord)

  expect(await getJdRecord(oldRecord.id)).toEqual(oldRecord)
  expect((await listJdRecords()).map(({ id }) => id)).toEqual([
    'jd-new',
    'jd-old',
  ])
})
