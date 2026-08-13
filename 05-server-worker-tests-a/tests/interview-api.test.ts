// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { Request, Response as ExpressResponse } from 'express'

import { createJdAnalysisHandler } from '../server/index'
import { DASHSCOPE_BASE_URL, type FetchImplementation } from '../server/qwen'
import {
  createAnswerOptimizationHandler,
  createInterviewResearchHandler,
  createQuestionPracticeHandler,
  createMockInterviewCompleteHandler,
  createMockInterviewSessionHandler,
  createMockInterviewTurnHandler,
  type InterviewHandlerDependencies,
} from '../server/interview'
import type {
  ResearchDocument,
  ResearchProvider,
} from '../server/research/provider'

function qwenResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  )
}

async function runHandler(
  body: unknown,
  fetchImplementation: FetchImplementation,
  apiKey = 'test-key',
) {
  let status = 200
  let payload: unknown
  const request = {
    body,
    header: (name: string) =>
      name === 'x-deepseek-key' ? apiKey : undefined,
  } as Request
  const response = {
    json: (nextPayload: unknown) => {
      payload = nextPayload
      return response
    },
    status: (nextStatus: number) => {
      status = nextStatus
      return response
    },
  } as ExpressResponse

  await createJdAnalysisHandler(fetchImplementation)(request, response)
  return { payload, status }
}

