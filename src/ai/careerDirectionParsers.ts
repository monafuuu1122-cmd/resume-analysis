import { sanitizeVisibleAIText } from './safeOutput'

type Source = { id: string; title: string; url: string }
type Evidence = { id: string; originalText: string }

const allowed = <T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
) => values.includes(value as T) ? value as T : fallback

const list = (value: unknown) => Array.isArray(value) ? value : []
const text = (value: unknown) =>
  typeof value === 'string' ? sanitizeVisibleAIText(value) : ''

export function normalizeCareerDirectionMarketAnalysis(
  input: Record<string, unknown>,
  sources: Source[],
  evidence: Evidence[],
) {
  const knownSources = new Set(sources.map(({ id }) => id))
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  let partial = false

  const requirements = list(input.requirements).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      partial = true
      return []
    }
    const item = raw as Record<string, unknown>
    const originalSourceIds = list(item.sourceIds).filter(
      (id): id is string => typeof id === 'string',
    )
    const sourceIds = originalSourceIds.filter((id) => knownSources.has(id))
    const originalEvidenceIds = list(item.evidenceIds).filter(
      (id): id is string => typeof id === 'string',
    )
    const evidenceIds = originalEvidenceIds.filter((id) => evidenceById.has(id))
    if (
      sourceIds.length !== originalSourceIds.length ||
      evidenceIds.length !== originalEvidenceIds.length
    ) partial = true

    const evidenceTexts = evidenceIds
      .map((id) => evidenceById.get(id)?.originalText ?? '')
      .filter(Boolean)
    const evidenceExcerpts = list(item.evidenceExcerpts)
      .map(text)
      .filter((excerpt) =>
        excerpt && evidenceTexts.some((original) => original.includes(excerpt)),
      )
      .map((excerpt) => excerpt.slice(0, 90))
      .slice(0, 4)
    if (evidenceIds.length && !evidenceExcerpts.length) {
      evidenceExcerpts.push(...evidenceTexts.slice(0, 4).map((value) => value.slice(0, 90)))
      partial = true
    }

    let matchStatus = allowed(
      item.matchStatus,
      ['advantage', 'basic-match', 'evidence-gap', 'clear-gap', 'confirm'] as const,
      'confirm',
    )
    if (!evidenceIds.length && ['advantage', 'basic-match'].includes(matchStatus)) {
      matchStatus = 'evidence-gap'
      partial = true
    }
    const requirement = text(item.requirement)
    const matchReason = text(item.matchReason)
    const preparationAdvice = text(item.preparationAdvice)
    if (!requirement || !matchReason || !preparationAdvice) {
      partial = true
      return []
    }
    return [{
      id: `market-requirement-${index + 1}`,
      requirement,
      category: allowed(
        item.category,
        ['responsibility', 'capability', 'knowledge', 'working-style'] as const,
        'capability',
      ),
      importance: allowed(
        item.importance,
        ['high', 'medium', 'low'] as const,
        'medium',
      ),
      sourceIds,
      evidenceIds,
      evidenceExcerpts,
      matchReason,
      matchStatus,
      preparationAdvice,
    }]
  })

  const gap = (value: unknown) => list(value).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const title = text(item.title)
    const reason = text(item.reason)
    const action = text(item.action)
    return title && reason && action ? [{
      title,
      reason,
      action,
      priority: allowed(
        item.priority,
        ['high', 'medium', 'low'] as const,
        'medium',
      ),
    }] : []
  })

  const statusScore = {
    advantage: 95,
    'basic-match': 70,
    'evidence-gap': 35,
    'clear-gap': 10,
    confirm: 25,
  } as const
  const importanceWeight = { high: 3, medium: 2, low: 1 } as const
  const totalWeight = requirements.reduce(
    (sum, item) => sum + importanceWeight[item.importance],
    0,
  )
  const fitScore = totalWeight
    ? Math.round(requirements.reduce(
        (sum, item) =>
          sum + statusScore[item.matchStatus] * importanceWeight[item.importance],
        0,
      ) / totalWeight)
    : 0

  return {
    partial,
    fitScore,
    requirements,
    capabilityGaps: gap(input.capabilityGaps),
    mindsetGaps: gap(input.mindsetGaps),
  }
}
