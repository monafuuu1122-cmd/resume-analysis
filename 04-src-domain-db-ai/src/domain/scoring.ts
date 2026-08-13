import type { ExtractedClaim, ProfileMaterial } from './types'

export type CapabilityKind =
  | 'capability'
  | 'tool'
  | 'ai'
  | 'certificate'
  | 'language'

export interface CapabilitySummary {
  label: string
  kind: CapabilityKind
  evidenceSpanIds: string[]
  experienceIds: string[]
  profileMaterialIds: string[]
  evidenceCount: number
  experienceCount: number
}

const MARKET_CAPABILITIES = [
  {
    label: '策略思考与规划',
    keywords: ['策略', '规划', '定位', '方案设计', '业务判断'],
  },
  {
    label: '用户洞察与研究',
    keywords: ['用户洞察', '用户研究', '访谈', '调研', '需求洞察'],
  },
  {
    label: '内容策划与传播',
    keywords: ['内容', '选题', '文案', '传播', '社媒', '账号运营'],
  },
  {
    label: '数据分析与复盘',
    keywords: ['数据', '指标', '分析', '复盘', '转化率', '增长率'],
  },
  {
    label: '项目推进与执行',
    keywords: ['项目', '推动', '推进', '落地', '执行', '上线', '交付', '协调'],
  },
  {
    label: '跨团队沟通协作',
    keywords: ['跨团队', '跨部门', '协作', '沟通', '对接', '资源整合'],
  },
  {
    label: '问题解决与流程优化',
    keywords: ['问题解决', '优化', '流程', '效率', '阻力', '改进'],
  },
] as const

export const ROLE_TAXONOMY = [
  {
    direction: '品牌策划 / 品牌营销',
    keywords: ['品牌策略', '内容策划', '传播', '用户洞察', '活动复盘'],
  },
  {
    direction: '内容运营 / 内容策略',
    keywords: ['内容策略', '选题', '文案', '账号运营', '数据复盘'],
  },
  {
    direction: '用户运营 / 社群运营',
    keywords: ['用户研究', '用户增长', '社群', '活动策划', '留存'],
  },
  {
    direction: 'AI 产品 / 产品运营',
    keywords: ['AI', '需求分析', '工作流', '原型', '跨团队协作'],
  },
] as const

export type RoleMatchBand = '高匹配' | '可尝试' | '待积累'

export interface MatchedEvidence {
  claimId: string
  label: string
  detail: string
  evidenceSpanIds: string[]
  matchedKeywords: string[]
}

export interface RoleDirectionScore {
  direction: (typeof ROLE_TAXONOMY)[number]['direction']
  percentage: number
  band: RoleMatchBand
  matchedKeywords: string[]
  matchedEvidence: MatchedEvidence[]
  advantages: string[]
  gaps: string[]
  searchKeywords: string[]
}

const CAPABILITY_KINDS = new Set<ExtractedClaim['kind']>([
  'capability',
  'tool',
  'ai',
  'certificate',
])

const normalizeText = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/gu, '')

const AI_APPLICATION_PATTERN = /\bAI\b|人工智能|大模型|提示词|工作流|自动化|生成式/iu

export const normalizeClaimLabel = normalizeText

const matchesRoleKeyword = (claimText: string, keyword: string) => {
  const normalizedKeyword = keyword
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .trim()
  if (/^[a-z0-9]+$/u.test(normalizedKeyword)) {
    const normalizedClaimText = claimText
      .normalize('NFKC')
      .toLocaleLowerCase('zh-CN')
    const escapedKeyword = normalizedKeyword.replace(
      /[.*+?^${}()|[\]\\]/gu,
      '\\$&',
    )
    return new RegExp(
      `(^|[^a-z0-9])${escapedKeyword}($|[^a-z0-9])`,
      'u',
    ).test(normalizedClaimText)
  }
  return normalizeText(claimText).includes(normalizeText(keyword))
}

const unique = (values: string[]) => [...new Set(values)]

