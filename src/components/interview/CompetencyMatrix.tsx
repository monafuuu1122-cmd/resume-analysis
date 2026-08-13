import type { CompetencyItem } from '../../domain/types'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

const priorityLabels = { high: '高', medium: '中', low: '低' }
const assessmentLabels = { match: '有证据匹配', gap: '证据不足', unknown: '待核实' }

export default function CompetencyMatrix({ items }: { items: CompetencyItem[] }) {
  return items.length === 0 ? (
    <p className="interview-empty">暂无可拆解的岗位能力。</p>
  ) : (
    <div className="competency-table-wrap">
      <table className="competency-table">
        <thead><tr><th>能力</th><th>岗位要求</th><th>优先级</th><th>当前判断</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <th scope="row">{sanitizeVisibleAIText(item.competency)}</th>
              <td>{sanitizeVisibleAIText(item.requirement)}</td>
              <td><span className={`research-tag priority-${item.priority}`}>{priorityLabels[item.priority]}</span></td>
              <td><span className={`research-tag assessment-${item.assessment}`}>{assessmentLabels[item.assessment]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
