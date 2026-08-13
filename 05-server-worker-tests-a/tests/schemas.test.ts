import { describe, expect, it } from 'vitest'

import {
  backupSchema,
  evidenceSpanSchema,
  experienceSchema,
  extractedClaimSchema,
  profileMaterialSchema,
} from '../src/domain/schemas'
import { validConfirmedClaim, validExperience } from './fixtures'

const validEvidenceSpan = {
  id: 'span-1',
  sourceArtifactId: 'source-1',
  quote: 'Evidence',
  start: 0,
  end: 8,
}

describe('evidenceSpanSchema', () => {
  it.each(['id', 'sourceArtifactId', 'quote'] as const)(
    'rejects an empty %s',
    (field) => {
      const result = evidenceSpanSchema.safeParse({
        ...validEvidenceSpan,
        [field]: '',
      })

      expect(result.success).toBe(false)
    },
  )

  it('rejects non-integer span coordinates', () => {
    const fractionalStart = evidenceSpanSchema.safeParse({
      ...validEvidenceSpan,
      start: 0.5,
    })
    const fractionalEnd = evidenceSpanSchema.safeParse({
      ...validEvidenceSpan,
      end: 1.5,
    })

    expect(fractionalStart.success).toBe(false)
    expect(fractionalEnd.success).toBe(false)
  })

  it('rejects a span whose end equals its start', () => {
    const result = evidenceSpanSchema.safeParse({
      ...validEvidenceSpan,
      start: 4,
      end: 4,
    })

    expect(result.success).toBe(false)
  })

  it('rejects a span whose end precedes its start', () => {
    const result = evidenceSpanSchema.safeParse({
      ...validEvidenceSpan,
      start: 5,
      end: 4,
    })

    expect(result.success).toBe(false)
  })
})

describe('extractedClaimSchema', () => {
  it('rejects a confirmed claim without evidence', () => {
    const result = extractedClaimSchema.safeParse({
      ...validConfirmedClaim,
      evidenceSpanIds: [],
    })

    expect(result.success).toBe(false)
  })

  it.each(['pending', 'rejected'] as const)(
    'rejects a %s claim without evidence',
    (status) => {
      const result = extractedClaimSchema.safeParse({
        ...validConfirmedClaim,
        status,
        evidenceSpanIds: [],
      })

      expect(result.success).toBe(false)
    },
  )

  it.each(['id', 'experienceId', 'label'] as const)(
    'rejects an empty %s',
    (field) => {
      const result = extractedClaimSchema.safeParse({
        ...validConfirmedClaim,
        [field]: '',
      })

      expect(result.success).toBe(false)
    },
  )

  it('rejects an empty evidence span ID', () => {
    const result = extractedClaimSchema.safeParse({
      ...validConfirmedClaim,
      evidenceSpanIds: [''],
    })

    expect(result.success).toBe(false)
  })
})

describe('experienceSchema', () => {
  it.each(['id', 'organization', 'role'] as const)(
    'rejects an empty %s',
    (field) => {
      const result = experienceSchema.safeParse({
        ...validExperience,
        [field]: '',
      })

      expect(result.success).toBe(false)
    },
  )
})

describe('profileMaterialSchema', () => {
  it('accepts an independent skill and tool material', () => {
    expect(
      profileMaterialSchema.parse({
        id: 'tool-1',
        type: 'skill_tool',
        title: 'Figma',
        detail: '用于界面设计和交互原型',
        proficiency: '熟练',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      }),
    ).toMatchObject({ type: 'skill_tool', title: 'Figma' })
  })
})

describe('backupSchema', () => {
  it('rejects a backup without a version', () => {
    const result = backupSchema.safeParse({
      exportedAt: '2026-07-27T10:00:00.000Z',
      experiences: [],
      sourceArtifacts: [],
      evidenceSpans: [],
      claims: [],
      jdRecords: [],
    })

    expect(result.success).toBe(false)
  })
})