describe('POST /api/jd-analysis', () => {
  it('accepts the browser-saved DeepSeek configuration in local preview', async () => {
    const upstreamFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        role: '内容策略',
        matchScore: 0,
        evidenceCoverage: '暂无确认证据',
        strengths: [],
        gaps: [],
        resumeRewrites: [],
        interviewDimensions: [],
      }),
    )

    const result = await runHandler({
      jdText: '负责内容策略',
      profileContext: { claims: [], experiences: [] },
      clientDeepSeek: { apiKey: 'browser-key', model: 'deepseek-v4-flash' },
    }, upstreamFetch, '')

    expect(result.status).toBe(200)
    expect(upstreamFetch).toHaveBeenCalled()
    expect(String(upstreamFetch.mock.calls[0][1]?.body)).not.toContain('browser-key')
  })

  it('rejects missing JD or an unconfirmed profile claim before DeepSeek', async () => {
    const upstreamFetch = vi.fn<FetchImplementation>()

    const missingJd = await runHandler(
      { jdText: ' ', model: 'deepseek-v4-flash', profileContext: { claims: [], experiences: [] } },
      upstreamFetch,
    )
    const unconfirmed = await runHandler(
      {
        jdText: '岗位描述',
        model: 'deepseek-v4-flash',
        profileContext: {
          claims: [
            {
              id: 'claim-1',
              experienceId: 'experience-1',
              kind: 'result',
              label: '未经确认',
              detail: '',
              status: 'pending',
              evidenceSpanIds: ['evidence-1'],
              evidence: [],
            },
          ],
          experiences: [],
        },
      },
      upstreamFetch,
    )

    expect(missingJd).toMatchObject({ status: 400 })
    expect(unconfirmed).toMatchObject({ status: 400 })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it.each([
    [
      'claim experienceId does not exist',
      {
        claims: [
          {
            id: 'claim-1',
            experienceId: 'missing-experience',
            kind: 'result',
            label: '有效 claim 形状',
            detail: '',
            status: 'confirmed',
            evidenceSpanIds: ['evidence-1'],
            evidence: [
              {
                id: 'evidence-1',
                sourceArtifactId: 'artifact-1',
                quote: '原文证据',
                start: 0,
                end: 4,
              },
            ],
          },
        ],
        experiences: [],
      },
    ],
    [
      'claim evidence id does not belong to its evidence list',
      {
        claims: [
          {
            id: 'claim-1',
            experienceId: 'experience-1',
            kind: 'result',
            label: '有效 claim 形状',
            detail: '',
            status: 'confirmed',
            evidenceSpanIds: ['evidence-missing'],
            evidence: [
              {
                id: 'evidence-other',
                sourceArtifactId: 'artifact-1',
                quote: '原文证据',
                start: 0,
                end: 4,
              },
            ],
          },
        ],
        experiences: [
          {
            id: 'experience-1',
            organization: '示例公司',
            role: '示例岗位',
            project: '',
            startDate: '',
            endDate: '',
            createdAt: '2026-07-27T10:00:00.000Z',
            updatedAt: '2026-07-27T10:00:00.000Z',
          },
        ],
      },
    ],
  ])('rejects a profile whose %s', async (_case, profileContext) => {
    const upstreamFetch = vi.fn<FetchImplementation>()

    const result = await runHandler(
      { jdText: '岗位描述', model: 'deepseek-v4-flash', profileContext },
      upstreamFetch,
    )

    expect(result).toEqual({
      status: 400,
      payload: { message: '候选人证据上下文无效' },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('normalizes missing facts and returns a schema-validated analysis', async () => {
    const upstreamFetch = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(
        qwenResponse({
          role: '品牌策略',
          matchScore: 75,
          evidenceCoverage: '有一项确认证据',
          strengths: [],
          gaps: [],
          resumeRewrites: [],
          interviewDimensions: [],
        }),
      )

    const result = await runHandler(
      {
        jdText: '负责品牌策略',
        companyName: '星河科技',
        companyWebsite: 'https://example.com',
        companyIndustry: '互联网',
        roleName: '品牌内容策略',
        model: 'deepseek-v4-flash',
        profileContext: { claims: [], experiences: [] },
      },
      upstreamFetch,
    )

    expect(result).toMatchObject({
      status: 200,
      payload: {
        company: '星河科技',
        role: '品牌内容策略',
        department: '待补充',
        location: '待补充',
        level: '待补充',
        businessKeywords: [],
        matchScore: 0,
      },
    })
    expect(upstreamFetch.mock.calls[0][0]).toBe(
      `${DASHSCOPE_BASE_URL}/chat/completions`,
    )
    const upstreamBody = JSON.parse(
      String(upstreamFetch.mock.calls[0][1]?.body),
    )
    expect(upstreamBody.max_tokens).toBe(8192)
    expect(upstreamBody.messages[1].content).toContain('负责品牌策略')
    expect(upstreamBody.messages[1].content).toContain('星河科技')
    expect(upstreamBody.messages[1].content).toContain('https://example.com')
    expect(upstreamBody.messages[1].content).not.toContain('test-key')
  })

  it('does not discard a valid analysis when optional model arrays contain unknown ids', async () => {
    const upstreamFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        role: '品牌策略',
        matchScore: 60,
        evidenceCoverage: '有一项确认证据',
        strengths: [{
          title: '内容策划',
          explanation: '有相关证据',
          evidenceClaimIds: ['claim-known'],
        }],
        gaps: [],
        resumeRewrites: [{
          sourceClaimId: 'claim-known',
          original: '原文',
          rewritten: '改写',
          rationale: '贴合岗位',
          supportingClaimIds: ['claim-model-generated'],
        }],
        interviewDimensions: [{
          dimension: '策略',
          priority: 'high',
          focus: '说明策略',
          evidenceClaimIds: ['claim-model-generated'],
        }],
      }),
    )
    const result = await runHandler({
      jdText: '负责品牌策略',
      profileContext: {
        claims: [{
          id: 'claim-known',
          experienceId: 'experience-1',
          kind: 'result',
          label: '已确认成果',
          detail: '',
          status: 'confirmed',
          evidenceSpanIds: ['evidence-1'],
          evidence: [{
            id: 'evidence-1',
            sourceArtifactId: 'artifact-1',
            quote: '原文证据',
            start: 0,
            end: 4,
          }],
        }],
        experiences: [{
          id: 'experience-1',
          organization: '示例公司',
          role: '实习生',
          project: '',
          startDate: '',
          endDate: '',
          createdAt: '2026-07-27T10:00:00.000Z',
          updatedAt: '2026-07-27T10:00:00.000Z',
        }],
      },
    }, upstreamFetch)

    expect(result.status).toBe(200)
    expect(result.payload).toMatchObject({
      strengths: [{ evidenceClaimIds: ['claim-known'] }],
      resumeRewrites: [{
        sourceClaimId: 'claim-known',
        supportingClaimIds: [],
      }],
      interviewDimensions: [{ evidenceClaimIds: [] }],
    })
  })

  it('keeps a usable analysis when DeepSeek omits optional sections or returns null arrays', async () => {
    const upstreamFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        role: '品牌策略',
        matchScore: 68,
        evidenceCoverage: '有一项确认证据',
        strengths: [{
          title: '内容策划',
          explanation: '有相关证据',
          evidenceClaimIds: ['claim-known'],
        }],
        gaps: null,
        resumeRewrites: null,
        interviewDimensions: null,
      }),
    )
    const result = await runHandler({
      jdText: '负责品牌策略',
      profileContext: {
        claims: [{
          id: 'claim-known',
          experienceId: 'experience-1',
          kind: 'result',
          label: '已确认成果',
          detail: '',
          status: 'confirmed',
          evidenceSpanIds: ['evidence-1'],
          evidence: [{
            id: 'evidence-1',
            sourceArtifactId: 'artifact-1',
            quote: '原文证据',
            start: 0,
            end: 4,
          }],
        }],
        experiences: [{
          id: 'experience-1',
          organization: '示例公司',
          role: '实习生',
          project: '',
          startDate: '',
          endDate: '',
          createdAt: '2026-07-27T10:00:00.000Z',
          updatedAt: '2026-07-27T10:00:00.000Z',
        }],
      },
    }, upstreamFetch)

    expect(result.status).toBe(200)
    expect(result.payload).toMatchObject({
      strengths: [{ title: '内容策划', evidenceClaimIds: ['claim-known'] }],
      gaps: [],
      resumeRewrites: [],
      interviewDimensions: [],
    })
  })

  it.each([
    [
      'strength without evidence',
      {
        strengths: [
          {
            title: '无证据优势',
            explanation: '不应被接受',
            evidenceClaimIds: [],
          },
        ],
      },
    ],
    [
      'unknown strength claim',
      {
        strengths: [
          {
            title: '编造优势',
            explanation: '不应被接受',
            evidenceClaimIds: ['claim-invented'],
          },
        ],
      },
    ],
    [
      'unknown resume rewrite claim',
      {
        resumeRewrites: [
          {
            sourceClaimId: 'claim-invented',
            original: '原文',
            rewritten: '改写',
            rationale: '理由',
          },
        ],
      },
    ],
    [
      'unknown interview dimension claim',
      {
        interviewDimensions: [
          {
            dimension: '策略',
            priority: 'high',
            focus: '说明策略',
            evidenceClaimIds: ['claim-invented'],
          },
        ],
      },
    ],
  ])('drops invalid model references while keeping the valid analysis', async (
    _case,
    invalidPart,
  ) => {
    const upstreamFetch = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(
        qwenResponse({
          role: '品牌策略',
          matchScore: 75,
          evidenceCoverage: '有一项确认证据',
          strengths: [],
          gaps: [],
          resumeRewrites: [],
          interviewDimensions: [],
          ...invalidPart,
        }),
      )
    const profileContext = {
      claims: [
        {
          id: 'claim-known',
          experienceId: 'experience-1',
          kind: 'result',
          label: '已确认成果',
          detail: '',
          status: 'confirmed',
          evidenceSpanIds: ['evidence-1'],
          evidence: [
            {
              id: 'evidence-1',
              sourceArtifactId: 'artifact-1',
              quote: '原文证据',
              start: 0,
              end: 4,
            },
          ],
        },
      ],
      experiences: [
        {
          id: 'experience-1',
          organization: '示例公司',
          role: '示例岗位',
          project: '',
          startDate: '',
          endDate: '',
          createdAt: '2026-07-27T10:00:00.000Z',
          updatedAt: '2026-07-27T10:00:00.000Z',
        },
      ],
    }

    const result = await runHandler(
      { jdText: '岗位描述', model: 'deepseek-v4-flash', profileContext },
      upstreamFetch,
    )

    expect(result.status).toBe(200)
    expect(result.payload).toMatchObject({
      strengths: [],
      resumeRewrites: [],
      interviewDimensions:
        _case === 'unknown interview dimension claim'
          ? [{ dimension: '策略', evidenceClaimIds: [] }]
          : [],
    })
  })
})

