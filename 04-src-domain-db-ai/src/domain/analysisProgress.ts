import type { AnalysisJob } from './analysisJobs'
import type { JdRecord } from './types'

export type AnalysisProgressState =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'

export interface AnalysisProgressItem {
  id: AnalysisJob['currentStage']
  label: string
  state: AnalysisProgressState
  errorCode?: string
  errorMessage?: string
}

const stages: Array<Pick<AnalysisProgressItem, 'id' | 'label'>> = [
  { id: 'jd-analysis', label: '正在解析 JD' },
  { id: 'company-research', label: '正在研究企业公开资料' },
  { id: 'resume-match', label: '正在匹配你的简历经历' },
  { id: 'interview-preparation', label: '正在生成面试准备' },
]

export function deriveAnalysisProgress(
  record: JdRecord,
  job?: AnalysisJob,
): AnalysisProgressItem[] {
  const terminalFailure =
    job && ['failed', 'timeout', 'cancelled'].includes(job.status)
      ? job.currentStage
      : undefined
  const completedAnalysis = record.analysisStatus === 'completed'

  return stages.map((stage) => {
    let state: AnalysisProgressState = 'pending'
    if (terminalFailure === stage.id) state = 'failed'
    else if (
      job?.status === 'running' &&
      job.currentStage === stage.id
    ) {
      state = 'active'
    } else if (
      completedAnalysis &&
      (stage.id === 'jd-analysis' || stage.id === 'resume-match')
    ) {
      state = 'completed'
    } else if (
      stage.id === 'company-research' &&
      Boolean(record.companyResearchId)
    ) {
      state = 'completed'
    } else if (
      stage.id === 'interview-preparation' &&
      Boolean(record.interviewPreparationId)
    ) {
      state = 'completed'
    }

    return {
      ...stage,
      state,
      ...(state === 'failed'
        ? {
            errorCode: job?.errorCode,
            errorMessage: job?.errorMessage,
          }
        : {}),
    }
  })
}