export function buildCapabilitySummaries(
  claims: ExtractedClaim[],
  profileMaterials: ProfileMaterial[] = [],
): CapabilitySummary[] {
  const grouped = new Map<
    string,
    {
      label: string
      kind: CapabilityKind
      evidenceSpanIds: string[]
      experienceIds: string[]
      profileMaterialIds: string[]
    }
  >()

  const addSummary = (
    kind: CapabilityKind,
    labelValue: string,
    evidenceSpanIds: string[] = [],
    experienceIds: string[] = [],
    profileMaterialIds: string[] = [],
  ) => {
    const collapsedLabel = labelValue
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ')
    const label = /[a-z0-9]/iu.test(collapsedLabel)
      ? collapsedLabel
      : collapsedLabel.replace(/\s+/gu, '')
    const key = `${kind}:${normalizeClaimLabel(label)}`
    const current = grouped.get(key) ?? {
      label,
      kind,
      evidenceSpanIds: [],
      experienceIds: [],
      profileMaterialIds: [],
    }
    current.evidenceSpanIds = unique([
      ...current.evidenceSpanIds,
      ...evidenceSpanIds,
    ])
    current.experienceIds = unique([
      ...current.experienceIds,
      ...experienceIds,
    ])
    current.profileMaterialIds = unique([
      ...current.profileMaterialIds,
      ...profileMaterialIds,
    ])
    grouped.set(key, current)
  }

  for (const claim of claims) {
    if (claim.status !== 'confirmed') continue
    const claimText = `${claim.label} ${claim.detail}`
    if (CAPABILITY_KINDS.has(claim.kind)) {
      addSummary(
        claim.kind as CapabilityKind,
        claim.label,
        claim.evidenceSpanIds,
        [claim.experienceId],
      )
    }
    if (AI_APPLICATION_PATTERN.test(claimText)) {
      addSummary(
        'ai',
        'AI 应用与工作流',
        claim.evidenceSpanIds,
        [claim.experienceId],
      )
    }
    if (claim.kind === 'capability' || claim.kind === 'tool' ||
        claim.kind === 'ai' || claim.kind === 'certificate') continue
    MARKET_CAPABILITIES.forEach(({ label, keywords }) => {
      if (keywords.some((keyword) => matchesRoleKeyword(claimText, keyword))) {
        addSummary(
          'capability',
          label,
          claim.evidenceSpanIds,
          [claim.experienceId],
        )
      }
    })
  }

  for (const material of profileMaterials) {
    const kind: CapabilityKind =
      material.type === 'ai_application'
        ? 'ai'
        : material.type === 'language'
          ? 'language'
          : material.type === 'skill_tool'
            ? 'tool'
            : 'certificate'
    addSummary(kind, material.title, [], [], [material.id])
  }

  return [...grouped.values()]
    .map((summary) => ({
      ...summary,
      evidenceCount:
        summary.evidenceSpanIds.length + summary.profileMaterialIds.length,
      experienceCount: summary.experienceIds.length,
    }))
    .sort(
      (left, right) =>
        right.evidenceCount - left.evidenceCount ||
        left.label.localeCompare(right.label, 'zh-CN') ||
        left.kind.localeCompare(right.kind, 'zh-CN') ||
        normalizeClaimLabel(left.label).localeCompare(
          normalizeClaimLabel(right.label),
          'zh-CN',
        ),
    )
}

const getBand = (percentage: number): RoleMatchBand => {
  if (percentage >= 70) return '高匹配'
  if (percentage >= 30) return '可尝试'
  return '待积累'
}

export function buildRoleDirectionScores(
  claims: ExtractedClaim[],
  profileMaterials: ProfileMaterial[] = [],
): RoleDirectionScore[] {
  const confirmedClaims = claims.filter(
    ({ status }) => status === 'confirmed',
  )

  return ROLE_TAXONOMY.map(({ direction, keywords }) => {
    const evidence: MatchedEvidence[] = []
    for (const claim of confirmedClaims) {
      const claimText = `${claim.label} ${claim.detail}`
      const matchedKeywords: string[] = keywords.filter((keyword) =>
        matchesRoleKeyword(claimText, keyword),
      )
      if (matchedKeywords.length > 0) {
        evidence.push({
          claimId: claim.id,
          label: claim.label,
          detail: claim.detail,
          evidenceSpanIds: [...claim.evidenceSpanIds],
          matchedKeywords,
        })
      }
    }
    for (const material of profileMaterials) {
      const materialText = `${material.title} ${material.detail} ${material.proficiency ?? ''}`
      const matchedKeywords = keywords.filter((keyword) =>
        matchesRoleKeyword(materialText, keyword),
      )
      if (matchedKeywords.length) {
        evidence.push({
          claimId: `profile-material:${material.id}`,
          label: material.title,
          detail: material.detail,
          evidenceSpanIds: [],
          matchedKeywords,
        })
      }
    }
    evidence.sort((left, right) =>
      left.claimId.localeCompare(right.claimId, 'zh-CN'),
    )
    const matchedKeywords = keywords.filter((keyword) =>
      evidence.some((item) => item.matchedKeywords.includes(keyword)),
    )
    const evidenceClaims = evidence.filter(
      ({ claimId }) => !claimId.startsWith('profile-material:'),
    )
    const matchedExperiences = new Set(
      evidenceClaims.flatMap(({ claimId }) => {
        const match = confirmedClaims.find(({ id }) => id === claimId)
        return match ? [match.experienceId] : []
      }),
    )
    const coverageScore = (matchedKeywords.length / keywords.length) * 55
    const evidenceScore = Math.min(evidence.length / 3, 1) * 15
    const resultScore = evidenceClaims.some(({ claimId }) =>
      confirmedClaims.some(
        ({ id, kind }) => id === claimId && kind === 'result',
      ),
    )
      ? 15
      : 0
    const breadthScore = Math.min(matchedExperiences.size / 2, 1) * 15
    const percentage = Math.round(
      coverageScore + evidenceScore + resultScore + breadthScore,
    )

    return {
      direction,
      percentage,
      band: getBand(percentage),
      matchedKeywords: [...matchedKeywords],
      matchedEvidence: evidence,
      advantages: evidence.map(
        ({ label, matchedKeywords: matches }) =>
          `已确认“${label}”，覆盖${matches.join('、')}`,
      ),
      gaps: keywords.filter((keyword) => !matchedKeywords.includes(keyword)),
      searchKeywords: [...keywords],
    }
  })
}
