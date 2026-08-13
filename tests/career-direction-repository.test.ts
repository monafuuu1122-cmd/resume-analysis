import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'

import { db } from '../src/db/database'
import {
  deleteCareerDirection,
  ensureLegacyCareerDirections,
  listCareerDirections,
  saveCareerDirection,
  saveCareerDirectionMarketAnalysis,
  updateCareerDirectionStatus,
} from '../src/db/careerDirectionRepository'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('saves a market analysis without replacing the rest of the direction', async () => {
  await ensureLegacyCareerDirections()
  const direction = (await listCareerDirections())[0]
  await saveCareerDirectionMarketAnalysis(direction.id, {
    id: 'market-1',
    directionId: direction.id,
    directionName: direction.name,
    status: 'completed',
    fitScore: 68,
    requirements: [],
    capabilityGaps: [],
    mindsetGaps: [],
    sources: [],
    generatedAt: '2026-08-02T10:00:00.000Z',
  })

  const saved = await db.careerDirections.get(direction.id)
  expect(saved).toMatchObject({
    name: direction.name,
    marketAnalysis: { id: 'market-1', fitScore: 68 },
  })
})

it('seeds the four legacy directions once and allows more directions', async () => {
  await ensureLegacyCareerDirections()
  await ensureLegacyCareerDirections()
  const now = '2026-07-29T10:00:00.000Z'
  await saveCareerDirection({
    id: 'culture',
    name: '企业文化',
    description: '文化内容与项目落地',
    source: 'user-created',
    status: 'exploring',
    matchedEvidence: [],
    transferableCapabilities: [],
    evidenceGaps: [],
    possibleTitles: [],
    adjacentDirections: [],
    developmentSuggestions: [],
    updatedAt: now,
  })

  expect(await listCareerDirections()).toHaveLength(5)
  expect((await listCareerDirections()).map(({ name }) => name)).toContain(
    '企业文化',
  )
})

it('updates status and deletes only the selected direction', async () => {
  await ensureLegacyCareerDirections()
  const directions = await listCareerDirections()
  const first = directions[0]
  const second = directions[1]

  await updateCareerDirectionStatus(first.id, 'primary')
  await deleteCareerDirection(second.id)

  const saved = await listCareerDirections()
  expect(saved).toHaveLength(3)
  expect(saved.find(({ id }) => id === first.id)?.status).toBe('primary')
  expect(saved.find(({ id }) => id === second.id)).toBeUndefined()
})
