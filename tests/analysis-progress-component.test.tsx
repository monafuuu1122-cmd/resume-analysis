import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import AnalysisProgress from '../src/components/jd/AnalysisProgress'

it('renders clear progress and timeout recovery copy', () => {
  render(
    <AnalysisProgress
      job={{
        id: 'job-1',
        analysisId: 'analysis-1',
        inputHash: 'sha256:input',
        status: 'timeout',
        currentStage: 'jd-analysis',
        attempt: 1,
        errorCode: 'DEEPSEEK_TIMEOUT',
        updatedAt: '2026-07-29T10:00:00.000Z',
      }}
      record={{
        id: 'analysis-1',
        company: '星河科技',
        role: '内容策略',
        jdText: '负责内容策略',
        activeJobId: 'job-1',
        analysisStatus: 'timeout',
        updatedAt: '2026-07-29T10:00:00.000Z',
      }}
    />,
  )

  expect(screen.getByText('正在解析 JD')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    '本次生成等待时间过长，已自动停止',
  )
})
