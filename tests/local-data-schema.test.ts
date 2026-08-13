import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  localDataMetaSchema,
  migrationPackageSchema,
  migrationRecoveryItemSchema,
} from '../src/domain/localDataSchemas'

const timestamp = '2026-07-29T08:00:00.000Z'

beforeEach(async () => {
  db.close()
  await db.delete()
})

afterEach(async () => {
  db.close()
  await db.delete()
})

describe('local data schemas', () => {
  it('validates version metadata and recovery items', () => {
    expect(
      localDataMetaSchema.parse({
        id: 'singleton',
        schemaVersion: 6,
        migrationHistory: [],
      }),
    ).toMatchObject({ schemaVersion: 6 })
    expect(
      migrationRecoveryItemSchema.parse({
        id: 'recovery-1',
        source: 'legacy-local-storage',
        payload: { broken: true },
        reason: '缺少组织名称',
        createdAt: timestamp,
      }),
    ).toMatchObject({ reason: '缺少组织名称' })
    expect(
      migrationPackageSchema.safeParse({
        version: 3,
        exportedAt: timestamp,
        experiences: [],
      }).success,
    ).toBe(true)
  })

  it('upgrades v5 without rewriting existing experiences', async () => {
    const legacy = new Dexie('offer-adventure')
    legacy.version(5).stores({
      experiences: 'id, organization, role, updatedAt',
      sourceArtifacts: 'id, experienceId, createdAt',
      evidenceSpans: 'id, sourceArtifactId',
      claims: 'id, experienceId, kind, status',
      jdRecords: 'id, company, role, updatedAt',
      interviewResearch: 'id, analysisId, researchStatus, updatedAt',
      mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
      answerOptimizations: 'id, analysisId, updatedAt',
      profileMaterials: 'id, type, title, updatedAt',
      companyTargets: 'id, name, updatedAt',
      careerDirections: 'id, name, source, status, updatedAt',
      careerDirectionFeedback: 'id, directionId, feedback, createdAt',
    })
    await legacy.open()
    await legacy.table('experiences').put({
      id: 'legacy-experience',
      organization: '旧组织',
      role: '旧角色',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    legacy.close()

    await db.open()

    expect(await db.experiences.get('legacy-experience')).toBeDefined()
    expect(await db.localDataMeta.toArray()).toEqual([])
    expect(await db.migrationSnapshots.toArray()).toEqual([])
    expect(await db.migrationRecoveryItems.toArray()).toEqual([])
  })
})
