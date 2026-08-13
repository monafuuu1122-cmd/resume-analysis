import type { ConfirmedEvidenceSnapshot } from '../db/evidenceRepository'

export type ExperienceEvidenceType =
  | 'responsibility'
  | 'action'
  | 'result'
  | 'skill'
  | 'method'
  | 'collaboration'
  | 'leadership'
  | 'insight'
  | 'interest'
  | 'domain-knowledge'

export interface ExperienceEvidenceUnit {
  id: string
  experienceId?: string
  claimId?: string
  sourceLabel: string
  organization?: string
  role?: string
  project?: string
  evidenceType: ExperienceEvidenceType
  originalText: string
  normalizedDescription: string
  capabilities: string[]
  domains: string[]
  tools: string[]
  stakeholders: string[]
  measurableResult?: string
  personalContribution?: string
  confidence: 'high' | 'medium' | 'low'
}

const unique = (items: string[]) => [...new Set(items)]

const compactLabel = (value: string, maxLength = 48) => {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  const firstClause = normalized.split(/[。！？；\n]/u)[0]?.trim() || normalized
  return firstClause.length > maxLength
    ? `${firstClause.slice(0, maxLength).trimEnd()}…`
    : firstClause
}

function inferAssets(text: string) {
  const capabilities: string[] = []
  const domains: string[] = []
  const tools: string[] = []
  const stakeholders: string[] = []
  const addWhen = (
    pattern: RegExp,
    values: string[],
    target: string[],
  ) => {
    if (pattern.test(text)) target.push(...values)
  }

  addWhen(/脚本|文案|内容|选题/u, ['内容适配', '内容策划'], capabilities)
  addWhen(/传播|宣传|媒介|社媒/u, ['传播执行'], capabilities)
  addWhen(/流程|测试|预案|现场/u, ['流程设计', '风险排查', '现场执行'], capabilities)
  addWhen(/协调|协作|对接|跨部门/u, ['跨团队协作'], capabilities)
  addWhen(/研究|调研|资料|访谈/u, ['研究与信息归纳'], capabilities)
  addWhen(/数据|指标|复盘|转化/u, ['数据分析与复盘'], capabilities)
  addWhen(/策略|规划|定位/u, ['策略思考与规划'], capabilities)
  addWhen(/品牌/u, ['品牌'], domains)
  addWhen(/传播|宣传|媒介|脚本|文案/u, ['传播'], domains)
  addWhen(/活动|现场|展馆|赛事/u, ['活动'], domains)
  addWhen(/用户|社群|会员/u, ['用户运营'], domains)
  addWhen(/AI|人工智能|大模型|提示词/iu, ['AI 应用'], domains)
  addWhen(/Excel|飞书|Figma|SQL|Python|剪映/iu, text.match(/Excel|飞书|Figma|SQL|Python|剪映/giu) ?? [], tools)
  addWhen(/客户|供应商|销售|产品|设计|研发|员工|用户/u, text.match(/客户|供应商|销售|产品|设计|研发|员工|用户/gu) ?? [], stakeholders)

  return {
    capabilities: unique(capabilities),
    domains: unique(domains),
    tools: unique(tools),
    stakeholders: unique(stakeholders),
  }
}

function claimEvidenceType(
  kind: ConfirmedEvidenceSnapshot['claims'][number]['kind'],
): ExperienceEvidenceType {
  if (kind === 'responsibility' || kind === 'action' || kind === 'result') {
    return kind
  }
  if (kind === 'capability' || kind === 'tool' || kind === 'ai' || kind === 'certificate') {
    return 'skill'
  }
  return 'skill'
}

export function buildCareerEvidenceUnits(
  snapshot: ConfirmedEvidenceSnapshot,
): ExperienceEvidenceUnit[] {
  const spans = new Map(
    snapshot.evidenceSpans.map((span) => [span.id, span]),
  )
  const experiences = new Map(
    snapshot.experiences.map((experience) => [experience.id, experience]),
  )
  const units: ExperienceEvidenceUnit[] = []

  snapshot.claims.forEach((claim) => {
    const experience = experiences.get(claim.experienceId)
    claim.evidenceSpanIds.forEach((spanId) => {
      const span = spans.get(spanId)
      if (!span) return
      const combined = [
        span.quote,
        claim.label,
        claim.detail,
        experience?.organization,
        experience?.role,
        experience?.project,
      ]
        .filter(Boolean)
        .join(' ')
      const assets = inferAssets(combined)
      units.push({
        id: `${claim.id}:${span.id}`,
        claimId: claim.id,
        experienceId: claim.experienceId,
        sourceLabel: [
          compactLabel(experience?.project || experience?.organization || '', 40),
          compactLabel(claim.label, 40),
        ]
          .filter(Boolean)
          .join(' · '),
        organization: experience?.organization,
        role: experience?.role,
        project: experience?.project,
        evidenceType: claimEvidenceType(claim.kind),
        originalText: span.quote,
        normalizedDescription: [claim.label, claim.detail]
          .filter(Boolean)
          .join('：'),
        ...assets,
        measurableResult:
          claim.kind === 'result' ? span.quote : undefined,
        personalContribution:
          claim.kind === 'action' || claim.kind === 'responsibility'
            ? span.quote
            : undefined,
        confidence: 'high',
      })
    })
  })

  ;(snapshot.profileMaterials ?? []).forEach((material) => {
    const originalText = `${material.title}：${material.detail}${
      material.proficiency ? `（${material.proficiency}）` : ''
    }`
    const assets = inferAssets(originalText)
    units.push({
      id: `profile-material:${material.id}`,
      sourceLabel: material.title,
      evidenceType: 'skill',
      originalText,
      normalizedDescription: originalText,
      ...assets,
      confidence: 'high',
    })
  })

  return units.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'))
}
