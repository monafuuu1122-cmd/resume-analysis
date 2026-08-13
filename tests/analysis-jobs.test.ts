import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  createAnalysisJob,
  getAnalysisJob,
  listAnalysisJobs,
  updateAnalysisJob,
} from '../src/db/analysisJobRepository'
import { createAnalysisInputHash } from '../src/domain/analysisJobs'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('durable analysis jobs', () => {
  it('creates independently identified jobs for identical inputs', async () => {
    const input = {
      company: '星河科技',
      role: '内容策略',
      jdText: '负责内容策略与数据复盘',
      profileSnapshot: { claims: [], profileMaterials: [] },
    }
    const inputHash = await createAnalysisInputHash(input)
    const first = await createAnalysisJob({
      analysisId: 'analysis-1',
      inputHash,
    })
    const second = await createAnalysisJob({
      analysisId: 'analysis-2',
      inputHash,
    })

    expect(first.id).not.toBe(second.id)
    expect(first.inputHash).toBe(second.inputHash)
    expect(await listAnalysisJobs('analysis-1')).toEqual([first])
  })

  it('rejects writes through the wrong analysis owner and persists timeout', async () => {
    const job = await createAnalysisJob({
      analysisId: 'analysis-1',
      inputHash: 'sha256:input',
    })

    await expect(
      updateAnalysisJob(job.id, 'analysis-other', {
        status: 'completed',
      }),
    ).rejects.toThrow('分析任务与记录不匹配')

    const timedOut = await updateAnalysisJob(job.id, 'analysis-1', {
      status: 'timeout',
      currentStage: 'jd-analysis',
      errorCode: 'DEEPSEEK_TIMEOUT',
      errorMessage: '请求等待时间过长',
    })
    expect(timedOut.status).toBe('timeout')
    expect((await getAnalysisJob(job.id))?.errorCode).toBe('DEEPSEEK_TIMEOUT')
  })
})
