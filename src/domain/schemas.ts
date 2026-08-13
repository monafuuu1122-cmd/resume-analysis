import { z } from 'zod'
import { careerDirectionMarketAnalysisSchema } from './careerSchemas'

export const evidenceSpanSchema = z
  .object({
    id: z.string().min(1),
    sourceArtifactId: z.string().min(1),
    quote: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((span) => span.end > span.start, {
    message: 'Evidence span end must be greater than start',
    path: ['end'],
  })

export const extractedClaimSchema = z
  .object({
    id: z.string().min(1),
    experienceId: z.string().min(1),
    kind: z.enum([
      'responsibility',
      'action',
      'result',
      'capability',
      'tool',
      'ai',
      'certificate',
    ]),
    label: z.string().min(1),
    detail: z.string().default(''),
    status: z.enum(['pending', 'confirmed', 'rejected']),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
  })

export const experienceSchema = z.object({
  id: z.string().min(1),
  organization: z.string().min(1),
  role: z.string().min(1),
  project: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const sourceArtifactSchema = z.object({
  id: z.string().min(1),
  experienceId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  createdAt: z.string().datetime(),
})

export const profileMaterialSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'certificate',
    'ai_application',
    'language',
    'skill_tool',
  ]),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  proficiency: z.string().trim().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const companyTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  website: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const careerEvidenceSchema = z.object({
  id: z.string().min(1),
  experienceId: z.string().optional(),
  sourceLabel: z.string().min(1),
  originalText: z.string().min(1),
  matchAngle: z.string().min(1),
  capability: z.string().min(1),
  evidenceType: z.enum([
    'direct',
    'ability-transfer',
    'interest-potential',
    'insufficient',
  ]),
  strength: z.enum(['high', 'medium', 'low']),
  resumeSuggestion: z.string().optional(),
  interviewSuggestion: z.string().optional(),
})

export const transferableCapabilitySchema = z.object({
  capability: z.string().min(1),
  evidenceId: z.string().min(1),
  reason: z.string().min(1),
  targetTask: z.string().min(1),
  risk: z.string().min(1),
  knowledgeGap: z.string().optional(),
})

export const careerEvidenceGapSchema = z.object({
  requirement: z.string().min(1),
  missingEvidence: z.string().min(1),
  suggestion: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
})

export const careerDirectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  normalizedName: z.string().optional(),
  category: z.string().optional(),
  description: z.string().default(''),
  source: z.enum([
    'default',
    'user-created',
    'ai-recommended',
    'jd-derived',
  ]),
  status: z.enum([
    'exploring',
    'interested',
    'primary',
    'secondary',
    'archived',
  ]),
  fitScore: z.number().min(0).max(100).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  matchedEvidence: z.array(careerEvidenceSchema).default([]),
  transferableCapabilities: z
    .array(transferableCapabilitySchema)
    .default([]),
  evidenceGaps: z.array(careerEvidenceGapSchema).default([]),
  possibleTitles: z.array(z.string().min(1)).default([]),
  adjacentDirections: z.array(z.string().min(1)).default([]),
  developmentSuggestions: z.array(z.string().min(1)).default([]),
  recommendationReason: z.string().optional(),
  marketAnalysis: careerDirectionMarketAnalysisSchema.optional(),
  generatedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
})

export const careerDirectionFeedbackSchema = z.object({
  id: z.string().min(1),
  directionId: z.string().min(1),
  directionName: z.string().min(1),
  feedback: z.enum([
    'interested',
    'not-interested',
    'already-known',
    'not-relevant',
    'too-difficult',
    'more-like-this',
  ]),
  createdAt: z.string().datetime(),
})

export const interviewProfileContextSchema = z
  .object({
    claims: z.array(
      extractedClaimSchema.extend({
        status: z.literal('confirmed'),
        evidence: z.array(evidenceSpanSchema).min(1),
        experience: experienceSchema.optional(),
      }),
    ),
    experiences: z.array(experienceSchema),
    profileMaterials: z.array(profileMaterialSchema).optional(),
  })
  .superRefine((context, refinement) => {
    const experienceIds = new Set(
      context.experiences.map((experience) => experience.id),
    )
    context.claims.forEach((claim, claimIndex) => {
      if (!experienceIds.has(claim.experienceId)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Claim experience does not exist in profile context',
          path: ['claims', claimIndex, 'experienceId'],
        })
      }
      if (
        claim.experience &&
        claim.experience.id !== claim.experienceId
      ) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Embedded experience does not belong to claim',
          path: ['claims', claimIndex, 'experience'],
        })
      }

      const declaredEvidenceIds = new Set(claim.evidenceSpanIds)
      const suppliedEvidenceIds = new Set(
        claim.evidence.map((evidence) => evidence.id),
      )
      const referencesMatch =
        declaredEvidenceIds.size === suppliedEvidenceIds.size &&
        [...declaredEvidenceIds].every((id) => suppliedEvidenceIds.has(id))
      if (!referencesMatch) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Claim evidence references do not match supplied evidence',
          path: ['claims', claimIndex, 'evidence'],
        })
      }
    })
  })

