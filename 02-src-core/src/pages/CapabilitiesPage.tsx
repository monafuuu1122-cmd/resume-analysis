import { ChartPolar, Sparkle } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  buildCapabilitySummaries,
  normalizeClaimLabel,
  type CapabilitySummary,
} from '../domain/scoring'
import { useConfirmedEvidence } from '../hooks/useConfirmedEvidence'

const CAPABILITY_DEFINITIONS = [
  { id: 'professional', dimension: '专业能力', title: '内容策划与传播', radarTitle: '内容策划', keywords: ['内容', '传播', '用户', '研究', '品牌', '策划', '专业'] },
  { id: 'execution', dimension: '统筹执行', title: '项目统筹与交付', radarTitle: '项目交付', keywords: ['项目', '推进', '执行', '流程', '现场', '协调', '落地', '交付'] },
  { id: 'strategy', dimension: '策略思考', title: '品牌策略与业务判断', radarTitle: '策略判断', keywords: ['策略', '规划', '定位', '洞察', '方案', '判断'] },
  { id: 'ai', dimension: 'AI 应用', title: 'AI 工作流与创意提效', radarTitle: 'AI 应用', keywords: ['AI', '大模型', '提示词', '自动化', '工作流', '智能'] },
  { id: 'data', dimension: '数据与复盘', title: '传播数据与效果复盘', radarTitle: '数据复盘', keywords: ['数据', '指标', '分析', '复盘', '转化', '增长', '结果'] },
  { id: 'collaboration', dimension: '沟通协作', title: '跨团队沟通与资源协同', radarTitle: '沟通协作', keywords: ['沟通', '协作', '跨团队', '跨部门', '对接', '资源'] },
] as const

type CapabilityModel = (typeof CAPABILITY_DEFINITIONS)[number] & {
  items: CapabilitySummary[]
  evidenceCount: number
  experienceCount: number
  strength: number
}

function matchesSummary(summary: CapabilitySummary, definition: (typeof CAPABILITY_DEFINITIONS)[number]) {
  if (definition.id === 'ai' && summary.kind === 'ai') return true
  const text = `${summary.label} ${summary.kind}`.toLocaleLowerCase('zh-CN')
  return definition.keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase('zh-CN')))
}

function buildCapabilityModels(summaries: CapabilitySummary[]): CapabilityModel[] {
  return CAPABILITY_DEFINITIONS.map((definition) => {
    const items = summaries.filter((summary) => matchesSummary(summary, definition))
    const experienceIds = new Set(items.flatMap((item) => item.experienceIds))
    const evidenceCount = items.reduce((total, item) => total + item.evidenceCount, 0)
    const strength = items.length
      ? Math.min(100, 18 + evidenceCount * 9 + experienceIds.size * 13)
      : 0
    return { ...definition, items, evidenceCount, experienceCount: experienceIds.size, strength }
  })
}

function strengthLabel(value: number) {
  if (value >= 75) return '证据扎实'
  if (value >= 45) return '已有基础'
  if (value > 0) return '需要补证据'
  return '待建立'
}

function polarPoint(index: number, value: number, radius = 110) {
  const angle = -Math.PI / 2 + (index / CAPABILITY_DEFINITIONS.length) * Math.PI * 2
  const rawLabelX = 165 + Math.cos(angle) * 140
  return {
    x: 165 + Math.cos(angle) * radius * value,
    y: 165 + Math.sin(angle) * radius * value,
    labelX: Math.max(78, Math.min(252, rawLabelX)),
    labelY: 165 + Math.sin(angle) * 140,
  }
}

