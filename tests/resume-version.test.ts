import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  deleteResumeVersion,
  getResumeVersion,
  listResumeVersions,
  saveResumeVersion,
} from '../src/db/resumeVersionRepository'
import { db } from '../src/db/database'
import {
  defaultResumeVersionName,
  MAX_RESUME_PDF_BYTES,
  ResumePdfError,
  validateResumePdfFile,
} from '../src/services/pdf/extractPdfText'

const timestamp = '2026-08-17T08:00:00.000Z'

const version = {
  id: 'resume-version-1',
  name: '品牌营销版',
  source: 'pdf' as const,
  fileName: 'brand-resume.pdf',
  targetTags: ['品牌营销'],
  resumeText: '这是一份可用于岗位匹配的简历正文，包含具体项目和结果。',
  profileSnapshot: {
    claims: [],
    experiences: [],
    profileMaterials: [],
  },
  createdAt: timestamp,
  updatedAt: timestamp,
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('resume versions', () => {
  it('stores, lists and deletes a PDF resume version', async () => {
    await saveResumeVersion(version)
    expect(await getResumeVersion(version.id)).toMatchObject({ name: '品牌营销版' })
    expect((await listResumeVersions()).map(({ id }) => id)).toEqual([
      version.id,
    ])
    await deleteResumeVersion(version.id)
    expect(await getResumeVersion(version.id)).toBeUndefined()
  })

  it('validates PDF input and derives a readable default name', () => {
    expect(defaultResumeVersionName('品牌营销版.pdf')).toBe('品牌营销版')
    expect(() => validateResumePdfFile(new File(['text'], 'resume.txt'))).toThrow(
      ResumePdfError,
    )
    expect(() =>
      validateResumePdfFile(
        new File([new Uint8Array(MAX_RESUME_PDF_BYTES + 1)], 'resume.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).toThrow('不能超过 10 MB')
  })
})
