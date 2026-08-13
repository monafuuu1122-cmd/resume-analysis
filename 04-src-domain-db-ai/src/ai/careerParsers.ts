import {
  careerInspirationCardSchema,
  careerProfileSummarySchema,
  type CareerInspirationCard,
} from '../domain/careerSchemas'

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s/·\-—_]+/gu, '')

export function parseCareerInspirationPayload(
  payload: { profileSummary?: unknown; directions?: unknown },
  knownEvidenceIds: Iterable<string>,
  excludedDirections: Iterable<string> = [],
) {
  const known = new Set(knownEvidenceIds)
  const excluded = new Set([...excludedDirections].map(normalize))
  const seen = new Set<string>()
  const rawDirections = Array.isArray(payload.directions)
    ? payload.directions
    : []
  const directions: CareerInspirationCard[] = []

  rawDirections.forEach((raw) => {
    const parsed = careerInspirationCardSchema.safeParse(raw)
    if (!parsed.success) return
    const key = normalize(parsed.data.name)
    if (
      !key ||
      excluded.has(key) ||
      seen.has(key) ||
      !parsed.data.matchedEvidenceIds.every((id) => known.has(id))
    ) {
      return
    }
    seen.add(key)
    directions.push(parsed.data)
  })

  return {
    profileSummary: careerProfileSummarySchema.parse(
      payload.profileSummary ?? {},
    ),
    directions: directions.slice(0, 8),
    status:
      directions.length === 0
        ? ('parse-failed' as const)
        : directions.length < rawDirections.length
          ? ('partial' as const)
          : ('completed' as const),
  }
}