function RadarOverview({ models }: { models: CapabilityModel[] }) {
  const rings = [0.33, 0.66, 1]
  const gridPoints = (scale: number) =>
    models.map((_, index) => {
      const point = polarPoint(index, scale)
      return `${point.x},${point.y}`
    }).join(' ')
  const values = models.map((model) => Math.max(0.08, model.strength / 100))
  const valuePoints = values.map((value, index) => {
    const point = polarPoint(index, value)
    return `${point.x},${point.y}`
  }).join(' ')

  return (
    <div className="radar-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">六维总览</span><h2>能力雷达</h2></div>
        <ChartPolar aria-hidden="true" size={30} weight="duotone" />
      </div>
      <svg className="radar-chart" viewBox="0 0 330 330" role="img" aria-label="六项能力雷达总览">
        {rings.map((scale) => <polygon className="radar-ring" key={scale} points={gridPoints(scale)} />)}
        {models.map((_, index) => {
          const point = polarPoint(index, 1)
          return <line className="radar-axis" key={`axis-${index}`} x1="165" y1="165" x2={point.x} y2={point.y} />
        })}
        <polygon className="radar-value" points={valuePoints} />
        {models.map((model, index) => {
          const point = polarPoint(index, 1)
          return (
            <g key={model.id}>
              <circle className="radar-dot" cx={polarPoint(index, values[index]).x} cy={polarPoint(index, values[index]).y} r="5" />
              <text className="radar-label" x={point.labelX} y={point.labelY} textAnchor={point.labelX < 155 ? 'end' : point.labelX > 175 ? 'start' : 'middle'}>{model.radarTitle}</text>
            </g>
          )
        })}
      </svg>
      <p className="radar-note">点位越靠外，说明已有证据覆盖越充分。</p>
    </div>
  )
}

