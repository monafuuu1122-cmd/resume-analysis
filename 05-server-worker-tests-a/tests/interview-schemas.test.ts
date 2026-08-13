import { describe, expect, it } from 'vitest'

import {
  answerOptimizationSchema,
  interviewResearchSchema,
  mockInterviewSessionSchema,
  questionPracticeSchema,
} from '../src/domain/interviewSchemas'

const timestamp = '2026-07-28T10:00:00.000Z'

const validResearch = {
  id: 'research-1',
  analysisId: 'analysis-1',
  researchStatus: 'completed',
  identityStatus: 'confirmed',
  sources: [
    {
      id: 'source-1',
      title: '示例公司官网',
      url: 'https://example.com/about',
      content: '公司公开介绍',
      sourceType: 'official_website',
      accessedAt: timestamp,
    },
  ],
  companyInsights: [
    {
      id: 'insight-1',
      topic: 'culture',
      content: '官网强调长期主义。',
      evidenceType: 'official',
      sourceIds: ['source-1'],
    },
  ],
  competencies: [
    {
      id: 'competency-1',
      competency: '内容策略',
      requirement: '能够独立制定内容策略',
      priority: 'high',
      assessment: 'match',
      evidenceClaimIds: ['claim-1'],
      sourceIds: ['source-1'],
    },
  ],
  interviewPriorities: [
    {
      id: 'priority-1',
      title: '准备策略复盘案例',
      priority: 'high',
      rationale: 'JD 强调策略能力',
      evidenceClaimIds: ['claim-1'],
    },
  ],
  predictedQuestions: [
    {
      id: 'question-1',
      question: '你如何制定内容策略？',
      category: 'competency',
      priority: 'high',
      rationale: '对应核心能力要求',
      evidenceClaimIds: ['claim-1'],
      sourceIds: ['source-1'],
    },
  ],
  preparationChecklist: [
    {
      id: 'check-1',
      label: '准备一个内容策略复盘案例',
      completed: false,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
} as const

describe('interview research schemas', () => {
  it('accepts sourced research, competency, and predicted-question records', () => {
    expect(interviewResearchSchema.parse(validResearch)).toEqual(validResearch)
  })

  it('rejects a malformed source URL', () => {
    expect(() =>
      interviewResearchSchema.parse({
        ...validResearch,
        sources: [{ ...validResearch.sources[0], url: 'unknown-url' }],
      }),
    ).toThrow()
  })

  it('rejects official information without a source', () => {
    expect(() =>
      interviewResearchSchema.parse({
        ...validResearch,
        companyInsights: [
          { ...validResearch.companyInsights[0], sourceIds: [] },
        ],
      }),
    ).toThrow()
  })

  it('rejects official information linked only to a public source', () => {
    expect(() =>
      interviewResearchSchema.parse({
        ...validResearch,
        sources: [
          {
            ...validResearch.sources[0],
            sourceType: 'industry_media',
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects invalid research and identity statuses', () => {
    expect(() =>
      interviewResearchSchema.parse({
        ...validResearch,
        researchStatus: 'done',
      }),
    ).toThrow()
    expect(() =>
      interviewResearchSchema.parse({
        ...validResearch,
        identityStatus: 'guessed',
      }),
    ).toThrow()
  })
})

describe('mock interview schemas', () => {
  it('accepts a session with interview turns', () => {
    const session = {
      id: 'session-1',
      analysisId: 'analysis-1',
      mode: 'text',
      interviewType: 'hr',
      status: 'active',
      turns: [
        {
          id: 'turn-1',
          sequence: 1,
          question: '请介绍一个代表项目。',
          answer: '我负责过品牌内容策略。',
          inputMode: 'text',
          createdAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    expect(mockInterviewSessionSchema.parse(session)).toEqual(session)
  })

  it('normalizes old sessions without an interview type to business', () => {
    const parsed = mockInterviewSessionSchema.parse({
      id: 'legacy-session',
      analysisId: 'analysis-1',
      mode: 'text',
      status: 'active',
      turns: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    expect(parsed.interviewType).toBe('business')
  })

  it('accepts classified interview turns and question-practice results', () => {
    const turn = {
      id: 'turn-2',
      sequence: 1,
      question: '请说明一次跨团队协作。',
      answer: '我协调了内容与设计团队。',
      inputMode: 'voice',
      questionType: 'behavioral',
      focusDimension: '跨团队协作',
      followUpReason: '需要核实个人贡献',
      createdAt: timestamp,
    }
    expect(mockInterviewSessionSchema.parse({
      id: 'session-2',
      analysisId: 'analysis-1',
      mode: 'voice',
      interviewType: 'business',
      status: 'active',
      turns: [turn],
      createdAt: timestamp,
      updatedAt: timestamp,
    }).turns[0]).toMatchObject(turn)

    const practice = questionPracticeSchema.parse({
      id: 'practice-1',
      analysisId: 'analysis-1',
      questionId: 'question-1',
      question: '你如何制定内容策略？',
      originalAnswer: '先看目标。',
      answerCoverage: '覆盖了目标设定，但未说明方法。',
      evidenceAssessment: '有相关经历，但缺少可核验结果。',
      roleRelevance: '与岗位的内容策略要求直接相关。',
      risks: ['个人贡献不够清晰'],
      improvements: ['补充具体决策与结果'],
      followUpQuestions: ['你如何验证策略有效？'],
      evidenceClaimIds: ['claim-1'],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(practice.inputMode).toBe('text')
    expect(practice.status).toBe('completed')
  })

  it('rejects invalid session and turn states', () => {
    expect(() =>
      mockInterviewSessionSchema.parse({
        id: 'session-1',
        analysisId: 'analysis-1',
        mode: 'text',
        status: 'paused',
        turns: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).not.toThrow()
    expect(() =>
      mockInterviewSessionSchema.parse({
        id: 'session-1',
        analysisId: 'analysis-1',
        mode: 'text',
        status: 'sleeping',
        turns: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toThrow()
    expect(() =>
      mockInterviewSessionSchema.parse({
        id: 'session-1',
        analysisId: 'analysis-1',
        mode: 'text',
        status: 'active',
        turns: [
          {
            id: 'turn-1',
            sequence: 0,
            question: '问题',
            answer: '回答',
            inputMode: 'recording',
            createdAt: timestamp,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toThrow()
  })
})

it('accepts answer optimization records and rejects invalid status', () => {
  const optimization = {
    id: 'optimization-1',
    analysisId: 'analysis-1',
    question: '你如何制定内容策略？',
    originalAnswer: '先看目标。',
    optimizedAnswerZh: '我会先明确业务目标，再制定内容策略。',
    optimizedAnswerEn:
      'I start with the business goal and then build the content strategy.',
    improvements: ['补充方法和结果'],
    evidenceClaimIds: ['claim-1'],
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  expect(answerOptimizationSchema.parse(optimization)).toEqual(optimization)
  expect(() =>
    answerOptimizationSchema.parse({ ...optimization, status: 'done' }),
  ).toThrow()
})
