import {
  experienceSchema,
  sourceArtifactSchema,
} from '../domain/schemas'
import {
  migrationPackageSchema,
  migrationRecoveryItemSchema,
  migrationSnapshotSchema,
  type MigrationPackage,
} from '../domain/localDataSchemas'
import type { Experience } from '../domain/types'
import { db } from './database'

export const CURRENT_LOCAL_SCHEMA_VERSION = 6

export interface ExperienceFingerprintInput {
  organization?: string
  title?: string
  projectName?: string
  startDate?: string
  endDate?: string
  normalizedText?: string
}

export interface MigrationResult {
  migrated: number
  duplicates: number
  recovery: number
  source: string
  completedAt: string
}

const compact = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]+/gu, '')

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function experienceFingerprint(input: ExperienceFingerprintInput) {
  return stableHash(
    [
      input.organization,
      input.title,
      input.projectName,
      input.startDate,
      input.endDate,
      input.normalizedText,
    ]
      .map(compact)
      .join('|'),
  )
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function legacyItems(value: unknown) {
  const record = asRecord(value)
  const items = record?.experiences
  return Array.isArray(items) ? items : []
}

function normalizeLegacyExperience(
  value: unknown,
  index: number,
  createdAt: string,
) {
  const record = asRecord(value)
  if (!record) throw new Error('经历内容不是对象')
  const organization = String(
    record.organization ?? record.company ?? '',
  ).trim()
  const role = String(record.role ?? record.title ?? '').trim()
  if (!organization) throw new Error('缺少组织名称')
  if (!role) throw new Error('缺少经历名称')
  const content = String(
    record.rawContent ?? record.content ?? record.description ?? '',
  ).trim()
  const experience = experienceSchema.parse({
    id:
      String(record.id ?? '').trim() ||
      `migrated-experience-${stableHash(`${organization}:${role}:${index}`)}`,
    organization,
    role,
    project: String(record.project ?? record.projectName ?? '').trim(),
    startDate: String(record.startDate ?? '').trim(),
    endDate: String(record.endDate ?? '').trim(),
    createdAt:
      typeof record.createdAt === 'string' ? record.createdAt : createdAt,
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : createdAt,
  })
  return { content, experience }
}

function fingerprintFor(experience: Experience, content = '') {
  return experienceFingerprint({
    organization: experience.organization,
    title: experience.role,
    projectName: experience.project,
    startDate: experience.startDate,
    endDate: experience.endDate,
    normalizedText: content,
  })
}

export async function migrateLegacyPayload(
  value: unknown,
  source = 'legacy-local-data',
): Promise<MigrationResult> {
  const now = new Date().toISOString()
  const items = legacyItems(value)
  const snapshotId = `snapshot-${stableHash(source)}`
  if (!(await db.migrationSnapshots.get(snapshotId))) {
    await db.migrationSnapshots.put(
      migrationSnapshotSchema.parse({
        id: snapshotId,
        source,
        payload: value,
        createdAt: now,
      }),
    )
  }
  const existingExperiences = await db.experiences.toArray()
  const existingArtifacts = await db.sourceArtifacts.toArray()
  const contentByExperience = new Map<string, string>()
  existingArtifacts.forEach((artifact) => {
    contentByExperience.set(
      artifact.experienceId,
      `${contentByExperience.get(artifact.experienceId) ?? ''} ${artifact.content}`,
    )
  })
  const fingerprints = new Set(
    existingExperiences.map((experience) =>
      fingerprintFor(
        experience,
        contentByExperience.get(experience.id) ?? '',
      ),
    ),
  )
  let migrated = 0
  let duplicates = 0
  let recovery = 0

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    try {
      const normalized = normalizeLegacyExperience(item, index, now)
      const fingerprint = fingerprintFor(
        normalized.experience,
        normalized.content,
      )
      if (fingerprints.has(fingerprint)) {
        duplicates += 1
        continue
      }
      await db.transaction(
        'rw',
        db.experiences,
        db.sourceArtifacts,
        async () => {
          await db.experiences.put(normalized.experience)
          if (normalized.content) {
            await db.sourceArtifacts.put(
              sourceArtifactSchema.parse({
                id: `migrated-artifact-${fingerprint}`,
                experienceId: normalized.experience.id,
                title: '旧版经历原始内容',
                content: normalized.content,
                createdAt: now,
              }),
            )
          }
        },
      )
      fingerprints.add(fingerprint)
      migrated += 1
    } catch (error) {
      const recoveryId = `recovery-${stableHash(`${source}:${JSON.stringify(item)}`)}`
      if (await db.migrationRecoveryItems.get(recoveryId)) continue
      await db.migrationRecoveryItems.put(
        migrationRecoveryItemSchema.parse({
          id: recoveryId,
          source,
          payload: item,
          reason: error instanceof Error ? error.message : '旧数据无法解析',
          createdAt: now,
        }),
      )
      recovery += 1
    }
  }

  const meta = await db.localDataMeta.get('singleton')
  const historyEntry = `${source}:${stableHash(JSON.stringify(value))}`
  await db.localDataMeta.put({
    id: 'singleton',
    schemaVersion: CURRENT_LOCAL_SCHEMA_VERSION,
    lastMigratedAt: now,
    migrationHistory: [
      ...new Set([...(meta?.migrationHistory ?? []), historyEntry]),
    ],
  })
  return { migrated, duplicates, recovery, source, completedAt: now }
}