export default function CapabilitiesPage() {
  const { error, loading, snapshot } = useConfirmedEvidence()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const summaries = useMemo(
    () => buildCapabilitySummaries(snapshot?.claims ?? [], snapshot?.profileMaterials ?? []),
    [snapshot],
  )
  const models = useMemo(() => buildCapabilityModels(summaries), [summaries])
  const assetSummaries = summaries.filter((summary) => summary.kind !== 'capability')
  const evidenceSummaries = useMemo(() => {
    const seen = new Set<string>()
    return summaries.filter((summary) => {
      const key = `${summary.kind}:${normalizeClaimLabel(summary.label)}`
      if (seen.has(key)) return false
      seen.add(key)
      return summary.kind === 'capability'
    })
  }, [summaries])

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className="page capabilities-page" aria-labelledby="capabilities-title">
      <div className="page-kicker"><Sparkle aria-hidden="true" size={20} weight="duotone" /> 从经历里长出来的能力资产</div>
      <h1 id="capabilities-title">能力星图</h1>
      <p className="page-intro">只使用你亲自确认过的经历证据，把能力、工具和语言放在同一张可读的地图上。</p>

      {loading && <p role="status">正在读取已确认的能力证据…</p>}
      {error && <p role="alert">本地存储失败：{error}</p>}
      {!loading && !error && summaries.length === 0 && (
        <div className="empty-state">
          <h2>还没有已确认的能力证据</h2>
          <p>先记录一段经历并确认提炼结果，能力星图才会出现。</p>
          <Link className="text-link" to="/experiences">去补充经历</Link>
        </div>
      )}

      {!loading && !error && summaries.length > 0 && (
        <>
          <div className="capability-overview">
            <section className="energy-panel" aria-labelledby="energy-title">
              <div className="panel-heading">
                <div><span className="eyebrow">主视图</span><h2 id="energy-title">六位能力能量条</h2></div>
                <span className="hand-note">证据越多，能量越满</span>
              </div>
              <div className="energy-list">
                {models.map((model) => (
                  <article className="energy-row" key={model.id}>
                    <div className="energy-row-top"><div><span className="dimension-label">{model.dimension}</span><h3>{model.title}</h3></div><strong>{model.strength}%</strong></div>
                    <div className="energy-meter" role="progressbar" aria-label={`${model.dimension}证据强度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.strength}><span style={{ width: `${model.strength}%` }} /></div>
                    <div className="energy-meta"><span>{strengthLabel(model.strength)}</span><span>{model.evidenceCount} 条证据 · {model.experienceCount} 段经历</span></div>
                  </article>
                ))}
              </div>
            </section>
            <RadarOverview models={models} />
          </div>

          <section className="capability-evidence-section" aria-labelledby="evidence-map-title">
            <div className="section-heading-row"><div><span className="eyebrow">可追溯证据</span><h2 id="evidence-map-title">能力证据清单</h2></div><Link className="text-link" to="/experiences">去补充经历 →</Link></div>
            <div className="insight-grid">
              {evidenceSummaries.map((summary, index) => (
                <CapabilityCard key={`${summary.kind}:${normalizeClaimLabel(summary.label)}`} expanded={expanded.has(`capability:${index}`)} onToggle={() => toggle(`capability:${index}`)} snapshot={snapshot!} summary={summary} />
              ))}
            </div>
          </section>

          <AssetSection title="工具与语言资产" summaries={assetSummaries} expanded={expanded} onToggle={toggle} snapshot={snapshot!} />
        </>
      )}
    </section>
  )
}

function AssetSection({
  title,
  summaries,
  expanded,
  onToggle,
  snapshot,
}: {
  title: string
  summaries: CapabilitySummary[]
  expanded: Set<string>
  onToggle: (key: string) => void
  snapshot: NonNullable<ReturnType<typeof useConfirmedEvidence>['snapshot']>
}) {
  const groups = [
    { kind: 'tool', title: '工具' },
    { kind: 'language', title: '语言能力' },
    { kind: 'ai', title: 'AI 应用资料' },
    { kind: 'certificate', title: '证书与考试' },
  ] as const
  return (
    <section className="asset-section" aria-labelledby="asset-title">
      <div className="section-heading-row"><div><span className="eyebrow">独立资料</span><h2 id="asset-title">{title}</h2></div><span className="hand-note">与经历能力分开统计</span></div>
      {groups.map((group) => {
        const items = summaries.filter((summary) => summary.kind === group.kind)
        return (
          <section className="asset-group" key={group.kind} aria-labelledby={`asset-${group.kind}`}>
            <h3 id={`asset-${group.kind}`}>{group.title}</h3>
            {items.length === 0 ? <p className="muted-copy">暂无已确认条目</p> : <div className="asset-grid">{items.map((summary, index) => <CapabilityCard key={`${summary.kind}:${normalizeClaimLabel(summary.label)}`} expanded={expanded.has(`${group.kind}:${index}`)} onToggle={() => onToggle(`${group.kind}:${index}`)} snapshot={snapshot} summary={summary} />)}</div>}
          </section>
        )
      })}
    </section>
  )
}

interface CapabilityCardProps {
  expanded: boolean
  onToggle: () => void
  snapshot: NonNullable<ReturnType<typeof useConfirmedEvidence>['snapshot']>
  summary: CapabilitySummary
}

function CapabilityCard({ expanded, onToggle, snapshot, summary }: CapabilityCardProps) {
  const evidenceId = `capability-evidence-${summary.kind}-${normalizeClaimLabel(summary.label)}`
  const spanById = new Map(snapshot.evidenceSpans.map((span) => [span.id, span]))
  const experienceById = new Map(snapshot.experiences.map((experience) => [experience.id, experience]))
  const materialById = new Map((snapshot.profileMaterials ?? []).map((material) => [material.id, material]))

  return (
    <article className="insight-card capability-evidence-card">
      <div className="insight-card-heading"><div><h3>{summary.label}</h3><p>{summary.evidenceCount} 条证据 · {summary.experienceCount} 段经历</p></div><button aria-label={expanded ? `收起“${summary.label}”的证据` : `展开“${summary.label}”的证据`} aria-controls={evidenceId} aria-expanded={expanded} className="pill-button" onClick={onToggle} type="button">{expanded ? '收起' : '查看证据'}</button></div>
      {expanded && <div className="evidence-cards" id={evidenceId}>
        {summary.evidenceSpanIds.map((spanId) => {
          const span = spanById.get(spanId)
          const sourceClaim = snapshot.claims.find((claim) => claim.kind === summary.kind && normalizeClaimLabel(claim.label) === normalizeClaimLabel(summary.label) && claim.evidenceSpanIds.includes(spanId)) ?? snapshot.claims.find((claim) => claim.evidenceSpanIds.includes(spanId))
          const experience = sourceClaim ? experienceById.get(sourceClaim.experienceId) : undefined
          return span ? <blockquote className="evidence-card" key={spanId}><p>{span.quote}</p><cite>{experience ? `${experience.organization} · ${experience.role}` : '来源经历已缺失'}</cite></blockquote> : <p className="evidence-card" key={spanId}>证据原文已缺失</p>
        })}
        {summary.profileMaterialIds.map((materialId) => {
          const material = materialById.get(materialId)
          return material ? <div className="evidence-card" key={materialId}><p>{material.detail}</p><cite>独立资料{material.proficiency ? ` · ${material.proficiency}` : ''}</cite></div> : null
        })}
      </div>}
    </article>
  )
}
