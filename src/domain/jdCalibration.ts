import type { InterviewProfileContext, JdAnalysis } from './types'

export function calibrateJdMatchScore(
  analysis: JdAnalysis,
  context: InterviewProfileContext,
): JdAnalysis {
  const referencedClaimIds = new Set(
    analysis.strengths.flatMap(({ evidenceClaimIds }) => evidenceClaimIds),
  )
  const referencedMaterialIds = new Set(
    analysis.strengths.flatMap(
      ({ profileMaterialIds }) => profileMaterialIds ?? [],
    ),
  )
  const referencedClaims = context.claims.filter(({ id }) =>
    referencedClaimIds.has(id),
  )
  const requirementCount = analysis.strengths.length + analysis.gaps.length
  if (
    !requirementCount ||
    (!referencedClaims.length && !referencedMaterialIds.size)
  ) {
    return { ...analysis, matchScore: 0 }
  }

  const coverageScore =
    (analysis.strengths.length / requirementCount) * 55
  const evidenceScore =
    Math.min(
      (referencedClaimIds.size + referencedMaterialIds.size) / 4,
      1,
    ) * 20
  const resultScore =
    (referencedClaims.filter(({ kind }) => kind === 'result').length /
      referencedClaims.length) *
    15
  const experienceScore =
    Math.min(
      new Set(referencedClaims.map(({ experienceId }) => experienceId)).size /
        2,
      1,
    ) * 10
  const evidenceBoundScore = Math.round(
    coverageScore + evidenceScore + resultScore + experienceScore,
  )

  return {
    ...analysis,
    matchScore: Math.min(analysis.matchScore, evidenceBoundScore),
  }
}