export async function exportMigrationPackage(
  exportedAt = new Date().toISOString(),
): Promise<MigrationPackage> {
  const [
    experiences,
    sourceArtifacts,
    evidenceSpans,
    claims,
    jdRecords,
    profileMaterials,
    companyTargets,
    careerDirections,
    careerDirectionFeedback,
    interviewResearch,
    mockInterviewSessions,
    answerOptimizations,
    questionPractices,
  ] = await Promise.all([
    db.experiences.toArray(),
    db.sourceArtifacts.toArray(),
    db.evidenceSpans.toArray(),
    db.claims.toArray(),
    db.jdRecords.toArray(),
    db.profileMaterials.toArray(),
    db.companyTargets.toArray(),
    db.careerDirections.toArray(),
    db.careerDirectionFeedback.toArray(),
    db.interviewResearch.toArray(),
    db.mockInterviewSessions.toArray(),
    db.answerOptimizations.toArray(),
    db.questionPractices.toArray(),
  ])
  return migrationPackageSchema.parse({
    version: 3,
    exportedAt,
    experiences,
    sourceArtifacts,
    evidenceSpans,
    claims,
    jdRecords,
    profileMaterials,
    companyTargets,
    careerDirections,
    careerDirectionFeedback,
    interviewResearch,
    mockInterviewSessions,
    answerOptimizations,
    questionPractices,
  })
}

export async function importMigrationPackage(
  value: unknown,
): Promise<MigrationResult> {
  const parsed = migrationPackageSchema.parse(value)
  const result = await migrateLegacyPayload(
    { experiences: parsed.experiences },
    `migration-package-v${parsed.version}`,
  )
  await db.transaction(
    'rw',
    [
      db.sourceArtifacts,
      db.evidenceSpans,
      db.claims,
      db.jdRecords,
      db.profileMaterials,
      db.companyTargets,
      db.careerDirections,
      db.careerDirectionFeedback,
      db.interviewResearch,
      db.mockInterviewSessions,
      db.answerOptimizations,
      db.questionPractices,
    ],
    async () => {
      await Promise.all([
        db.sourceArtifacts.bulkPut(parsed.sourceArtifacts),
        db.evidenceSpans.bulkPut(parsed.evidenceSpans),
        db.claims.bulkPut(parsed.claims),
        db.jdRecords.bulkPut(parsed.jdRecords),
        db.profileMaterials.bulkPut(parsed.profileMaterials),
        db.companyTargets.bulkPut(parsed.companyTargets),
        db.careerDirections.bulkPut(parsed.careerDirections),
        db.careerDirectionFeedback.bulkPut(parsed.careerDirectionFeedback),
        db.interviewResearch.bulkPut(parsed.interviewResearch),
        db.mockInterviewSessions.bulkPut(parsed.mockInterviewSessions),
        db.answerOptimizations.bulkPut(parsed.answerOptimizations),
        db.questionPractices.bulkPut(parsed.questionPractices),
      ])
    },
  )
  return result
}

const LEGACY_STORAGE_KEYS = [
  'offer-adventure:data',
  'offer-adventure:experiences',
  'job-search-dashboard',
  'job-search-dashboard-storage',
] as const

export async function migrateIfNeeded(): Promise<MigrationResult> {
  const meta = await db.localDataMeta.get('singleton')
  const hasLegacyKeys =
    typeof localStorage !== 'undefined' &&
    LEGACY_STORAGE_KEYS.some((key) => Boolean(localStorage.getItem(key)))
  if (meta?.schemaVersion === CURRENT_LOCAL_SCHEMA_VERSION && !hasLegacyKeys) {
    return {
      migrated: 0,
      duplicates: 0,
      recovery: 0,
      source: 'current',
      completedAt: meta.lastMigratedAt ?? new Date().toISOString(),
    }
  }
  let total: MigrationResult = {
    migrated: 0,
    duplicates: 0,
    recovery: 0,
    source: 'schema-check',
    completedAt: new Date().toISOString(),
  }
  if (typeof localStorage !== 'undefined') {
    for (const key of LEGACY_STORAGE_KEYS) {
      const stored = localStorage.getItem(key)
      if (!stored) continue
      try {
        const result = await migrateLegacyPayload(
          JSON.parse(stored),
          `localStorage:${key}`,
        )
        total = {
          ...total,
          migrated: total.migrated + result.migrated,
          duplicates: total.duplicates + result.duplicates,
          recovery: total.recovery + result.recovery,
        }
      } catch {
        await migrateLegacyPayload(
          { experiences: [stored] },
          `localStorage:${key}`,
        )
        total.recovery += 1
      }
    }
  }
  const now = new Date().toISOString()
  await db.localDataMeta.put({
    id: 'singleton',
    schemaVersion: CURRENT_LOCAL_SCHEMA_VERSION,
    lastMigratedAt: now,
    migrationHistory: ['schema-v6-check'],
  })
  return { ...total, completedAt: now }
}
