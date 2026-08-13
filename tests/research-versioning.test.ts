import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  activateInterviewResearchVersion,
  getInterviewResearchForRecord,
} from '../src/db/interviewRepository'
import type { InterviewResearch, JdRecord } from '../src/domain/types'

const timestamp = '2026-07-29T10:00:00.000Z'
const record: JdRecord = {
  id: 'analysis-1',
  company: '星河科技',
  role: '内容策略',
  jdText: '负责内容策略',
  activeJobId: 'job-1',
  inputHash: 'sha256:input',
  updatedAt: timestamp,
}
const research = (id: string): InterviewResearch => ({
  id,
  analysisId: record.id,
  jobId: 'job-1',
  companyName: record.company,
  companyIdentityHash: 'sha256:company',
  jdHash: 'sha256:jd',
  researchContextHash: 'sha256:context',
  researchStatus: 'no-reliable-info',
  identityStatus: 'unavailable',
  sources: [],
  companyInsights: [],
  competencies: [],
  interviewPriorities: [],
  predictedQuestions: [],
  preparationChecklist: [],
  createdAt: timestamp,
  updatedAt: timestamp,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.jdRecords.put(record)
})

it('selects the explicit research pointer instead of an unrelated newer version', async () => {
  await db.interviewResearch.bulkPut([
    research('research-current'),
    { ...research('research-newer'), updatedAt: '2026-07-29T11:00:00.000Z' },
  ])
  await db.jdRecords.update(record.id, {
    companyResearchId: 'research-current',
  })

  expect(
    (await getInterviewResearchForRecord(
      (await db.jdRecords.get(record.id))!,
    ))?.id,
  ).toBe('research-current')
})

it('archives a delayed version without replacing a pointer updated by another task', async () => {
  const first = await activateInterviewResearchVersion(
    research('research-first'),
    {
      expectedCurrentResearchId: undefined,
      jobId: 'job-1',
      inputHash: 'sha256:input',
    },
  )
  const delayed = await activateInterviewResearchVersion(
    research('research-delayed'),
    {
      expectedCurrentResearchId: undefined,
      jobId: 'job-1',
      inputHash: 'sha256:input',
    },
  )

  expect(first).toBe(true)
  expect(delayed).toBe(false)
  expect((await db.jdRecords.get(record.id))?.companyResearchId).toBe(
    'research-first',
  )
  expect(await db.interviewResearch.get('research-delayed')).toBeDefined()
})
