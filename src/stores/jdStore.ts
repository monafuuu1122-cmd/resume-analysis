import { createStore } from 'zustand/vanilla'

import type { CompanyTarget, JdRecord } from '../domain/types'
import {
  deleteCompanyTarget as removeCompanyTarget,
  listCompanyTargets,
  saveCompanyTarget,
} from '../db/companyTargetRepository'
import { deleteInterviewContextByAnalysisId } from '../db/interviewRepository'
import {
  deleteJdRecordCascade,
  getJdRecord,
  listJdRecords,
  saveJdRecord,
} from '../db/jdRepository'

export interface JdDraft {
  company: string
  companyWebsite: string
  companyIndustry: string
  selectedCompanyTargetId?: string
  role: string
  jdText: string
}

interface JdStoreState {
  draft: JdDraft
  records: JdRecord[]
  companyTargets: CompanyTarget[]
  selectedRecord?: JdRecord
  loading: boolean
  error?: string
  companyTargetState: 'idle' | 'loading' | 'saving' | 'deleting' | 'failed'
  companyTargetError?: string
  activeCompanyTargetId?: string
  loadRecords: () => Promise<void>
  loadCompanyTargets: () => Promise<void>
  retryCompanyTargets: () => Promise<void>
  addCompanyTarget: (
    input: Pick<CompanyTarget, 'name'> &
      Partial<Pick<CompanyTarget, 'website' | 'industry'>>,
  ) => Promise<CompanyTarget>
  selectCompanyTarget: (id: string) => void
  deleteCompanyTarget: (id: string) => Promise<void>
  applySelectedCompanyToRecord: () => Promise<void>
  selectRecord: (id: string) => Promise<void>
  updateDraft: (change: Partial<JdDraft>) => void
  persistRecord: (record: JdRecord) => Promise<void>
  deleteRecord: (id: string) => Promise<void>
  clearDraft: () => void
}

const emptyDraft: JdDraft = {
  company: '',
  companyWebsite: '',
  companyIndustry: '',
  role: '',
  jdText: '',
}

