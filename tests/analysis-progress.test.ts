import { describe, expect, it } from 'vitest'

import { deriveAnalysisProgress } from '../src/domain/analysisProgress'

const record = {
  id: 'analysis-1',
  company: '星河科技',
  role: '内容策略',
  jdText: '负责内容策略',
  activeJobId: 'job-1',
  analysisStatus: 'analyzing' as const,
  updatedAt: '2026-07-29T10:00:00.000Z',
}

describe('analysis progress', () => {
  it('shows the durable active stage without pretending later work completed', () => {
    const progress = deriveAnalysisProgress(record, {
      id: 'job-1',
      analysisId: 'analysis-1',
      inputHash: 'sha256:input',
      status: 'running',
      currentStage: 'jd-analysis',
      attempt: 1,
      updatedAt: record.updatedAt,
    })

    expect(progress.map(({ state }) => state)).toEqual([
      'active',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('retains completed JD and match work when company research is pending', () => {
    const progress = deriveAnalysisProgress(
      { ...record, analysisStatus: 'completed', analysis: {} },
      {
        id: 'job-1',
        analysisId: 'analysis-1',
        inputHash: 'sha256:input',
        status: 'completed',
        currentStage: 'resume-match',
        attempt: 1,
        updatedAt: record.updatedAt,
      },
    )

    expect(progress.map(({ state }) => state)).toEqual([
      'completed',
      'pending',
      'completed',
      'pending',
    ])
  })

  it('marks only the timed-out stage as failed', () => {
    const progress = deriveAnalysisProgress(
      { ...record, analysisStatus: 'timeout' },
      {
        id: 'job-1',
        analysisId: 'analysis-1',
        inputHash: 'sha256:input',
        status: 'timeout',
        currentStage: 'jd-analysis',
        attempt: 1,
        errorCode: 'DEEPSEEK_TIMEOUT',
        errorMessage: '等待时间过长',
        updatedAt: record.updatedAt,
      },
    )

    expect(progress[0]).toMatchObject({
      state: 'failed',
      errorCode: 'DEEPSEEK_TIMEOUT',
    })
    expect(progress.slice(1).every(({ state }) => state === 'pending')).toBe(true)
  })
})
