import type { AnalysisJob } from '../../domain/analysisJobs'
import { deriveAnalysisProgress } from '../../domain/analysisProgress'
import type { JdRecord } from '../../domain/types'

export default function AnalysisProgress({
  job,
  record,
}: {
  job?: AnalysisJob
  record: JdRecord
}) {
  const progress = deriveAnalysisProgress(record, job)
  const timedOut = job?.status === 'timeout'

  return (
    <section className="analysis-progress" aria-label="分析进度">
      <h2>分析任务</h2>
      <ol>
        {progress.map((item) => (
          <li data-state={item.state} key={item.id}>
            <span aria-hidden="true">
              {item.state === 'completed'
                ? '✓'
                : item.state === 'active'
                  ? '●'
                  : item.state === 'failed'
                    ? '!'
                    : '○'}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ol>
      {timedOut && (
        <p role="alert">
          本次生成等待时间过长，已自动停止。你可以重新尝试，已完成的内容不会丢失。
        </p>
      )}
    </section>
  )
}