export const jdAnalysisSchema = z.object({
  company: z.string().min(1).default('待补充'),
  role: z.string().min(1).default('待补充'),
  department: z.string().min(1).default('待补充'),
  location: z.string().min(1).default('待补充'),
  level: z.string().min(1).default('待补充'),
  businessKeywords: z.array(z.string().min(1)).default([]),
  matchScore: z.number().min(0).max(100).default(0),
  evidenceCoverage: z.string().min(1).default('待补充'),
  strengths: z.array(
    z.object({
      title: z.string().min(1),
      explanation: z.string().min(1),
      evidenceClaimIds: z.array(z.string().min(1)).default([]),
      profileMaterialIds: z.array(z.string().min(1)).optional(),
    }),
  ).default([]),
  gaps: z.array(
    z.object({
      title: z.string().min(1),
      explanation: z.string().min(1),
    }),
  ).default([]),
  resumeRewrites: z.array(
    z.object({
      sourceClaimId: z.string().min(1),
      original: z.string().min(1),
      rewritten: z.string().min(1),
      rationale: z.string().min(1),
      supportingClaimIds: z.array(z.string().min(1)).optional(),
      profileMaterialIds: z.array(z.string().min(1)).optional(),
      targetRequirement: z.string().min(1).optional(),
    }),
  ).default([]),
  interviewDimensions: z.array(
    z.object({
      dimension: z.string().min(1),
      priority: z.enum(['high', 'medium', 'low']),
      focus: z.string().min(1),
      evidenceClaimIds: z.array(z.string().min(1)).default([]),
    }),
  ).default([]),
})

export function createJdAnalysisSchema(
  knownClaimIds: Iterable<string>,
  knownProfileMaterialIds: Iterable<string> = [],
) {
  const knownIds = new Set(knownClaimIds)
  const knownMaterialIds = new Set(knownProfileMaterialIds)
  return jdAnalysisSchema.superRefine((analysis, refinement) => {
    const requireKnown = (id: string, path: Array<string | number>) => {
      if (!knownIds.has(id)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Analysis references an unknown profile claim',
          path,
        })
      }
    }

    analysis.strengths.forEach((strength, strengthIndex) => {
      if (
        strength.evidenceClaimIds.length === 0 &&
        !strength.profileMaterialIds?.length
      ) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Strength requires candidate evidence',
          path: ['strengths', strengthIndex],
        })
      }
      strength.evidenceClaimIds.forEach((id, idIndex) =>
        requireKnown(id, [
          'strengths',
          strengthIndex,
          'evidenceClaimIds',
          idIndex,
        ]),
      )
      strength.profileMaterialIds?.forEach((id, idIndex) => {
        if (!knownMaterialIds.has(id)) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Analysis references an unknown profile material',
            path: ['strengths', strengthIndex, 'profileMaterialIds', idIndex],
          })
        }
      })
    })
    analysis.resumeRewrites.forEach((rewrite, rewriteIndex) => {
      requireKnown(rewrite.sourceClaimId, [
        'resumeRewrites',
        rewriteIndex,
        'sourceClaimId',
      ])
      rewrite.supportingClaimIds?.forEach((id, idIndex) =>
        requireKnown(id, [
          'resumeRewrites',
          rewriteIndex,
          'supportingClaimIds',
          idIndex,
        ]),
      )
      rewrite.profileMaterialIds?.forEach((id, idIndex) => {
        if (!knownMaterialIds.has(id)) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Rewrite references an unknown profile material',
            path: ['resumeRewrites', rewriteIndex, 'profileMaterialIds', idIndex],
          })
        }
      })
    })
    analysis.interviewDimensions.forEach((dimension, dimensionIndex) => {
      dimension.evidenceClaimIds.forEach((id, idIndex) =>
        requireKnown(id, [
          'interviewDimensions',
          dimensionIndex,
          'evidenceClaimIds',
          idIndex,
        ]),
      )
    })
  })
}

export const jdRecordSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  companyWebsite: z.string().optional(),
  companyIndustry: z.string().optional(),
  companyTargetId: z.string().optional(),
  role: z.string().min(1),
  jdText: z.string().min(1),
  profileSnapshot: interviewProfileContextSchema.optional(),
  inputSnapshot: z.unknown().optional(),
  inputHash: z.string().optional(),
  jdHash: z.string().optional(),
  profileHash: z.string().optional(),
  parentAnalysisId: z.string().optional(),
  activeJobId: z.string().optional(),
  companyResearchId: z.string().optional(),
  interviewPreparationId: z.string().optional(),
  analysisStatus: z
    .enum([
      'draft',
      'analyzing',
      'partial',
      'completed',
      'failed',
      'timeout',
      'cancelled',
    ])
    .optional(),
  // Unknown legacy analysis payloads remain readable and are never rewritten.
  analysis: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
})

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  experiences: z.array(experienceSchema),
  sourceArtifacts: z.array(sourceArtifactSchema),
  evidenceSpans: z.array(evidenceSpanSchema),
  claims: z.array(extractedClaimSchema),
  jdRecords: z.array(jdRecordSchema),
})
