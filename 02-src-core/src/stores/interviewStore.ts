import { createStore } from 'zustand/vanilla'

import { aiRequestBody, serviceError } from '../ai/client'
import { readJdAnalysis } from '../ai/interviewParsers'
import { getJdRecord } from '../db/jdRepository'
import {
  getInterviewResearchForRecord,
  listQuestionPracticesByAnalysisId,
  listMockInterviewSessionsByAnalysisId,
  saveAnswerOptimization,
  saveMockInterviewSession,
  saveQuestionPractice,
} from '../db/interviewRepository'
import type {
  AnswerOptimization,
  InterviewResearch,
  JdAnalysis,
  JdRecord,
  MockInterviewSession,
  QuestionPractice,
} from '../domain/types'

export interface InterviewReportData {
  summary: string
  strengths: string[]
  improvements: string[]
}

interface InterviewContext {
  jd: JdRecord
  analysis: JdAnalysis
  research?: InterviewResearch
}

interface InterviewState {
  context?: InterviewContext
  session?: MockInterviewSession
  optimization?: AnswerOptimization
  questionPracticeResult?: QuestionPractice
  questionPractices: QuestionPractice[]
  practiceDraft?: {
    question: string
    answer: string
    inputMode: 'text' | 'voice'
  }
  report?: InterviewReportData
  loading: boolean
  submitting: boolean
  error?: string
  load: (analysisId: string) => Promise<void>
  optimize: (question: string, originalAnswer: string) => Promise<void>
  practiceQuestion: (
    questionId: string,
    question: string,
    originalAnswer: string,
    inputMode: 'text' | 'voice',
  ) => Promise<void>
  start: (mode: 'text' | 'voice', interviewType?: 'hr' | 'business') => Promise<void>
  submit: (answer: string, inputMode: 'text' | 'voice') => Promise<void>
  setStatus: (status: 'active' | 'paused') => Promise<void>
  complete: () => Promise<void>
  resetPractice: () => void
  resetQuestionPractice: () => void
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: aiRequestBody(body as Record<string, unknown>),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw serviceError(payload, '面试服务暂时不可用，请稍后重试')
  }
  return payload as T
}

const contextPayload = (context: InterviewContext) => ({
  companyIdentity: {
    companyName: context.jd.company,
    companyWebsite: context.jd.companyWebsite,
    companyIndustry: context.jd.companyIndustry,
    roleName: context.jd.role,
  },
  jdText: context.jd.jdText,
  analysis: context.analysis,
  research: context.research,
  profileContext: context.jd.profileSnapshot ?? {
    claims: [],
    experiences: [],
  },
})