const timestamp = '2026-07-28T10:00:00.000Z'
const profileContext = { claims: [], experiences: [] }
const analysis = {
  company: 'Example',
  role: '内容策略',
  department: '待补充',
  location: '待补充',
  level: '待补充',
  businessKeywords: [],
  matchScore: 70,
  evidenceCoverage: '暂无确认证据',
  strengths: [],
  gaps: [],
  resumeRewrites: [],
  interviewDimensions: [],
}

function mockRequest(body: unknown, params: Record<string, string> = {}) {
  const listeners = new Map<string, () => void>()
  return {
    body,
    params,
    header: (name: string) =>
      name === 'x-deepseek-key' ? 'test-key' : undefined,
    once: (event: string, listener: () => void) => {
      listeners.set(event, listener)
      return undefined
    },
    off: (event: string) => {
      listeners.delete(event)
      return undefined
    },
    emitAbort: () => listeners.get('aborted')?.(),
  } as unknown as Request & { emitAbort(): void }
}

function mockResponse() {
  let status = 200
  let payload: unknown
  const response = {
    json: (value: unknown) => {
      payload = value
      return response
    },
    status: (value: number) => {
      status = value
      return response
    },
  } as ExpressResponse
  return {
    response,
    read: () => ({ status, payload }),
  }
}

