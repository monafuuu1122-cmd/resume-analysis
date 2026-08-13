import type { CompanyTarget } from '../domain/types'
import { db } from './database'

export const listCompanyTargets = () =>
  db.companyTargets.orderBy('updatedAt').reverse().toArray()

export const saveCompanyTarget = (target: CompanyTarget) =>
  db.companyTargets.put(target)

export const deleteCompanyTarget = (id: string) =>
  db.companyTargets.delete(id)
