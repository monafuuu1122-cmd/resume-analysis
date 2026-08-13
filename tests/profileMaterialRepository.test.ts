import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  deleteProfileMaterial,
  listProfileMaterials,
  saveProfileMaterial,
} from '../src/db/profileMaterialRepository'
import type { ProfileMaterial } from '../src/domain/types'

const timestamp = '2026-07-28T10:00:00.000Z'

function material(
  id: string,
  type: ProfileMaterial['type'],
  title: string,
  proficiency?: string,
): ProfileMaterial {
  return {
    id,
    type,
    title,
    detail: `${title}详情`,
    ...(proficiency ? { proficiency } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('profile material repository', () => {
  it('saves and lists all independent profile material types', async () => {
    const records = [
      material('certificate-1', 'certificate', '英语六级'),
      material('ai-1', 'ai_application', 'AI 辅助用户访谈'),
      material('tool-1', 'skill_tool', 'Figma', '熟练'),
      material('language-1', 'language', '英语', 'CET-6 / 熟练'),
    ]

    for (const record of records) {
      await saveProfileMaterial(record)
    }

    expect(await listProfileMaterials()).toEqual(records)
  })

  it.each(['title', 'detail'] as const)(
    'rejects a profile material without required %s',
    async (field) => {
      const record = material('invalid-1', 'certificate', '证书')
      record[field] = ' '

      await expect(saveProfileMaterial(record)).rejects.toThrow()
      expect(await db.profileMaterials.count()).toBe(0)
    },
  )

  it('deletes a profile material without affecting the others', async () => {
    const removed = material('certificate-1', 'certificate', '英语六级')
    const kept = material('language-1', 'language', '英语', '熟练')
    await saveProfileMaterial(removed)
    await saveProfileMaterial(kept)

    await deleteProfileMaterial(removed.id)

    expect(await listProfileMaterials()).toEqual([kept])
  })
})
