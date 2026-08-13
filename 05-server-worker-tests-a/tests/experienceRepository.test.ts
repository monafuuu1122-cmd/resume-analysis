import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../src/db/database'
import { replaceArtifactPendingExtraction } from '../src/db/experienceRepository'
import type { EvidenceSpan, ExtractedClaim } from '../src/domain/types'

const artifactId = 'artifact-atomic'
const experienceId = 'experience-atomic'

function span(id: string, quote = id): EvidenceSpan {
  return {
    id,
    sourceArtifactId: artifactId,
    quote,
    start: 0,
    end: quote.length,
  }
}

function claim(
  id: string,
  evidenceSpanId: string,
  status: ExtractedClaim['status'] = 'pending',
): ExtractedClaim {
  return {
    id,
    experienceId,
    kind: 'result',
    label: `${status}-${id}`,
    detail: '',
    status,
    evidenceSpanIds: [evidenceSpanId],
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

describe('replaceArtifactPendingExtraction', () => {
  it('preserves confirmed and rejected decisions with their evidence', async () => {
    await db.evidenceSpans.bulkPut([
      span('span-confirmed', 'confirmed evidence'),
      span('span-rejected', 'rejected evidence'),
      span('span-old-pending', 'old pending evidence'),
    ])
    await db.claims.bulkPut([
      claim('claim-confirmed', 'span-confirmed', 'confirmed'),
      claim('claim-rejected', 'span-rejected', 'rejected'),
      claim('claim-old-pending', 'span-old-pending'),
    ])

    await replaceArtifactPendingExtraction(artifactId, {
      evidenceSpans: [
        span('span-confirmed', 'AI changed confirmed evidence'),
        span('span-rejected', 'AI changed rejected evidence'),
        span('span-new', 'new evidence'),
      ],
      claims: [
        claim('claim-confirmed', 'span-confirmed'),
        claim('claim-rejected', 'span-rejected'),
        claim('claim-new', 'span-new'),
      ],
    })

    expect(await db.claims.orderBy('id').toArray()).toEqual([
      claim('claim-confirmed', 'span-confirmed', 'confirmed'),
      claim('claim-new', 'span-new'),
      claim('claim-rejected', 'span-rejected', 'rejected'),
    ])
    expect((await db.evidenceSpans.get('span-confirmed'))?.quote).toBe(
      'confirmed evidence',
    )
    expect((await db.evidenceSpans.get('span-rejected'))?.quote).toBe(
      'rejected evidence',
    )
  })

  it('removes obsolete pending claims and spans when extraction shrinks', async () => {
    await db.evidenceSpans.bulkPut([
      span('span-keep', 'keep evidence'),
      span('span-obsolete', 'obsolete evidence'),
    ])
    await db.claims.bulkPut([
      claim('claim-keep', 'span-keep'),
      claim('claim-obsolete', 'span-obsolete'),
    ])

    await replaceArtifactPendingExtraction(artifactId, {
      evidenceSpans: [span('span-keep', 'changed evidence')],
      claims: [claim('claim-keep', 'span-keep')],
    })

    expect((await db.claims.toArray()).map(({ id }) => id)).toEqual([
      'claim-keep',
    ])
    expect((await db.evidenceSpans.toArray()).map(({ id }) => id)).toEqual([
      'span-keep',
    ])
    expect((await db.evidenceSpans.get('span-keep'))?.quote).toBe(
      'changed evidence',
    )
  })

  it('rolls back all changes when the replacement transaction fails', async () => {
    const oldSpan = span('span-old', 'old evidence')
    const oldClaim = claim('claim-old', oldSpan.id)
    await db.evidenceSpans.put(oldSpan)
    await db.claims.put(oldClaim)
    const writeFailure = vi
      .spyOn(db.claims, 'bulkPut')
      .mockRejectedValueOnce(new Error('transaction failed'))

    await expect(
      replaceArtifactPendingExtraction(artifactId, {
        evidenceSpans: [span('span-new', 'new evidence')],
        claims: [claim('claim-new', 'span-new')],
      }),
    ).rejects.toThrow('transaction failed')
    writeFailure.mockRestore()

    expect(await db.evidenceSpans.toArray()).toEqual([oldSpan])
    expect(await db.claims.toArray()).toEqual([oldClaim])
  })
})
