import { careerDirectionSchema } from '../domain/schemas'
import type {
  CareerDirection,
  CareerDirectionFeedback,
} from '../domain/types'
import {
  careerDirectionMarketAnalysisSchema,
  type CareerDirectionMarketAnalysis,
} from '../domain/careerSchemas'
import { db } from './database'

const LEGACY_DIRECTIONS = [
  '品牌策划 / 品牌营销',
  '内容运营 / 内容策略',
  '用户运营 / 社群运营',
  'AI 产品 / 产品运营',
] as const

const normalizeName = (name: string) =>
  name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')

export async function ensureLegacyCareerDirections() {
  if ((await db.careerDirections.count()) > 0) return
  const updatedAt = new Date().toISOString()
  await db.careerDirections.bulkPut(
    LEGACY_DIRECTIONS.map((name, index) =>
      careerDirectionSchema.parse({
        id: `legacy-direction-${index + 1}`,
        name,
        normalizedName: normalizeName(name),
        description: '由历史岗位方向迁移，可自由调整或删除。',
        source: 'default',
        status: 'exploring',
        matchedEvidence: [],
        transferableCapabilities: [],
        evidenceGaps: [],
        possibleTitles: [],
        adjacentDirections: [],
        developmentSuggestions: [],
        updatedAt,
      }),
    ),
  )
}

export async function listCareerDirections() {
  return db.careerDirections.orderBy('updatedAt').reverse().toArray()
}

export async function saveCareerDirection(direction: CareerDirection) {
  const parsed = careerDirectionSchema.parse({
    ...direction,
    normalizedName:
      direction.normalizedName || normalizeName(direction.name),
  })
  await db.careerDirections.put(parsed)
  return parsed
}

export async function updateCareerDirectionStatus(
  id: string,
  status: CareerDirection['status'],
) {
  await db.careerDirections.update(id, {
    status,
    updatedAt: new Date().toISOString(),
  })
}

export async function saveCareerDirectionMarketAnalysis(
  id: string,
  analysis: CareerDirectionMarketAnalysis,
) {
  const parsed = careerDirectionMarketAnalysisSchema.parse(analysis)
  const direction = await db.careerDirections.get(id)
  if (!direction) throw new Error('岗位方向不存在或已删除')
  await db.careerDirections.put(careerDirectionSchema.parse({
    ...direction,
    marketAnalysis: parsed,
    updatedAt: new Date().toISOString(),
  }))
  return parsed
}

export const deleteCareerDirection = (id: string) =>
  db.careerDirections.delete(id)

export async function saveCareerDirectionFeedback(
  feedback: CareerDirectionFeedback,
) {
  await db.careerDirectionFeedback.put(feedback)
}

export const listCareerDirectionFeedback = () =>
  db.careerDirectionFeedback.orderBy('createdAt').reverse().toArray()
