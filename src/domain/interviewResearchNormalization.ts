type ResearchSourceRef = {
  id: string
  sourceType: string
}

type ResearchGeneration = {
  companyInsights?: Array<Record<string, unknown>>
  competencies?: Array<Record<string, unknown>>
  interviewPriorities?: Array<Record<string, unknown>>
  predictedQuestions?: Array<Record<string, unknown>>
  preparationChecklist?: Array<Record<string, unknown>>
}

const officialTypes = new Set([
  'official_website',
  'official_careers',
  'official_report',
  'official_social',
])

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

export function normalizeInterviewResearchGeneration<T extends ResearchGeneration>(
  input: T,
  sources: ResearchSourceRef[],
  claimIds: Iterable<string>,
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const knownClaims = new Set(claimIds)
  let partial = false

  const sourceIds = (value: unknown) => {
    const original = strings(value)
    const filtered = original.filter((id) => sourceById.has(id))
    if (filtered.length !== original.length) partial = true
    return filtered
  }
  const evidenceClaimIds = (value: unknown) => {
    const original = strings(value)
    const filtered = original.filter((id) => knownClaims.has(id))
    if (filtered.length !== original.length) partial = true
    return filtered
  }

  const companyInsights = (input.companyInsights ?? []).flatMap((item) => {
    const ids = sourceIds(item.sourceIds)
    if (!ids.length && item.evidenceType !== 'inference') {
      partial = true
      return []
    }
    let evidenceType = item.evidenceType
    if (
      evidenceType === 'official' &&
      !ids.some((id) => officialTypes.has(sourceById.get(id)?.sourceType ?? ''))
    ) {
      evidenceType = 'public'
      partial = true
    }
    return [{ ...item, evidenceType, sourceIds: ids }]
  })

  const competencies = (input.competencies ?? []).map((item) => {
    const ids = evidenceClaimIds(item.evidenceClaimIds)
    const assessment = item.assessment === 'match' && !ids.length
      ? 'unknown'
      : item.assessment
    if (assessment !== item.assessment) partial = true
    return {
      ...item,
      assessment,
      evidenceClaimIds: ids,
      sourceIds: sourceIds(item.sourceIds),
    }
  })

  const interviewPriorities = (input.interviewPriorities ?? []).map((item) => ({
    ...item,
    evidenceClaimIds: evidenceClaimIds(item.evidenceClaimIds),
  }))

  const predictedQuestions = (input.predictedQuestions ?? []).map((item) => ({
    ...item,
    evidenceClaimIds: evidenceClaimIds(item.evidenceClaimIds),
    sourceIds: sourceIds(item.sourceIds),
  }))

  return {
    partial,
    value: {
      companyInsights,
      competencies,
      interviewPriorities,
      predictedQuestions,
      preparationChecklist: input.preparationChecklist ?? [],
    } as unknown as T,
  }
}
