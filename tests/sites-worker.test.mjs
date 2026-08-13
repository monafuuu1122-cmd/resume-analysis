import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import test from 'node:test'

import worker, { qwenTimeout } from '../worker/index.js'

const assets = (calls = []) => ({
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    calls.push(path)
    return new Response(path === '/index.html' ? 'app' : 'missing', {
      status: path === '/index.html' ? 200 : 404,
    })
  },
})

const abortableBlockedFetch = (fallbackMs = 80) => (_url, init = {}) =>
  new Promise((_, reject) => {
    const fallback = setTimeout(
      () => reject(new Error('upstream request did not receive an abort signal')),
      fallbackMs,
    )
    init.signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(fallback)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

test('falls back to the app shell for browser routes', async () => {
  const calls = []
  const response = await worker.fetch(
    new Request('https://example.test/jd-lab/analysis/interview', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets(calls) },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(calls, ['/jd-lab/analysis/interview', '/index.html'])
})

test('keeps static HTML route fallback separate from API JSON routes', async () => {
  const routeCalls = []
  const routeResponse = await worker.fetch(
    new Request('https://example.test/capabilities', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets(routeCalls) },
  )
  assert.equal(routeResponse.status, 200)
  assert.equal(await routeResponse.text(), 'app')
  assert.deepEqual(routeCalls, ['/capabilities', '/index.html'])

  const apiCalls = []
  const apiResponse = await worker.fetch(
    new Request('https://example.test/api/service-status', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets(apiCalls), DEEPSEEK_API_KEY: 'worker-secret' },
  )
  assert.equal(apiResponse.status, 200)
  assert.equal(apiResponse.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await apiResponse.json(), { researchConfigured: true })
  assert.deepEqual(apiCalls, [])
})

test('reports research configuration without exposing a secret', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/service-status'),
    { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
  )
  assert.deepEqual(await response.json(), { researchConfigured: true })
})

test('compacts oversized JD evidence before sending it to DeepSeek', async () => {
  const originalFetch = globalThis.fetch
  let prompt = ''
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init.body))
    prompt = request.messages[1].content
    assert.equal(request.max_tokens, 8192)
    assert.deepEqual(request.thinking, { type: 'disabled' })
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        company: 'Example',
        role: '内容策略',
        department: '待补充',
        location: '待补充',
        level: '待补充',
        businessKeywords: [],
        matchScore: 40,
        evidenceCoverage: '一项证据',
        strengths: [{ title: '内容策划', explanation: '有相关证据', evidenceClaimIds: ['claim-1'] }],
        gaps: [],
        resumeRewrites: [],
        interviewDimensions: [],
      }) } }],
    }), { status: 200 })
  }
  try {
    const longQuote = `已确认项目证据 ${'细节'.repeat(500)}`
    const response = await worker.fetch(
      new Request('https://example.test/api/jd-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jdText: '负责内容策略',
          companyName: 'Example',
          roleName: '内容策略',
          profileContext: {
            claims: [{
              id: 'claim-1',
              experienceId: 'experience-1',
              kind: 'result',
              label: '项目结果',
              detail: longQuote,
              status: 'confirmed',
              evidence: [{ quote: longQuote }],
            }],
            experiences: [{ id: 'experience-1', organization: 'Example', role: '实习生', project: '内容项目' }],
            profileMaterials: [],
          },
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    assert.equal(response.status, 200)
    assert.match(prompt, /已确认项目证据/)
    assert.doesNotMatch(prompt, new RegExp('细节'.repeat(220)))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('uses only the Worker DEEPSEEK_API_KEY and ignores browser credentials', async () => {
  const originalFetch = globalThis.fetch
  let authorization = ''
  globalThis.fetch = async (_url, init) => {
    authorization = String(init.headers.authorization)
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ claims: [] }) } }],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/ai/extract', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'browser-key-must-be-ignored',
        },
        body: JSON.stringify({ content: '负责项目复盘' }),
      }),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
      },
    )
    assert.equal(response.status, 200)
    assert.equal(authorization, 'Bearer worker-secret')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('uses a browser-local Qwen key from the request body without sending it to the model prompt', async () => {
  const originalFetch = globalThis.fetch
  let authorization = ''
  let upstreamBody
  globalThis.fetch = async (_url, init) => {
    authorization = String(init.headers.authorization)
    upstreamBody = JSON.parse(String(init.body))
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ claims: [] }) } }],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/ai/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: '负责项目复盘',
          clientDeepSeek: { apiKey: 'local-secret', model: 'deepseek-v4-flash' },
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    assert.equal(response.status, 200)
    assert.equal(authorization, 'Bearer local-secret')
    assert.equal(JSON.stringify(upstreamBody).includes('local-secret'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects missing Worker Qwen configuration before calling upstream', async () => {
  const originalFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = async () => {
    upstreamCalls += 1
    throw new Error('must not call upstream')
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/career-inspiration', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'legacy-browser-key',
        },
        body: JSON.stringify({
          evidenceUnits: [{ id: 'evidence-1', originalText: '内容策划' }],
        }),
      }),
      { ASSETS: assets() },
    )
    const payload = await response.json()
    assert.equal(response.status, 503)
    assert.equal(payload.code, 'DEEPSEEK_NOT_CONFIGURED')
    assert.equal(payload.message, '智能分析服务尚未完成配置')
    assert.equal(upstreamCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('provides a secret-free Qwen health check with a minimal request', async () => {
  const originalFetch = globalThis.fetch
  let requestBody
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init.body))
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"status":"ok"}' } }],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/ai/health'),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
      },
    )
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(
      {
        provider: payload.provider,
        configured: payload.configured,
        reachable: payload.reachable,
        authenticated: payload.authenticated,
        modelAvailable: payload.modelAvailable,
      },
      {
        provider: 'deepseek',
        configured: true,
        reachable: true,
        authenticated: true,
        modelAvailable: true,
      },
    )
    assert.equal(typeof payload.latencyMs, 'number')
    assert.equal(JSON.stringify(payload).includes('worker-secret'), false)
    assert.deepEqual(requestBody.messages, [
      { role: 'user', content: '只回复 JSON：{"status":"ok"}' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('distinguishes exhausted account quota from an invalid DeepSeek key', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'AllocationQuota.FreeTierOnly',
          message: 'Free quota exhausted.',
        },
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/ai/health'),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
      },
    )
    const payload = await response.json()
    assert.equal(payload.provider, 'deepseek')
    assert.equal(payload.configured, true)
    assert.equal(payload.reachable, true)
    assert.equal(payload.authenticated, true)
    assert.equal(payload.modelAvailable, true)
    assert.equal(payload.errorCode, 'DEEPSEEK_QUOTA_EXHAUSTED')
    assert.equal(typeof payload.latencyMs, 'number')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('falls back to safe task defaults when timeout environment values are invalid', () => {
  assert.equal(qwenTimeout({}, 'jdAnalysis'), 120_000)
  assert.equal(qwenTimeout({}, 'companyResearch'), 120_000)
  assert.equal(qwenTimeout({}, 'careerFit'), 120_000)
  assert.equal(qwenTimeout({}, 'careerInspiration'), 120_000)
  assert.equal(qwenTimeout({}, 'companySearch'), 45_000)
  assert.equal(
    qwenTimeout({ DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_TURN_MS: 'not-a-number' }, 'mockInterviewTurn'),
    30_000,
  )
  assert.equal(
    qwenTimeout({ DEEPSEEK_TIMEOUT_INTERVIEW_REPORT_MS: '9999999' }, 'interviewReport'),
    90_000,
  )
})

test('uses the Worker DeepSeek key for model-knowledge company research', async () => {
  const originalFetch = globalThis.fetch
  const searchRequests = []
  const analysisRequests = []
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/text-generation/generation')) {
      searchRequests.push(JSON.parse(String(init.body)))
      return new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: 'Example 官网强调用户价值。' } }],
            search_info: {
              search_results: [
                {
                  title: 'Example 官方网站',
                  url: 'https://example.com/about',
                },
              ],
            },
          },
        }),
        { status: 200 },
      )
    }
    if (String(url) === 'https://example.com/about') {
      return new Response('<main>Example 官方网站介绍公司长期坚持用户价值、跨团队协作、持续创新与结果导向的人才文化和工作方式。</main>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    analysisRequests.push(JSON.parse(String(init.body)))
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                companyInsights: [
                  {
                    topic: 'culture',
                    content: '强调用户价值',
                    evidenceType: 'official',
                    sourceIds: ['source-1'],
                  },
                ],
                competencies: [],
                interviewPriorities: [],
                predictedQuestions: [],
                preparationChecklist: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/interview-research', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
        },
        body: JSON.stringify({
          analysisId: 'analysis-1',
          companyName: 'Example',
          companyWebsite: 'https://example.com',
          companyIndustry: 'Technology',
          roleName: '内容策略',
          jdText: '负责内容策略',
          model: 'deepseek-v4-flash',
          analysis: {
            company: '错误模型结果',
            role: '内容策略',
            department: '待补充',
            location: '待补充',
            level: '校招',
          },
          profileContext: { claims: [], experiences: [] },
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.researchStatus, 'completed')
    assert.equal(payload.identityStatus, 'confirmed')
    assert.deepEqual(payload.sources, [])
    assert.deepEqual(payload.companyInsights[0].sourceIds, [])
    assert.equal(payload.companyInsights[0].evidenceType, 'inference')
    assert.equal(searchRequests.length, 0)
    assert.equal(analysisRequests.length, 1)
    const prompt = analysisRequests[0].messages[1].content
    assert.match(prompt, /Example/)
    assert.doesNotMatch(prompt, /错误模型结果/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('labels company knowledge as inference without fabricated sources', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/text-generation/generation')) {
      const prompt = JSON.parse(String(init.body)).input.messages[0].content
      const isIndustry = /最新业务|年报|ESG|项目报告/.test(prompt)
      return new Response(JSON.stringify({
        output: {
          choices: [{ message: { content: isIndustry ? '行业公开报道' : 'Example 官网' } }],
          search_info: {
            search_results: [{
              title: isIndustry ? '行业公开报道' : 'Example 官方网站',
              url: isIndustry
                ? 'https://media.example.org/example'
                : 'https://example.com/about',
            }],
          },
        },
      }), { status: 200 })
    }
    if (String(url).includes('example.com/about')) {
      return new Response('<main>Example 公司官网介绍。</main>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    if (String(url).includes('media.example.org')) {
      return new Response('<main>行业媒体报道公司强调用户价值。</main>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        companyInsights: [{
          topic: 'culture',
          content: '强调用户价值',
          evidenceType: 'official',
          sourceIds: ['source-2'],
        }],
        competencies: [],
        interviewPriorities: [],
        predictedQuestions: [],
        preparationChecklist: [],
      }) } }],
    }), { status: 200 })
  }
  try {
    const response = await worker.fetch(new Request(
      'https://example.test/api/interview-research',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analysisId: 'analysis-public-label',
          companyName: 'Example',
          companyWebsite: 'https://example.com',
          roleName: '内容策略',
          jdText: '负责内容策略',
          analysis: { role: '内容策略' },
          profileContext: { claims: [], experiences: [] },
        }),
      },
    ), { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' })
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.researchStatus, 'completed')
    assert.ok(payload.companyInsights?.length, JSON.stringify(payload))
    assert.equal(payload.companyInsights[0].evidenceType, 'inference')
    assert.deepEqual(payload.companyInsights[0].sourceIds, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('labels empty DeepSeek company knowledge as no reliable information', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/text-generation/generation')) {
      return new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: '未找到可靠来源' } }],
            search_info: { search_results: [] },
          },
        }),
        { status: 200 },
      )
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                companyInsights: [],
                competencies: [],
                interviewPriorities: [],
                predictedQuestions: [],
                preparationChecklist: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/interview-research', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
        },
        body: JSON.stringify({
          analysisId: 'analysis-empty',
          jdText: '负责内容策略',
          model: 'deepseek-v4-flash',
          analysis: {
            company: 'Example',
            role: '内容策略',
            department: '待补充',
            location: '待补充',
            level: '校招',
          },
          profileContext: { claims: [], experiences: [] },
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.researchStatus, 'no-reliable-info')
    assert.equal(payload.sources.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generates a non-predefined career direction from evidence ids', async () => {
  const originalFetch = globalThis.fetch
  let upstreamBody
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init.body))
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              profileSummary: {
                recurringWorkPatterns: ['内容与现场执行'],
                coreCapabilities: ['流程设计'],
                transferableCapabilities: ['内容适配'],
                domainAssets: ['传播'],
                interestSignals: [],
              },
              directions: [{
                name: '雇主品牌',
                category: '组织传播',
                directionType: 'adjacent',
                fitScore: 65,
                confidence: 'medium',
                summary: '将传播能力迁移到组织人才沟通。',
                whySuitable: '具有内容与执行证据。',
                matchedEvidenceIds: ['evidence-1'],
                transferableCapabilities: ['内容适配'],
                evidenceGaps: ['内部传播案例'],
                differenceFromExisting: '面向人才与组织。',
                transitionDifficulty: 'medium',
                possibleTitles: ['雇主品牌专员'],
                nextActions: ['拆解岗位 JD'],
                searchKeywords: ['雇主品牌 校招'],
              }],
            }),
          },
        }],
      }),
      { status: 200 },
    )
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/career-inspiration', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          savedDirections: [],
          excludedDirections: [],
          evidenceUnits: [{
            id: 'evidence-1',
            sourceLabel: '赛事项目',
            evidenceType: 'action',
            originalText: '参与直播脚本与流程测试',
            project: '完整项目档案'.repeat(1000),
            normalizedDescription: '内容和现场执行',
            capabilities: ['内容适配'],
            domains: ['传播'],
            tools: [],
            stakeholders: [],
            confidence: 'high',
          }],
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.status, 'completed')
    assert.equal(payload.directions[0].name, '雇主品牌')
    assert.deepEqual(payload.directions[0].matchedEvidenceIds, ['evidence-1'])
    const promptInput = JSON.parse(upstreamBody.messages[1].content)
    assert.equal(promptInput.evidenceUnits[0].project, undefined)
    assert.ok(promptInput.messages === undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generates model-knowledge market requirements for one career direction', async () => {
  const originalFetch = globalThis.fetch
  const searchBodies = []
  const analysisBodies = []
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/text-generation/generation')) {
      searchBodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({
        output: {
          choices: [{ message: { content: 'AI 产品运营岗位通常负责需求分析和数据复盘。' } }],
          search_info: { search_results: [{
            title: 'AI 产品运营招聘页',
            url: 'https://jobs.example.com/ai-product-ops',
          }] },
        },
      }), { status: 200 })
    }
    analysisBodies.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        requirements: [{
          requirement: '能够完成需求分析和数据复盘',
          category: 'responsibility',
          importance: 'high',
          sourceIds: ['source-1'],
          evidenceIds: ['claim-1:span-1'],
          evidenceExcerpts: ['梳理用户反馈并形成建议'],
          matchReason: '已有用户反馈归纳经验',
          matchStatus: 'basic-match',
          preparationAdvice: '准备需求取舍案例',
        }],
        capabilityGaps: [],
        mindsetGaps: [],
      }) } }],
    }), { status: 200 })
  }
  try {
    const response = await worker.fetch(new Request(
      'https://example.test/api/career-direction-analysis',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          directionId: 'direction-1',
          directionName: 'AI 产品 / 产品运营',
          possibleTitles: ['AI 产品运营'],
          evidenceUnits: [{
            id: 'claim-1:span-1',
            sourceLabel: '用户研究项目',
            originalText: '梳理用户反馈并形成建议',
            organization: '示例公司',
            role: '产品运营',
            project: '完整项目档案'.repeat(1000),
          }],
        }),
      },
    ), { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.status, 'completed')
    assert.equal(payload.requirements[0].evidenceIds[0], 'claim-1:span-1')
    assert.deepEqual(payload.requirements[0].sourceIds, [])
    assert.equal(payload.knowledgeMode, 'model-knowledge')
    assert.equal(searchBodies.length, 0)
    assert.deepEqual(analysisBodies[0].thinking, { type: 'disabled' })
    const promptInput = JSON.parse(analysisBodies[0].messages[1].content)
    assert.equal(promptInput.evidenceUnits[0].project, undefined)
    assert.ok(analysisBodies[0].messages[1].content.length < 5_000)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('times out every chat-completion task through the unified DeepSeek gateway', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = abortableBlockedFetch()
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/ai/extract', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
          'x-request-id': 'request-timeout-chat',
        },
        body: JSON.stringify({ content: '负责活动复盘', model: 'deepseek-v4-flash' }),
      }),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_TIMEOUT_RESUME_EXTRACTION_MS: '10',
      },
    )
    const payload = await response.json()
    assert.equal(response.status, 504)
    assert.deepEqual(payload, {
      code: 'DEEPSEEK_TIMEOUT',
      taskName: 'resumeExtraction',
      requestId: 'request-timeout-chat',
      timeoutMs: 10,
      retryable: true,
      message: '本次生成等待时间过长，已自动停止。你可以重新尝试，已完成的内容不会丢失。',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applies the same timeout gateway to DeepSeek company research', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = abortableBlockedFetch()
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/interview-research', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
          'x-request-id': 'request-timeout-search',
        },
        body: JSON.stringify({
          analysisId: 'analysis-timeout',
          companyName: 'Example',
          roleName: '内容策略',
          jdText: '负责内容策略',
          model: 'deepseek-v4-flash',
          analysis: { company: 'Example', role: '内容策略' },
          profileContext: { claims: [], experiences: [] },
        }),
      }),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_TIMEOUT_COMPANY_RESEARCH_MS: '10',
      },
    )
    const payload = await response.json()
    assert.equal(response.status, 504)
    assert.equal(payload.code, 'DEEPSEEK_TIMEOUT')
    assert.equal(payload.taskName, 'companyResearch')
    assert.equal(payload.requestId, 'request-timeout-search')
    assert.equal(payload.timeoutMs, 10)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('returns a typed error when model-knowledge company synthesis fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/text-generation/generation')) {
      return new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: 'Example 官网信息' } }],
            search_info: {
              search_results: [
                { title: 'Example 官网', url: 'https://example.com/about' },
              ],
            },
          },
        }),
        { status: 200 },
      )
    }
    if (String(url) === 'https://example.com/about') {
      return new Response('<main>Example 官方公司介绍与人才理念</main>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response('upstream failed', { status: 502 })
  }
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/interview-research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analysisId: 'analysis-partial',
          companyName: 'Example',
          roleName: '内容策略',
          jdText: '负责内容策略',
          analysis: { company: 'Example', role: '内容策略' },
          profileContext: { claims: [], experiences: [] },
        }),
      }),
      { ASSETS: assets(), DEEPSEEK_API_KEY: 'worker-secret' },
    )
    const payload = await response.json()
    assert.equal(response.status, 502)
    assert.equal(payload.code, 'DEEPSEEK_NETWORK_ERROR')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('propagates client cancellation to DeepSeek and distinguishes it from timeout', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = abortableBlockedFetch()
  const controller = new AbortController()
  try {
    const responsePromise = worker.fetch(
      new Request('https://example.test/api/mock-interview/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
          'x-request-id': 'request-user-abort',
        },
        body: JSON.stringify({
          analysisId: 'analysis-abort',
          mode: 'text',
          context: {},
        }),
        signal: controller.signal,
      }),
      {
        ASSETS: assets(),
        DEEPSEEK_API_KEY: 'worker-secret',
        DEEPSEEK_TIMEOUT_DEFAULT_MS: '1000',
      },
    )
    setTimeout(() => controller.abort(), 5)
    const response = await responsePromise
    const payload = await response.json()
    assert.equal(response.status, 499)
    assert.equal(payload.code, 'DEEPSEEK_ABORTED')
    assert.equal(payload.taskName, 'mockInterviewStart')
    assert.equal(payload.requestId, 'request-user-abort')
    assert.equal(payload.retryable, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('emits the files required by Sites packaging', async () => {
  await access(new URL('../dist/client/index.html', import.meta.url))
  await access(new URL('../dist/server/index.js', import.meta.url))
  await access(new URL('../dist/.openai/hosting.json', import.meta.url))
})