export function createInterviewStore() {
  return createStore<InterviewState>((set, get) => ({
    loading: false,
    submitting: false,
    questionPractices: [],
    load: async (analysisId) => {
      set({ loading: true, error: undefined })
      try {
        const jd = await getJdRecord(analysisId)
        const [research, sessions, questionPractices] = await Promise.all([
          jd ? getInterviewResearchForRecord(jd) : undefined,
          listMockInterviewSessionsByAnalysisId(analysisId),
          listQuestionPracticesByAnalysisId(analysisId),
        ])
        const analysis = jd ? readJdAnalysis(jd.analysis) : null
        if (!jd || !analysis) throw new Error('未找到可用于模拟面试的 JD 分析')
        const session = sessions.find(({ status }) =>
          ['created', 'active', 'paused'].includes(status),
        )
        set({
          context: { jd, analysis, research },
          session,
          questionPractices,
          questionPracticeResult: undefined,
          loading: false,
        })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '加载面试资料失败',
          loading: false,
        })
      }
    },
    optimize: async (question, originalAnswer) => {
      const { context } = get()
      if (!context) return
      set({ submitting: true, error: undefined })
      try {
        const optimization = await post<AnswerOptimization>(
          '/api/answer-optimization',
          {
            analysisId: context.jd.id,
            question,
            originalAnswer,
            ...contextPayload(context),
          },
        )
        await saveAnswerOptimization(optimization)
        set({ optimization, submitting: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '回答优化失败',
          submitting: false,
        })
      }
    },
    practiceQuestion: async (questionId, question, originalAnswer, inputMode) => {
      const { context } = get()
      if (!context || get().submitting) return
      const resolvedQuestionId = questionId || 'manual-question'
      set({
        submitting: true,
        error: undefined,
        practiceDraft: { question, answer: originalAnswer, inputMode },
      })
      try {
        const practice = await post<QuestionPractice>(
          '/api/mock-interview/question-practice',
          {
            analysisId: context.jd.id,
            questionId: resolvedQuestionId,
            question,
            originalAnswer,
            inputMode,
            ...contextPayload(context),
          },
        )
        await saveQuestionPractice(practice)
        const practices = [
          practice,
          ...get().questionPractices.filter((item) => item.id !== practice.id),
        ]
        set({
          questionPracticeResult: practice,
          questionPractices: practices,
          submitting: false,
        })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '单题点评失败',
          submitting: false,
        })
      }
    },
    start: async (mode, interviewType = 'business') => {
      const { context } = get()
      if (!context) return
      set({ submitting: true, error: undefined, report: undefined })
      try {
        const session = await post<MockInterviewSession>(
          '/api/mock-interview/session',
          {
            analysisId: context.jd.id,
            mode,
            interviewType,
            context: { ...contextPayload(context), interviewType },
          },
        )
        await saveMockInterviewSession(session)
        set({ session, submitting: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '模拟面试启动失败',
          submitting: false,
        })
      }
    },
    submit: async (answer, inputMode) => {
      const { context, session } = get()
      if (!context || !session || get().submitting) return
      const currentIndex = session.turns.findIndex((turn) => !turn.answer)
      const optimistic: MockInterviewSession = {
        ...session,
        status: 'active',
        turns: session.turns.map((turn, index) =>
          index === currentIndex ? { ...turn, answer, inputMode } : turn,
        ),
        updatedAt: new Date().toISOString(),
      }
      await saveMockInterviewSession(optimistic)
      set({ session: optimistic, submitting: true, error: undefined })
      try {
        const updated = await post<MockInterviewSession>(
          `/api/mock-interview/${session.id}/turn`,
          {
            session,
            answer,
            inputMode,
            context: contextPayload(context),
          },
        )
        await saveMockInterviewSession(updated)
        set({ session: updated, submitting: false })
      } catch (error) {
        set({
          session,
          error:
            error instanceof Error
              ? `${error.message}，你的回答已保存在本地，可重试。`
              : '提交失败，你的回答已保存在本地，可重试。',
          submitting: false,
        })
      }
    },
    setStatus: async (status) => {
      const { session } = get()
      if (!session) return
      const updated = {
        ...session,
        status,
        updatedAt: new Date().toISOString(),
      } satisfies MockInterviewSession
      await saveMockInterviewSession(updated)
      set({ session: updated })
    },
    complete: async () => {
      const { context, session } = get()
      if (!context || !session) return
      set({ submitting: true, error: undefined })
      try {
        const result = await post<{
          session: MockInterviewSession
          summary: string
          strengths: string[]
          improvements: string[]
        }>(`/api/mock-interview/${session.id}/complete`, {
          session,
          context: contextPayload(context),
        })
        await saveMockInterviewSession(result.session)
        set({
          session: result.session,
          report: {
            summary: result.summary,
            strengths: result.strengths,
            improvements: result.improvements,
          },
          submitting: false,
        })
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? `${error.message}，面试记录仍保存在本地。`
              : '复盘生成失败，面试记录仍保存在本地。',
          submitting: false,
        })
      }
    },
    resetPractice: () =>
      set({
        session: undefined,
        report: undefined,
        optimization: undefined,
        error: undefined,
      }),
    resetQuestionPractice: () =>
      set({ questionPracticeResult: undefined, practiceDraft: undefined, error: undefined }),
  }))
}

export const interviewStore = createInterviewStore()
