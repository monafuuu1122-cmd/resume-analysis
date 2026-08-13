import type { CareerDirection, CareerEvidence } from './types'
import type { ExperienceEvidenceUnit } from './careerEvidence'

const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/gu, '')

const semanticGroups = [
  ['品牌', '传播', '内容', '营销', '媒介'],
  ['活动', '流程', '现场', '执行', '预案', '风险'],
  ['用户', '社群', '会员', '增长', '留存'],
  ['产品', '需求', '原型', '流程', 'AI'],
  ['研究', '洞察', '资料', '分析', '归纳'],
] as const

function relatedTerms(directionText: string) {
  const normalized = normalize(directionText)
  return semanticGroups.flatMap((group) =>
    group.some((term) => normalized.includes(normalize(term)))
      ? [...group]
      : [],
  )
}

type CareerDirectionInput = Pick<
  CareerDirection,
  'name' | 'description' | 'category' | 'possibleTitles'
>

function directionTerms(direction: CareerDirectionInput) {
  const directionText = [
    direction.name,
    direction.description,
    direction.category,
    ...direction.possibleTitles,
  ]
    .filter(Boolean)
    .join(' ')
  return [...new Set(relatedTerms(directionText))]
}

export function matchCareerEvidence(
  direction: CareerDirectionInput,
  unit: ExperienceEvidenceUnit,
  options: { force?: boolean } = {},
): CareerEvidence | null {
  const terms = directionTerms(direction)
  const directText = normalize(
    `${unit.originalText} ${unit.normalizedDescription}`,
  )
  const assetText = normalize(
    [...unit.capabilities, ...unit.domains].join(' '),
  )
  const directMatches = terms.filter((term) =>
    directText.includes(normalize(term)),
  )
  const transferMatches = terms.filter((term) =>
    assetText.includes(normalize(term)),
  )
  if (!directMatches.length && !transferMatches.length && !options.force) {
    return null
  }

  const isDirect = directMatches.length >= 2
  const focus = [
    ...new Set(isDirect ? directMatches : transferMatches),
  ].slice(0, 3)
  const fallbackFocus = [
    ...unit.capabilities,
    ...unit.domains,
  ].filter(Boolean).slice(0, 3)
  const finalFocus = focus.length ? focus : fallbackFocus.length ? fallbackFocus : ['相关项目经验']
  return {
    id: unit.id,
    experienceId: unit.experienceId,
    sourceLabel: unit.sourceLabel,
    originalText: unit.originalText,
    matchAngle: isDirect
      ? `以${finalFocus.join('、')}直接支持该方向`
      : `以${finalFocus.join('、')}能力迁移到该方向`,
    capability: finalFocus.join('、') || '待确认',
    evidenceType: isDirect ? 'direct' : 'ability-transfer',
    strength: isDirect ? 'high' : 'medium',
    resumeSuggestion: `保留原事实，围绕“${direction.name}”强调${finalFocus.join('、')}。`,
    interviewSuggestion: '说明个人承担的部分、方法、结果与复盘。',
  }
}

export function analyzeCareerDirection(
  direction: CareerDirection,
  units: ExperienceEvidenceUnit[],
): CareerDirection {
  const matchedEvidence = units.flatMap((unit) => {
    const match = matchCareerEvidence(direction, unit)
    return match ? [match] : []
  })
  const directCount = matchedEvidence.filter(
    (item) => item.evidenceType === 'direct',
  ).length
  const transferCount = matchedEvidence.length - directCount
  const experienceCount = new Set(
    matchedEvidence.map((item) => item.experienceId).filter(Boolean),
  ).size
  const fitScore = Math.min(
    85,
    Math.round(
      Math.min(45, directCount * 8) +
        Math.min(20, transferCount * 4) +
        Math.min(25, experienceCount * 8),
    ),
  )
  return {
    ...direction,
    fitScore,
    confidence:
      ((experienceCount >= 2 && directCount >= 2) || experienceCount >= 3)
        ? 'high'
        : matchedEvidence.length
          ? 'medium'
          : 'low',
    matchedEvidence,
    recommendationReason: matchedEvidence.length
      ? `找到 ${matchedEvidence.length} 条证据，覆盖 ${experienceCount} 段经历，其中 ${directCount} 条为直接匹配。`
      : '当前档案中尚未找到可安全映射的证据。',
  }
}