export function createJdStore() {
  let recordsLoadToken = 0
  let companyTargetsLoadToken = 0
  return createStore<JdStoreState>((set, get) => ({
    draft: emptyDraft,
    records: [],
    companyTargets: [],
    loading: false,
    companyTargetState: 'idle',
    loadCompanyTargets: async () => {
      const token = ++companyTargetsLoadToken
      set({ companyTargetState: 'loading', companyTargetError: undefined })
      try {
        const companyTargets = await listCompanyTargets()
        if (token !== companyTargetsLoadToken) return
        set(({ draft }) => {
          const selected = draft.selectedCompanyTargetId
            ? companyTargets.find(({ id }) => id === draft.selectedCompanyTargetId)
            : undefined
          return {
            companyTargets,
            companyTargetState: 'idle',
            ...(selected
              ? {
                  draft: {
                    ...draft,
                    company: selected.name,
                    companyWebsite: selected.website ?? '',
                    companyIndustry: selected.industry ?? '',
                  },
                }
              : {}),
          }
        })
      } catch (error) {
        set({
          companyTargetState: 'failed',
          companyTargetError:
            error instanceof Error ? error.message : '企业信息读取失败',
        })
      }
    },
    retryCompanyTargets: async () => get().loadCompanyTargets(),
    addCompanyTarget: async (input) => {
      const name = input.name.trim()
      if (!name) throw new Error('请输入企业名称')
      const website = input.website?.trim()
      if (website) {
        try {
          const parsed = new URL(website)
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
        } catch {
          throw new Error('企业官网格式不正确，请填写 http 或 https 链接')
        }
      }
      set({ companyTargetState: 'saving', companyTargetError: undefined })
      ++companyTargetsLoadToken
      const now = new Date().toISOString()
      const target: CompanyTarget = {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `company-${Date.now().toString(36)}`,
        name,
        website: website || undefined,
        industry: input.industry?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      }
      try {
        await saveCompanyTarget(target)
        const companyTargets = await listCompanyTargets()
        set(({ draft }) => ({
          companyTargets,
          companyTargetState: 'idle',
          draft: {
            ...draft,
            company: target.name,
            companyWebsite: target.website ?? '',
            companyIndustry: target.industry ?? '',
            selectedCompanyTargetId: target.id,
          },
        }))
        return target
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '企业信息保存失败'
        set({ companyTargetState: 'failed', companyTargetError: message })
        throw new Error(message)
      }
    },
    selectCompanyTarget: (id) =>
      set(({ companyTargets, draft }) => {
        const target = companyTargets.find((item) => item.id === id)
        return target
          ? {
              draft: {
                ...draft,
                company: target.name,
                companyWebsite: target.website ?? '',
                companyIndustry: target.industry ?? '',
                selectedCompanyTargetId: target.id,
              },
            }
          : {}
      }),
    deleteCompanyTarget: async (id) => {
      ++companyTargetsLoadToken
      set({
        companyTargetState: 'deleting',
        activeCompanyTargetId: id,
        companyTargetError: undefined,
      })
      try {
        await removeCompanyTarget(id)
        const companyTargets = await listCompanyTargets()
        set(({ draft }) => ({
          companyTargets,
          companyTargetState: 'idle',
          activeCompanyTargetId: undefined,
          draft:
            draft.selectedCompanyTargetId === id
              ? {
                  ...draft,
                  company: '',
                  companyWebsite: '',
                  companyIndustry: '',
                  selectedCompanyTargetId: undefined,
                }
              : draft,
        }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '企业信息删除失败'
        set({
          companyTargetState: 'failed',
          activeCompanyTargetId: undefined,
          companyTargetError: message,
        })
        throw new Error(message)
      }
    },
    applySelectedCompanyToRecord: async () => {
      const state = get()
      if (!state.selectedRecord || !state.draft.company.trim()) return
      const analysis =
        typeof state.selectedRecord.analysis === 'object' &&
        state.selectedRecord.analysis !== null
          ? {
              ...state.selectedRecord.analysis,
              company: state.draft.company.trim(),
              role: state.draft.role.trim() || state.selectedRecord.role,
            }
          : state.selectedRecord.analysis
      await state.persistRecord({
        ...state.selectedRecord,
        company: state.draft.company.trim(),
        companyWebsite: state.draft.companyWebsite.trim() || undefined,
        companyIndustry: state.draft.companyIndustry.trim() || undefined,
        companyTargetId: state.draft.selectedCompanyTargetId,
        role: state.draft.role.trim() || state.selectedRecord.role,
        analysis,
        updatedAt: new Date().toISOString(),
      })
    },
    loadRecords: async () => {
      const token = ++recordsLoadToken
      set({ loading: true, error: undefined })
      try {
        const records = await listJdRecords()
        if (token !== recordsLoadToken) return
        set({ records, loading: false })
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : '读取 JD 记录失败',
          loading: false,
        })
      }
    },
    selectRecord: async (id) => {
      set({ loading: true, error: undefined })
      try {
        const selectedRecord = await getJdRecord(id)
        set({
          selectedRecord,
          draft: selectedRecord
            ? {
                company: selectedRecord.company,
                companyWebsite: selectedRecord.companyWebsite ?? '',
                companyIndustry: selectedRecord.companyIndustry ?? '',
                selectedCompanyTargetId: selectedRecord.companyTargetId,
                role: selectedRecord.role,
                jdText: selectedRecord.jdText,
              }
            : emptyDraft,
          loading: false,
        })
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : '读取 JD 记录失败',
          loading: false,
        })
      }
    },
    updateDraft: (change) =>
      set(({ draft }) => ({ draft: { ...draft, ...change } })),
    persistRecord: async (record) => {
      const previous = await getJdRecord(record.id)
      if (
        previous &&
        (previous.company !== record.company ||
          previous.companyWebsite !== record.companyWebsite ||
          previous.companyIndustry !== record.companyIndustry)
      ) {
        await deleteInterviewContextByAnalysisId(record.id)
      }
      await saveJdRecord(record)
      const records = await listJdRecords()
      set({
        records,
        selectedRecord: record,
        draft: {
          company: record.company,
          companyWebsite: record.companyWebsite ?? '',
          companyIndustry: record.companyIndustry ?? '',
          selectedCompanyTargetId: record.companyTargetId,
          role: record.role,
          jdText: record.jdText,
        },
      })
    },
    deleteRecord: async (id) => {
      await deleteJdRecordCascade(id)
      const records = await listJdRecords()
      const selectedRecord =
        get().selectedRecord?.id === id ? undefined : get().selectedRecord
      set({
        records,
        selectedRecord,
        ...(selectedRecord ? {} : { draft: emptyDraft }),
      })
    },
    clearDraft: () =>
      set({ draft: emptyDraft, selectedRecord: undefined, error: undefined }),
  }))
}

export const jdStore = createJdStore()
