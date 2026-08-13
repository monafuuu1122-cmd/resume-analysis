import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  experienceFingerprint,
  exportMigrationPackage,
  importMigrationPackage,
  migrateLegacyPayload,
} from '../src/db/localDataMigration'

const timestamp = '2026-07-29T08:00:00.000Z'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('local data migration', () => {
  it('normalizes experience fingerprints without collapsing distinct projects', () => {
    const left = experienceFingerprint({
      organization: ' 示例 公司 ',
      title: '内容 实习生',
      projectName: '品牌-A',
      startDate: '2025-01',
      endDate: '2025-03',
      normalizedText: '负责 内容 策划。',
    })
    const same = experienceFingerprint({
      organization: '示例公司',
      title: '内容实习生',
      projectName: '品牌 A',
      startDate: '2025-01',
      endDate: '2025-03',
      normalizedText: '负责内容策划',
    })
    const different = experienceFingerprint({
      organization: '示例公司',
      title: '内容实习生',
      projectName: '品牌 B',
      startDate: '2025-01',
      endDate: '2025-03',
      normalizedText: '负责内容策划',
    })
    expect(left).toBe(same)
    expect(left).not.toBe(different)
  })

  it('merges legacy records, recovers damaged data, and remains idempotent', async () => {
    await db.experiences.put({
      id: 'new-existing',
      organization: '北极星',
      role: '内容运营',
      project: '品牌 A',
      startDate: '2025-01',
      endDate: '2025-03',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const payload = {
      experiences: [
        {
          company: '北极星',
          title: '内容运营',
          projectName: '品牌 A',
          startDate: '2025-01',
          endDate: '2025-03',
        },
        {
          company: '远山科技',
          title: '活动策划',
          projectName: '校园活动',
          description: '独立协调供应商，活动到场 500 人。',
        },
        {
          organization: '海风工作室',
          role: '研究助理',
          rawContent: '整理行业资料并完成访谈纪要。',
        },
        { title: '缺少组织' },
      ],
    }

    const first = await migrateLegacyPayload(payload, 'legacy-test')
    const second = await migrateLegacyPayload(payload, 'legacy-test')

    expect(first).toMatchObject({
      migrated: 2,
      duplicates: 1,
      recovery: 1,
    })
    expect(second.migrated).toBe(0)
    expect(second.duplicates).toBe(3)
    expect(await db.experiences.count()).toBe(3)
    expect(await db.sourceArtifacts.count()).toBe(2)
    expect(await db.migrationRecoveryItems.count()).toBe(1)
    expect(await db.migrationSnapshots.count()).toBe(1)
  })

  it('exports and imports a versioned package without secrets', async () => {
    await db.experiences.put({
      id: 'experience-1',
      organization: '示例公司',
      role: '产品实习生',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const exported = await exportMigrationPackage(timestamp)
    expect(JSON.stringify(exported)).not.toContain('apiKey')

    await db.experiences.clear()
    const imported = await importMigrationPackage(exported)
    expect(imported.migrated).toBe(1)
    expect(await db.experiences.get('experience-1')).toBeDefined()
  })
})
