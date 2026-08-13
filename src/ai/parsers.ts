import { z } from 'zod'

import {
  evidenceSpanSchema,
  extractedClaimSchema,
} from '../domain/schemas'

const extractionPayloadSchema = z.object({
  claims: z.array(
    z.object({
      kind: extractedClaimSchema.shape.kind,
      label: z.string().min(1),
      detail: z.string().default(''),
      quote: z.string(),
    }),
  ),
})

export function parseExtraction(
  source: string,
  payload: unknown,
  experienceId: string,
  sourceArtifactId: string,
) {
  const extraction = extractionPayloadSchema.parse(payload)
  const evidenceSpans = extraction.claims.map(({ quote }, index) => {
    const start = source.indexOf(quote)

    if (!quote || start === -1) {
      throw new Error(`AI 返回了无法定位的证据：${quote}`)
    }

    return evidenceSpanSchema.parse({
      id: `${sourceArtifactId}-span-${index}`,
      sourceArtifactId,
      quote,
      start,
      end: start + quote.length,
    })
  })
  const claims = extraction.claims.map(
    ({ detail, kind, label }, index) =>
      extractedClaimSchema.parse({
        id: `${sourceArtifactId}-claim-${index}`,
        experienceId,
        kind,
        label,
        detail,
        status: 'pending',
        evidenceSpanIds: [evidenceSpans[index].id],
      }),
  )

  return { evidenceSpans, claims }
}
