import type { InterviewPriority } from '../../domain/types'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

const labels = { high: '高优先级', medium: '中优先级', low: '低优先级' }

export default function InterviewPriorityList({ items }: { items: InterviewPriority[] }) {
  return items.length === 0 ? (
    <p className="interview-empty">暂无重点准备建议。</p>
  ) : (
    <ol className="research-list">
      {items.map((item) => (
        <li key={item.id}>
          <div><strong>{sanitizeVisibleAIText(item.title)}</strong><span className={`research-tag priority-${item.priority}`}>{labels[item.priority]}</span></div>
          <p>{sanitizeVisibleAIText(item.rationale)}</p>
          {item.evidenceClaimIds.length === 0 && <small>缺少个人经历证据，请准备可核实案例。</small>}
        </li>
      ))}
    </ol>
  )
}
