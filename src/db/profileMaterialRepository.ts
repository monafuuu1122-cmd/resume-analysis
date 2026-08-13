import { profileMaterialSchema } from '../domain/schemas'
import type { ProfileMaterial } from '../domain/types'
import { db } from './database'

export async function saveProfileMaterial(
  material: ProfileMaterial,
): Promise<ProfileMaterial> {
  const parsed = profileMaterialSchema.parse(material)
  await db.profileMaterials.put(parsed)
  return parsed
}

const typeOrder: Record<ProfileMaterial['type'], number> = {
  certificate: 0,
  ai_application: 1,
  skill_tool: 2,
  language: 3,
}

export async function listProfileMaterials(): Promise<ProfileMaterial[]> {
  const materials = await db.profileMaterials.toArray()
  return materials.sort(
    (left, right) =>
      typeOrder[left.type] - typeOrder[right.type] ||
      right.updatedAt.localeCompare(left.updatedAt),
  )
}

export function deleteProfileMaterial(id: string): Promise<void> {
  return db.profileMaterials.delete(id)
}
