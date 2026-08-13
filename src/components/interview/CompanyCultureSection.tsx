import type { CompanyInsight, ResearchSource } from '../../domain/types'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

const topicLabels = { company: '企业业务', culture: '文化与价值观', talent: '人才画像' }
const evidenceLabels = {
  official: '官方信息',
  public: '公开信息',
  inference: '模型已有知识',
}

export default function CompanyCultureSection({
  insights,
  sources,
}: {
  insights: CompanyInsight[]
  sources: ResearchSource[]
}) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  return insights.length === 0 ? (
    <p className="interview-empty">现有知识不足，建议结合企业官网补充核对。</p>
  ) : (
    <div className="research-card-grid">
      {insights.map((insight) => (
        <article className="research-card" key={insight.id}>
          <div className="research-card-heading">
            <h4>{topicLabels[insight.topic]}</h4>
            <span className={`research-tag evidence-${insight.evidenceType}`}>
              {evidenceLabels[insight.evidenceType]}
            </span>
          </div>
          <p>{sanitizeVisibleAIText(insight.content)}</p>
          {insight.sourceIds.length > 0 && (
            <p className="research-source-note">
              来源：{insight.sourceIds.map((id) => sourceMap.get(id)?.title ?? id).join('、')}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