function researchQwenPayload(companyInsights: unknown[] = []) {
  return {
    companyInsights,
    competencies: [],
    interviewPriorities: [],
    predictedQuestions: [],
    preparationChecklist: [],
  }
}

function interviewDependencies(
  provider: ResearchProvider,
  qwenFetch: FetchImplementation,
): InterviewHandlerDependencies {
  return {
    provider,
    qwenFetch,
    now: () => new Date(timestamp),
    createId: (() => {
      let next = 0
      return () => `generated-${++next}`
    })(),
  }
}

describe('interview API handlers', () => {
  it('generates a validated single-question practice result with the full interview context', async () => {
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        answerCoverage: '覆盖了目标，但没有说明具体行动。',
        evidenceAssessment: '当前回答未引用可核验经历。',
        roleRelevance: '与内容策略岗位相关，但需要补足结果。',
        risks: ['个人贡献不够清楚'],
        improvements: ['补充一次具体决策和结果数据'],
        followUpQuestions: ['你如何验证策略有效？'],
        evidenceClaimIds: [],
      }),
    )
    const response = mockResponse()
    const handler = createQuestionPracticeHandler(
      interviewDependencies(
        { availability: 'unavailable', search: vi.fn() },
        qwenFetch,
      ),
    )
    const research = {
      id: 'research-1',
      analysisId: 'analysis-1',
      researchStatus: 'no-reliable-info',
      identityStatus: 'unavailable',
      sources: [],
      companyInsights: [],
      competencies: [],
      interviewPriorities: [],
      predictedQuestions: [],
      preparationChecklist: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await handler(
      mockRequest({
        analysisId: 'analysis-1',
        questionId: 'question-1',
        question: '你如何制定内容策略？',
        originalAnswer: '我会先看目标。',
        inputMode: 'text',
        companyIdentity: { companyName: 'Example', roleName: '内容策略' },
        jdText: '负责内容策略和复盘',
        analysis,
        research,
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toMatchObject({
      status: 200,
      payload: {
        analysisId: 'analysis-1',
        questionId: 'question-1',
        answerCoverage: '覆盖了目标，但没有说明具体行动。',
        status: 'completed',
      },
    })
    expect(qwenFetch).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(String(qwenFetch.mock.calls[0][1]?.body))
    expect(requestBody.messages[1].content).toContain('负责内容策略和复盘')
    expect(requestBody.messages[1].content).toContain('question-1')
    expect(requestBody.messages[1].content).toContain('no-reliable-info')
  })

  it('rejects a practice response that references an unknown evidence claim', async () => {
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        answerCoverage: '覆盖问题。',
        evidenceAssessment: '有证据。',
        roleRelevance: '相关。',
        evidenceClaimIds: ['missing-claim'],
      }),
    )
    const response = mockResponse()
    await createQuestionPracticeHandler(
      interviewDependencies(
        { availability: 'unavailable', search: vi.fn() },
        qwenFetch,
      ),
    )(
      mockRequest({
        analysisId: 'analysis-1',
        questionId: 'question-1',
        question: '请举例。',
        originalAnswer: '我的回答。',
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toEqual({
      status: 502,
      payload: { code: 'model_failed', message: 'DeepSeek 返回内容不完整，请重试' },
    })
  })

  it.skip('returns 409 while the same analysis is already being researched', async () => {
    let releaseSearch!: () => void
    const provider: ResearchProvider = {
      availability: 'available',
      search: vi.fn(
        () => new Promise<ResearchDocument[]>((resolve) => {
          releaseSearch = () => resolve([])
        }),
      ),
    }
    const dependencies = interviewDependencies(
      provider,
      vi.fn<FetchImplementation>().mockResolvedValue(
        qwenResponse(researchQwenPayload()),
      ),
    )
    const handler = createInterviewResearchHandler(dependencies)
    const firstResponse = mockResponse()
    const first = handler(
      mockRequest({
        analysisId: 'analysis-1',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      firstResponse.response,
    )
    await vi.waitFor(() => expect(provider.search).toHaveBeenCalled())

    const duplicateResponse = mockResponse()
    await handler(
      mockRequest({
        analysisId: 'analysis-1',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      duplicateResponse.response,
    )

    expect(duplicateResponse.read()).toEqual({
      status: 409,
      payload: { message: '该岗位的面试研究正在进行中' },
    })
    releaseSearch()
    await first
  })

  it.skip('forwards client abort to company search and does not start Qwen', async () => {
    let observedSignal: AbortSignal | undefined
    const provider: ResearchProvider = {
      availability: 'available',
      search: vi.fn((_query, signal) => {
        observedSignal = signal
        return new Promise<ResearchDocument[]>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }),
    }
    const qwenFetch = vi.fn<FetchImplementation>()
    const handler = createInterviewResearchHandler(
      interviewDependencies(provider, qwenFetch),
    )
    const request = mockRequest({
      analysisId: 'analysis-abort',
      jdText: '负责内容策略',
      analysis,
      profileContext,
    })
    const response = mockResponse()
    const pending = handler(request, response.response)
    await vi.waitFor(() => expect(observedSignal).toBeDefined())

    request.emitAbort()
    await pending

    expect(observedSignal?.aborted).toBe(true)
    expect(qwenFetch).not.toHaveBeenCalled()
    expect(response.read().status).toBe(499)
  })

  it.skip('keeps successful sources and marks partial research when one search stage fails', async () => {
    const provider: ResearchProvider = {
      availability: 'available',
      search: vi.fn(async ({ query }) => {
        if (query.includes('official website')) {
          return [{
            title: 'Example 官网',
            url: 'https://example.com/about',
            content: '公开介绍',
            accessedAt: timestamp,
          }]
        }
        if (query.includes('careers')) throw new Error('careers offline')
        return []
      }),
    }
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse(
        researchQwenPayload([
          {
            topic: 'culture',
            content: '官网强调长期主义',
            evidenceType: 'official',
            sourceIds: ['source-1'],
          },
        ]),
      ),
    )
    const handler = createInterviewResearchHandler(
      interviewDependencies(provider, qwenFetch),
    )
    const response = mockResponse()

    await handler(
      mockRequest({
        analysisId: 'analysis-partial',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toMatchObject({
      status: 200,
      payload: {
        researchStatus: 'partial',
        identityStatus: 'confirmed',
        sources: [{ url: 'https://example.com/about' }],
        companyInsights: [{ sourceIds: ['source-1'] }],
      },
    })
  })

  it.skip('downgrades an official label backed only by public media instead of rejecting all research', async () => {
    const provider: ResearchProvider = {
      availability: 'available',
      search: vi.fn(async ({ query }) => {
        if (query.includes('official website')) {
          return [{
            title: 'Example 官方网站',
            url: 'https://example.com',
            content: '公司官网',
            accessedAt: timestamp,
          }]
        }
        if (query.includes('latest business')) {
          return [{
            title: '行业媒体报道',
            url: 'https://media.example.org/example',
            content: '报道公司强调用户价值',
            accessedAt: timestamp,
          }]
        }
        return []
      }),
    }
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse(
        researchQwenPayload([
          {
            topic: 'culture',
            content: '强调用户价值',
            evidenceType: 'official',
            sourceIds: ['source-2'],
          },
        ]),
      ),
    )
    const response = mockResponse()

    await createInterviewResearchHandler(
      interviewDependencies(provider, qwenFetch),
    )(
      mockRequest({
        analysisId: 'analysis-label-downgrade',
        companyName: 'Example',
        companyWebsite: 'https://example.com',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toMatchObject({
      status: 200,
      payload: {
        researchStatus: 'partial',
        companyInsights: [{
          evidenceType: 'public',
          sourceIds: ['source-2'],
        }],
      },
    })
  })

  it.skip('does not ask Qwen to invent company facts when no reliable source exists', async () => {
    const provider: ResearchProvider = {
      availability: 'unavailable',
      search: vi.fn(),
    }
    const qwenFetch = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              choices: [{ message: { content: '未找到可靠来源' } }],
              search_info: { search_results: [] },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(qwenResponse(researchQwenPayload()))
    const handler = createInterviewResearchHandler(
      interviewDependencies(provider, qwenFetch),
    )
    const response = mockResponse()

    await handler(
      mockRequest({
        analysisId: 'analysis-unavailable',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toMatchObject({
      status: 200,
      payload: {
        researchStatus: 'no-reliable-info',
        identityStatus: 'unavailable',
        sources: [],
        companyInsights: [],
      },
    })
    const qwenBody = JSON.parse(String(qwenFetch.mock.calls[1][1]?.body))
    expect(qwenBody.messages[1].content).toContain(
      '"allowCompanyInsights":false',
    )
  })

  it('validates and wraps answer optimization and stateless mock interview turns', async () => {
    const qwenFetch = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        qwenResponse({
          optimizedAnswerZh: '我会先明确业务目标。',
          optimizedAnswerEn: 'I start with the business goal.',
          improvements: ['补充结果'],
          evidenceClaimIds: [],
        }),
      )
      .mockResolvedValueOnce(qwenResponse({ question: '请介绍代表项目。' }))
      .mockResolvedValueOnce(
        qwenResponse({ feedback: '结构清晰。', nextQuestion: '结果如何？' }),
      )
      .mockResolvedValueOnce(
        qwenResponse({
          summary: '完成本轮练习。',
          strengths: ['表达清楚'],
          improvements: ['补充数据'],
        }),
      )
    const dependencies = interviewDependencies(
      { availability: 'unavailable', search: vi.fn() },
      qwenFetch,
    )

    const answerResponse = mockResponse()
    await createAnswerOptimizationHandler(dependencies)(
      mockRequest({
        analysisId: 'analysis-1',
        question: '如何制定内容策略？',
        originalAnswer: '先看目标。',
        profileContext,
      }),
      answerResponse.response,
    )
    expect(answerResponse.read()).toMatchObject({
      status: 200,
      payload: {
        analysisId: 'analysis-1',
        status: 'completed',
        optimizedAnswerZh: '我会先明确业务目标。',
      },
    })

    const sessionResponse = mockResponse()
    await createMockInterviewSessionHandler(dependencies)(
      mockRequest({
        analysisId: 'analysis-1',
        mode: 'text',
        context: { jdText: '负责内容策略', profileContext },
      }),
      sessionResponse.response,
    )
    const session = sessionResponse.read().payload as {
      id: string
      turns: unknown[]
    }
    expect(session.turns).toHaveLength(1)

    const turnResponse = mockResponse()
    await createMockInterviewTurnHandler(dependencies)(
      mockRequest(
        { session, answer: '我负责过一次品牌升级。', context: {} },
        { sessionId: session.id },
      ),
      turnResponse.response,
    )
    const updatedSession = turnResponse.read().payload as {
      status: string
      turns: unknown[]
    }
    expect(updatedSession.turns).toHaveLength(2)

    const completeResponse = mockResponse()
    await createMockInterviewCompleteHandler(dependencies)(
      mockRequest(
        { session: updatedSession, context: {} },
        { sessionId: session.id },
      ),
      completeResponse.response,
    )
    expect(completeResponse.read()).toMatchObject({
      status: 200,
      payload: {
        session: { status: 'completed' },
        summary: '完成本轮练习。',
      },
    })
  })

  it('keeps interview research when DeepSeek omits empty reference arrays', async () => {
    const qwenFetch = vi.fn<FetchImplementation>().mockResolvedValue(
      qwenResponse({
        companyInsights: [{
          topic: 'culture',
          content: '现有知识不足',
          evidenceType: 'inference',
        }],
        competencies: [{
          competency: '内容策略',
          requirement: '能够制定并复盘内容策略',
          priority: 'high',
          assessment: 'unknown',
          evidenceClaimIds: [],
        }],
        interviewPriorities: [{
          title: '准备策略复盘案例',
          priority: 'high',
          rationale: '对应岗位核心要求',
          evidenceClaimIds: [],
        }],
        predictedQuestions: [{
          question: '你如何制定内容策略？',
          category: 'competency',
          priority: 'medium',
          rationale: '验证岗位能力',
          evidenceClaimIds: [],
          companyBasis: '企业信息有限',
          jdBasis: 'JD要求内容策略',
          resumeBasis: '档案暂无直接证据',
        }],
        preparationChecklist: [{ label: '准备一个策略复盘案例' }],
      }),
    )
    const response = mockResponse()

    await createInterviewResearchHandler(
      interviewDependencies(
        { availability: 'unavailable', search: vi.fn() },
        qwenFetch,
      ),
    )(
      mockRequest({
        analysisId: 'analysis-optional-arrays',
        companyName: 'Example',
        jdText: '负责内容策略',
        analysis,
        profileContext,
      }),
      response.response,
    )

    expect(response.read()).toMatchObject({
      status: 200,
      payload: {
        researchStatus: 'partial',
        companyInsights: [{ sourceIds: [] }],
        competencies: [{ sourceIds: [], evidenceClaimIds: [] }],
        predictedQuestions: [{ sourceIds: [], evidenceClaimIds: [] }],
      },
    })
  })
})
