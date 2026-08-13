import { describe, expect, it } from 'vitest'

import type { ConfirmedEvidenceSnapshot } from '../src/db/evidenceRepository'
import { buildInterviewProfileContext } from '../src/domain/interviewContext'
import { jdRecordSchema } from '../src/domain/schemas'

const snapshot: ConfirmedEvidenceSnapshot = {
  claims: [
    {
      id: 'confirmed-with-evidence',
      experienceId: 'experience-1',
      kind: 'responsibility',
      label: '品牌内容策略',
      detail: '负责品牌内容策略与复盘',
      status: 'confirmed',
      evidenceSpanIds: ['evidence-1'],
    },
    {
      id: 'pending-with-evidence',
      experienceId: 'experience-1',
      kind: 'result',
      label: '待确认结果',
      detail: '',
      status: 'pending',
      evidenceSpanIds: ['evidence-2'],
    },
    {
      id: 'confirmed-without-evidence',
      experienceId: 'experience-1',
      kind: 'capability',
      label: '没有原文的能力',
      detail: '',
      status: 'confirmed',
      evidenceSpanIds: ['missing-evidence'],
    },
  ],
  evidenceSpans: [
    {
      id: 'evidence-1',
      sourceArtifactId: 'artifact-1',
      quote: '负责品牌内容策略',
      start: 0,
      end: 8,
    },
    {
      id: 'evidence-2',
      sourceArtifactId: 'artifact-1',
      quote: '尚未确认的结果',
      start: 9,
      end: 16,
    },
  ],
  experiences: [
    {
      id: 'experience-1',
      organization: '示例公司',
      role: '内容策略',
      project: '品牌升级',
      startDate: '2025-01',
      endDate: '2026-01',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    },
  ],
}

describe('buildInterviewProfileContext', () => {
  it('只把已确认且有原文证据的 claims 放入 JD 上下文', () => {
    const context = buildInterviewProfileContext(snapshot)

    expect(context.claims).toHaveLength(1)
    expect(context.claims.every((claim) => claim.status === 'confirmed')).toBe(
      true,
    )
    expect(context.claims[0].evidence[0].quote).toBe('负责品牌内容策略')
  })

  it('附带 claim 对应的经历信息并保留尚未提炼的经历', () => {
    const context = buildInterviewProfileContext(snapshot)

    expect(context.claims[0].experience).toMatchObject({
      id: 'experience-1',
      organization: '示例公司',
      role: '内容策略',
    })
    expect(context.experiences).toHaveLength(1)
  })
})

it('keeps legacy JD records valid while accepting structured analysis fields', () => {
  const legacy = {
    id: 'legacy-jd',
    company: '旧公司',
    role: '旧岗位',
    jdText: '旧 JD',
    analysis: { legacy: true },
    updatedAt: '2026-07-27T10:00:00.000Z',
  }

  expect(jdRecordSchema.parse(legacy)).toEqual(legacy)
  expect(
    jdRecordSchema.parse({
      ...legacy,
      analysisStatus: 'completed',
      profileSnapshot: buildInterviewProfileContext(snapshot),
    }),
  ).toMatchObject({
    analysisStatus: 'completed',
    profileSnapshot: { claims: [{ status: 'confirmed' }] },
  })
})
