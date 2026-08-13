import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'

import { parseBackup } from '../src/db/backup'
import { db } from '../src/db/database'
import { saveExperience } from '../src/db/repository'
import { validExperience } from './fixtures'

const validSourceArtifact = {
  id: 'source-artifact-1',
  experienceId: validExperience.id,
  title: '项目复盘',
  content: '负责梳理申请流程并推动改版。',
  createdAt: '2026-07-27T10:00:00.000Z',
}

const validJdRecord = {
  id: 'jd-record-1',
  company: '示例公司',
  role: '品牌实习生',
  jdText: '负责品牌内容策划与执行。',
  analysis: { fit: 'high' },
  updatedAt: '2026-07-27T10:00:00.000Z',
}

const validBackup = {
  version: 1 as const,
  exportedAt: '2026-07-27T10:00:00.000Z',
  experiences: [validExperience],
  sourceArtifacts: [validSourceArtifact],
  evidenceSpans: [],
  claims: [],
  jdRecords: [validJdRecord],
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('parses a supported backup with source artifacts and JD records', () => {
  expect(parseBackup(JSON.stringify(validBackup))).toEqual(validBackup)
})

it.each(['not json', '{"version":2}'])(
  'rejects malformed or unsupported backup data without changing stored data',
  async (text) => {
    await saveExperience(validExperience)

    expect(() => parseBackup(text)).toThrow('备份文件格式不受支持')
    expect(await db.experiences.toArray()).toEqual([validExperience])
  },
)

it.each(['id', 'experienceId', 'content'] as const)(
  'rejects a source artifact without %s',
  (field) => {
    const sourceArtifact = { ...validSourceArtifact }
    delete sourceArtifact[field]

    expect(() =>
      parseBackup(
        JSON.stringify({
          ...validBackup,
          sourceArtifacts: [sourceArtifact],
        }),
      ),
    ).toThrowError(/^备份文件格式不受支持$/)
  },
)

it.each(['company', 'role', 'jdText', 'updatedAt'] as const)(
  'rejects a JD record without %s',
  (field) => {
    const jdRecord = { ...validJdRecord }
    delete jdRecord[field]

    expect(() =>
      parseBackup(
        JSON.stringify({
          ...validBackup,
          jdRecords: [jdRecord],
        }),
      ),
    ).toThrowError(/^备份文件格式不受支持$/)
  },
)
