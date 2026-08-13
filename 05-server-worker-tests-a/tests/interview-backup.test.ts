import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

import type {
  AnswerOptimization,
  InterviewResearch,
  MockInterviewSession,
  QuestionPractice,
} from '../src/domain/types'
import { createBackup, parseBackup, parseBackupV2 } from '../src/db/backup'
import { db } from '../src/db/database'
import {
  getInterviewResearchByAnalysisId,
  listAnswerOptimizationsByAnalysisId,
  listMockInterviewSessionsByAnalysisId,
  saveAnswerOptimization,
  saveInterviewResearch,
  saveMockInterviewSession,
} from '../src/db/interviewRepository'

const timestamp = '2026-07-28T10:00:00.000Z'

const research: InterviewResearch = {
  id: 'research-1',
  analysisId: 'analysis-1',
  researchStatus: 'completed',
  identityStatus: 'confirmed',
  sources: [],
  companyInsights: [],
  competencies: [],
  interviewPriorities: [],
  predictedQuestions: [],
  preparationChecklist: [],
  createdAt: timestamp,
  updatedAt: timestamp,
}

const session: MockInterviewSession = {
  id: 'session-1',
  analysisId: 'analysis-1',
  mode: 'text',
  interviewType: 'business',
  status: 'active',
  turns: [],
  createdAt: timestamp,
  updatedAt: timestamp,
}

const questionPractice: QuestionPractice = {
  id: 'practice-1',
  analysisId: 'analysis-1',
  questionId: 'question-1',
  question: '为什么适合这个岗位？',
  originalAnswer: '我有相关经验。',
  inputMode: 'text',
  answerCoverage: '回答了经历相关性，但缺少结果。',
  evidenceAssessment: '有一段可用经历证据。',
  roleRelevance: '对应岗位的内容策略要求。',
  risks: ['个人贡献不够清楚'],
  improvements: ['补充行动和结果'],
  followUpQuestions: ['你具体负责了哪一部分？'],
  evidenceClaimIds: ['claim-1'],
  status: 'completed',
  createdAt: timestamp,
  updatedAt: timestamp,
}

const optimization: AnswerOptimization = {
  id: 'optimization-1',
  analysisId: 'analysis-1',
  question: '为什么适合这个岗位？',
  originalAnswer: '我有相关经验。',
  optimizedAnswerZh: '我的内容策略经验能够对应岗位的核心要求。',
  optimizedAnswerEn:
    'My content strategy experience maps directly to the core role requirements.',
  improvements: ['补充与岗位要求的关联'],
  evidenceClaimIds: ['claim-1'],
  status: 'completed',
  createdAt: timestamp,
  updatedAt: timestamp,
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
})

describe('Dexie v2 interview persistence', () => {
  it('persists and queries interview records by analysisId', async () => {
    await saveInterviewResearch(research)
    await saveMockInterviewSession(session)
    await saveAnswerOptimization(optimization)

    expect(await getInterviewResearchByAnalysisId('analysis-1')).toEqual(
      research,
    )
    expect(await listMockInterviewSessionsByAnalysisId('analysis-1')).toEqual([
      session,
    ])
    expect(await listAnswerOptimizationsByAnalysisId('analysis-1')).toEqual([
      optimization,
    ])
  })

  it('upgrades a v1 database without rewriting existing records', async () => {
    db.close()
    await db.delete()

    const legacyDb = new Dexie('offer-adventure')
    legacyDb.version(1).stores({
      experiences: 'id, organization, role, updatedAt',
      sourceArtifacts: 'id, experienceId, createdAt',
      evidenceSpans: 'id, sourceArtifactId',
      claims: 'id, experienceId, kind, status',
      jdRecords: 'id, company, role, updatedAt',
    })
    await legacyDb.open()
    const legacyJd = {
      id: 'legacy-jd',
      company: '旧公司',
      role: '旧岗位',
      jdText: '旧 JD',
      analysis: { legacy: true },
      updatedAt: timestamp,
    }
    await legacyDb.table('jdRecords').put(legacyJd)
    legacyDb.close()

    await db.open()

    expect(await db.jdRecords.get('legacy-jd')).toEqual(legacyJd)
    expect(db.tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'interviewResearch',
        'mockInterviewSessions',
        'answerOptimizations',
        'profileMaterials',
      ]),
    )
  })

  it('upgrades a v2 database without rewriting existing records', async () => {
    db.close()
    await db.delete()

    const legacyDb = new Dexie('offer-adventure')
    legacyDb.version(2).stores({
      experiences: 'id, organization, role, updatedAt',
      sourceArtifacts: 'id, experienceId, createdAt',
      evidenceSpans: 'id, sourceArtifactId',
      claims: 'id, experienceId, kind, status',
      jdRecords: 'id, company, role, updatedAt',
      interviewResearch: 'id, analysisId, researchStatus, updatedAt',
      mockInterviewSessions: 'id, analysisId, mode, status, updatedAt',
      answerOptimizations: 'id, analysisId, updatedAt',
    })
    await legacyDb.open()
    await legacyDb.table('experiences').put({
      id: 'legacy-experience',
      organization: '旧组织',
      role: '旧角色',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    legacyDb.close()

    await db.open()

    expect(await db.experiences.get('legacy-experience')).toMatchObject({
      organization: '旧组织',
      role: '旧角色',
    })
    expect(db.tables.map(({ name }) => name)).toContain('profileMaterials')
    expect(await db.table('profileMaterials').toArray()).toEqual([])
  })
})

describe('interview backup v2', () => {
  it('reads v1 backups and normalizes missing interview arrays', () => {
    const parsed = parseBackupV2(
      JSON.stringify({
        version: 1,
        exportedAt: timestamp,
        experiences: [],
        sourceArtifacts: [],
        evidenceSpans: [],
        claims: [],
        jdRecords: [],
      }),
    )

    expect(parsed).toMatchObject({
      version: 2,
      interviewResearch: [],
      mockInterviewSessions: [],
      answerOptimizations: [],
      questionPractices: [],
      profileMaterials: [],
      analysisJobs: [],
    })
  })

  it('reads legacy v2 backups without independent profile materials', () => {
    const parsed = parseBackupV2(
      JSON.stringify({
        version: 2,
        exportedAt: timestamp,
        experiences: [],
        sourceArtifacts: [],
        evidenceSpans: [],
        claims: [],
        jdRecords: [],
        interviewResearch: [],
        mockInterviewSessions: [],
      answerOptimizations: [],
      questionPractices: [],
      }),
    )

    expect(parsed.profileMaterials).toEqual([])
    expect(parsed.analysisJobs).toEqual([])
  })

  it('exports a validated v2 backup with interview records', async () => {
    await saveInterviewResearch(research)
    await saveMockInterviewSession(session)
    await saveAnswerOptimization(optimization)

    const backup = await createBackup(timestamp)

    expect(backup).toMatchObject({
      version: 2,
      exportedAt: timestamp,
      interviewResearch: [research],
      mockInterviewSessions: [session],
      answerOptimizations: [optimization],
      questionPractices: [],
      profileMaterials: [],
      analysisJobs: [],
    })
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
  })
})
