const DASHSCOPE_URL =
  'https://api.deepseek.com/chat/completions'
const DASHSCOPE_SEARCH_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/

const DEEPSEEK_TIMEOUTS = Object.freeze({
  resumeExtraction: 45_000,
  jdAnalysis: 120_000,
  companySearch: 45_000,
  companyResearch: 120_000,
  careerFit: 120_000,
  careerInspiration: 120_000,
  answerOptimization: 45_000,
  mockInterviewStart: 45_000,
  mockInterviewTurn: 30_000,
  interviewReport: 90_000,
  health: 10_000,
  default: 45_000,
})

const DEEPSEEK_TIMEOUT_ENV = Object.freeze({
  resumeExtraction: 'DEEPSEEK_TIMEOUT_RESUME_EXTRACTION_MS',
  jdAnalysis: 'DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS',
  companyResearch: 'DEEPSEEK_TIMEOUT_COMPANY_RESEARCH_MS',
  companySearch: 'DEEPSEEK_TIMEOUT_COMPANY_SEARCH_MS',
  careerFit: 'DEEPSEEK_TIMEOUT_CAREER_FIT_MS',
  careerInspiration: 'DEEPSEEK_TIMEOUT_CAREER_INSPIRATION_MS',
  answerOptimization: 'DEEPSEEK_TIMEOUT_ANSWER_OPTIMIZATION_MS',
  mockInterviewStart: 'DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_START_MS',
  mockInterviewTurn: 'DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_TURN_MS',
  interviewReport: 'DEEPSEEK_TIMEOUT_INTERVIEW_REPORT_MS',
  health: 'DEEPSEEK_TIMEOUT_HEALTH_MS',
  default: 'DEEPSEEK_TIMEOUT_DEFAULT_MS',
})

const DEEPSEEK_MAX_TOKENS = 8192

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const text = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback
const list = (value) => (Array.isArray(value) ? value : [])
const compactPromptText = (value, maxLength) => {
  const normalized = text(value).replace(/\s+/gu, ' ')
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized
}
const compactCareerEvidenceUnits = (units) => list(units).map((unit) => ({
  id: compactPromptText(unit?.id, 140),
  sourceLabel: compactPromptText(unit?.sourceLabel, 100),
  evidenceType: compactPromptText(unit?.evidenceType, 40),
  originalText: compactPromptText(unit?.originalText, 360),
  normalizedDescription: compactPromptText(unit?.normalizedDescription, 360),
  capabilities: list(unit?.capabilities).map((value) => compactPromptText(value, 60)).filter(Boolean).slice(0, 8),
  domains: list(unit?.domains).map((value) => compactPromptText(value, 60)).filter(Boolean).slice(0, 8),
  tools: list(unit?.tools).map((value) => compactPromptText(value, 60)).filter(Boolean).slice(0, 8),
  stakeholders: list(unit?.stakeholders).map((value) => compactPromptText(value, 60)).filter(Boolean).slice(0, 8),
  measurableResult: compactPromptText(unit?.measurableResult, 360),
  personalContribution: compactPromptText(unit?.personalContribution, 360),
  confidence: compactPromptText(unit?.confidence, 20),
}))
const enumValue = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()

async function body(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function qwenConfig(env) {
  const apiKey = text(env?.__REQUEST_DEEPSEEK_API_KEY) || text(env?.DEEPSEEK_API_KEY)
  const model =
    text(env?.__REQUEST_DEEPSEEK_MODEL) || text(env?.DEEPSEEK_MODEL, 'deepseek-v4-flash')
  return {
    apiKey,
    model,
    configured: Boolean(apiKey && MODEL_PATTERN.test(model)),
  }
}

function requestQwenContext(env, rawPayload) {
  const payload = { ...(rawPayload ?? {}) }
  const clientDeepSeek = payload.clientDeepSeek
  delete payload.clientDeepSeek
  const apiKey = text(clientDeepSeek?.apiKey)
  const model = text(clientDeepSeek?.model, 'deepseek-v4-flash')
  if (!apiKey || !MODEL_PATTERN.test(model)) {
    return { env, payload }
  }
  return {
    env: {
      ...env,
      __REQUEST_DEEPSEEK_API_KEY: apiKey,
      __REQUEST_DEEPSEEK_MODEL: model,
    },
    payload,
  }
}

function qwenTimeout(env, taskName) {
  const fallback = DEEPSEEK_TIMEOUTS[taskName] ?? DEEPSEEK_TIMEOUTS.default
  const raw =
    env?.[DEEPSEEK_TIMEOUT_ENV[taskName]] ??
    env?.[DEEPSEEK_TIMEOUT_ENV.default]
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 300_000
    ? Math.round(parsed)
    : fallback
}

export { qwenTimeout }

const AI_ERROR_DETAILS = Object.freeze({
  DEEPSEEK_TIMEOUT: {
    status: 504,
    retryable: true,
    message:
      '本次生成等待时间过长，已自动停止。你可以重新尝试，已完成的内容不会丢失。',
  },
  DEEPSEEK_ABORTED: {
    status: 499,
    retryable: true,
    message: '本次生成已取消，已完成的内容不会丢失。',
  },
  DEEPSEEK_AUTH_FAILED: {
    status: 401,
    retryable: false,
    message: 'DeepSeek API Key 无效，请重新配置。',
  },
  DEEPSEEK_MODEL_NOT_FOUND: {
    status: 502,
    retryable: false,
    message: '智能分析模型暂时不可用。',
  },
  DEEPSEEK_RATE_LIMITED: {
    status: 429,
    retryable: true,
    message: 'DeepSeek请求过于频繁，请稍后重试。',
  },
  DEEPSEEK_QUOTA_EXHAUSTED: {
    status: 402,
    retryable: false,
    message:
      'DeepSeek免费额度已用尽。请在百炼控制台充值，或关闭“仅使用免费额度”后重新检测。',
  },
  DEEPSEEK_NETWORK_ERROR: {
    status: 502,
    retryable: true,
    message: 'DeepSeek服务暂时不可用，请稍后重试。',
  },
  DEEPSEEK_INVALID_RESPONSE: {
    status: 502,
    retryable: true,
    message: 'DeepSeek返回内容不完整，请重试。',
  },
  DEEPSEEK_SCHEMA_VALIDATION_FAILED: {
    status: 502,
    retryable: true,
    message: 'DeepSeek返回内容不完整，请重试。',
  },
  DEEPSEEK_NOT_CONFIGURED: {
    status: 503,
    retryable: false,
    message: '智能分析服务尚未完成配置',
  },
})

function aiServiceError(code, taskName, requestId, options = {}) {
  const details =
    AI_ERROR_DETAILS[code] ?? AI_ERROR_DETAILS.DEEPSEEK_NETWORK_ERROR
  return Object.assign(new Error(options.message ?? details.message), {
    code,
    taskName,
    requestId,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    retryable: details.retryable,
    status: details.status,
  })
}

function isAIServiceError(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      typeof error.code === 'string' &&
      error.code.startsWith('DEEPSEEK_'),
  )
}

/**
 * Unified production gateway for every request sent to DashScope.
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @param {{taskName: string, url?: string, body: unknown, retries?: number}} options
 */
async function callQwen(request, env, options) {
  const taskName = options.taskName
  const requestId = text(request.headers.get('x-request-id'), id())
  const timeoutMs = qwenTimeout(env, taskName)
  const config = qwenConfig(env)
  if (!config.configured) {
    throw aiServiceError('DEEPSEEK_NOT_CONFIGURED', taskName, requestId)
  }
  const controller = new AbortController()
  const callerSignal = request.signal
  let timedOut = false
  const abortFromCaller = () => controller.abort(callerSignal.reason)
  if (callerSignal.aborted) abortFromCaller()
  else callerSignal.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('DEEPSEEK_REQUEST_TIMEOUT'))
  }, timeoutMs)

  try {
    const response = await fetch(options.url ?? DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...options.body,
        model: config.model,
        max_tokens: options.body?.max_tokens ?? DEEPSEEK_MAX_TOKENS,
      }),
      signal: controller.signal,
    })
    if (response.status === 403) {
      const errorBody = await response.json().catch(() => null)
      if (errorBody?.error?.code === 'AllocationQuota.FreeTierOnly') {
        throw aiServiceError('DEEPSEEK_QUOTA_EXHAUSTED', taskName, requestId)
      }
      throw aiServiceError('DEEPSEEK_AUTH_FAILED', taskName, requestId)
    }
    if (response.status === 401) {
      throw aiServiceError('DEEPSEEK_AUTH_FAILED', taskName, requestId)
    }
    if (response.status === 404) {
      throw aiServiceError('DEEPSEEK_MODEL_NOT_FOUND', taskName, requestId)
    }
    if (response.status === 429) {
      throw aiServiceError('DEEPSEEK_RATE_LIMITED', taskName, requestId)
    }
    if (!response.ok) {
      throw aiServiceError('DEEPSEEK_NETWORK_ERROR', taskName, requestId)
    }
    try {
      return {
        data: await response.json(),
        taskName,
        requestId,
        timeoutMs,
      }
    } catch {
      if (timedOut) {
        throw aiServiceError('DEEPSEEK_TIMEOUT', taskName, requestId, { timeoutMs })
      }
      if (callerSignal.aborted) {
        throw aiServiceError('DEEPSEEK_ABORTED', taskName, requestId)
      }
      throw aiServiceError('DEEPSEEK_INVALID_RESPONSE', taskName, requestId)
    }
  } catch (error) {
    if (isAIServiceError(error)) throw error
    if (timedOut) {
      throw aiServiceError('DEEPSEEK_TIMEOUT', taskName, requestId, { timeoutMs })
    }
    if (callerSignal.aborted) {
      throw aiServiceError('DEEPSEEK_ABORTED', taskName, requestId)
    }
    throw aiServiceError('DEEPSEEK_NETWORK_ERROR', taskName, requestId)
  } finally {
    clearTimeout(timer)
    callerSignal.removeEventListener('abort', abortFromCaller)
  }
}

async function qwen(request, env, payload, taskName, instruction, input) {
  const taskOptions = taskName === 'careerFit'
    ? { thinking: { type: 'disabled' } }
    : {}
  const response = await callQwen(request, env, {
    taskName,
    body: {
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
      stream: false,
      thinking: { type: 'disabled' },
      ...taskOptions,
    },
  })
  const choice = response.data?.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw aiServiceError(
      'DEEPSEEK_INVALID_RESPONSE',
      taskName,
      response.requestId,
    )
  }
  const content = choice?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw aiServiceError(
      'DEEPSEEK_INVALID_RESPONSE',
      taskName,
      response.requestId,
    )
  }
  try {
    const normalizedContent = content
      .trim()
      .replace(/^```(?:json)?\s*/iu, '')
      .replace(/\s*```$/u, '')
    return JSON.parse(normalizedContent)
  } catch {
    throw aiServiceError(
      'DEEPSEEK_INVALID_RESPONSE',
      taskName,
      response.requestId,
    )
  }
}

function claims(payload) {
  return list(payload?.profileContext?.claims)
}

function claimIds(payload) {
  return new Set(claims(payload).map((claim) => claim.id).filter(Boolean))
}

function materialIds(payload) {
  return new Set(
    list(payload?.profileContext?.profileMaterials)
      .map((material) => material.id)
      .filter(Boolean),
  )
}

function compactJdProfileContext(profileContext) {
  return {
    claims: list(profileContext?.claims).map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      label: compactPromptText(claim.label, 120),
      detail: compactPromptText(claim.detail, 420),
      status: claim.status,
      experienceId: claim.experienceId,
      experience: claim.experience
        ? {
            organization: compactPromptText(claim.experience.organization, 100),
            role: compactPromptText(claim.experience.role, 100),
            project: compactPromptText(claim.experience.project, 160),
          }
        : undefined,
      evidence: list(claim.evidence)
        .slice(0, 4)
        .map((item) => ({ quote: compactPromptText(item.quote, 420) })),
    })),
    experiences: list(profileContext?.experiences).map((experience) => ({
      id: experience.id,
      organization: compactPromptText(experience.organization, 100),
      role: compactPromptText(experience.role, 100),
      project: compactPromptText(experience.project, 160),
      startDate: experience.startDate,
      endDate: experience.endDate,
    })),
    profileMaterials: list(profileContext?.profileMaterials).map((material) => ({
      ...material,
      title: compactPromptText(material.title, 120),
      label: compactPromptText(material.label, 120),
      detail: compactPromptText(material.detail, 500),
      content: compactPromptText(material.content, 700),
      description: compactPromptText(material.description, 500),
    })),
  }
}

function knownIds(value, ids) {
  return list(value).filter((item) => ids.has(item))
}

async function extract(request, env, payload) {
  const content = text(payload.content)
  if (!content) return json({ message: '请输入需要提炼的内容' }, 400)
  const result = await qwen(
    request,
    env,
    payload,
    'resumeExtraction',
    `你是面向中国校招市场的求职经历信息提炼助手，只输出 JSON，不得补充原文没有的事实。完整识别责任、行动、结果、可迁移能力、工具、AI具体应用场景和证书。能力名称使用招聘市场常用且可验证的表达（如用户洞察与研究、数据分析与复盘、项目推进与执行、跨团队沟通协作），不要使用空泛性格词；工具与能力分开，相同事实不要重复。
格式：{"claims":[{"kind":"responsibility|action|result|capability|tool|ai|certificate","label":"简短标题","detail":"具体说明","quote":"原文中可逐字定位的连续片段"}]}。没有可靠信息时 claims 为空。`,
    { content },
  )
  return json({ claims: list(result.claims) })
}

async function analyzeJd(request, env, payload) {
  const jdText = text(payload.jdText)
  if (!jdText) return json({ message: '请输入完整 JD' }, 400)
  const ids = claimIds(payload)
  const materials = materialIds(payload)
  const result = await qwen(
    request,
    env,
    payload,
    'jdAnalysis',
    `你是证据驱动的求职分析助手，只输出 JSON。只能引用 profileContext 中确认证据和 profileMaterials，不得编造。
输出字段：company,role,department,location,level,businessKeywords,matchScore(0-100),evidenceCoverage,
strengths[{title,explanation,evidenceClaimIds,profileMaterialIds}],gaps[{title,explanation}],
resumeRewrites[{sourceClaimId,original,rewritten,rationale,supportingClaimIds,profileMaterialIds,targetRequirement}],
interviewDimensions[{dimension,priority(high|medium|low),focus,evidenceClaimIds}]。
先拆解全部核心职责和硬性要求，每项必须进入 strengths 或 gaps。评分保守：0-39 证据少，40-59 部分匹配，60-74 多数要求有证据，75+ 仅限多段且有结果证据；关键词或工具接触不能直接算能力。
简历改写从全部经历选择 3-6 条最贴近 JD 的事实，可用 supportingClaimIds 组合同一经历的行动、能力与结果；突出个人角色、方法、结果和可迁移能力，缺失数字写「[补充具体数据]」。未知公司或岗位字段写“待补充”；所有 id 必须来自输入。`,
    {
      companyIdentity: {
        companyName: text(payload.companyName),
        companyWebsite: text(payload.companyWebsite),
        companyIndustry: text(payload.companyIndustry),
        roleName: text(payload.roleName),
      },
      jdText,
      profileContext: compactJdProfileContext(payload.profileContext),
    },
  )
  const score = Number(result.matchScore)
  const normalized = {
    company: text(payload.companyName, text(result.company, '待补充')),
    role: text(payload.roleName, text(result.role, '待补充')),
    department: text(result.department, '待补充'),
    location: text(result.location, '待补充'),
    level: text(result.level, '待补充'),
    businessKeywords: list(result.businessKeywords).map(String).filter(Boolean),
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    evidenceCoverage: text(result.evidenceCoverage, '待补充'),
    strengths: list(result.strengths)
      .map((item) => ({
        title: text(item.title),
        explanation: text(item.explanation),
        evidenceClaimIds: knownIds(item.evidenceClaimIds, ids),
        profileMaterialIds: knownIds(item.profileMaterialIds, materials),
      }))
      .filter((item) =>
        item.title &&
        item.explanation &&
        (item.evidenceClaimIds.length || item.profileMaterialIds.length)),
    gaps: list(result.gaps)
      .map((item) => ({
        title: text(item.title),
        explanation: text(item.explanation),
      }))
      .filter((item) => item.title && item.explanation),
    resumeRewrites: list(result.resumeRewrites)
      .map((item) => ({
        sourceClaimId: text(item.sourceClaimId),
        original: text(item.original),
        rewritten: text(item.rewritten),
        rationale: text(item.rationale),
        supportingClaimIds: knownIds(item.supportingClaimIds, ids),
        profileMaterialIds: knownIds(item.profileMaterialIds, materials),
        targetRequirement: text(item.targetRequirement),
      }))
      .filter((item) => ids.has(item.sourceClaimId) && item.original && item.rewritten && item.rationale),
    interviewDimensions: list(result.interviewDimensions)
      .map((item) => ({
        dimension: text(item.dimension),
        priority: enumValue(item.priority, ['high', 'medium', 'low'], 'medium'),
        focus: text(item.focus),
        evidenceClaimIds: knownIds(item.evidenceClaimIds, ids),
      }))
      .filter((item) => item.dimension && item.focus),
  }
  const referencedIds = new Set(
    normalized.strengths.flatMap((item) => item.evidenceClaimIds),
  )
  const referencedMaterials = new Set(
    normalized.strengths.flatMap((item) => item.profileMaterialIds),
  )
  const referencedClaims = claims(payload).filter((claim) =>
    referencedIds.has(claim.id),
  )
  const requirementCount =
    normalized.strengths.length + normalized.gaps.length
  const coverageScore = requirementCount
    ? (normalized.strengths.length / requirementCount) * 55
    : 0
  const evidenceScore =
    Math.min((referencedIds.size + referencedMaterials.size) / 4, 1) * 20
  const resultScore = referencedClaims.length
    ? (referencedClaims.filter((claim) => claim.kind === 'result').length /
        referencedClaims.length) *
      15
    : 0
  const experienceScore =
    Math.min(
      new Set(referencedClaims.map((claim) => claim.experienceId)).size / 2,
      1,
    ) * 10
  const evidenceBound = referencedClaims.length || referencedMaterials.size
    ? Math.round(
        coverageScore + evidenceScore + resultScore + experienceScore,
      )
    : 0
  normalized.matchScore = Math.min(normalized.matchScore, evidenceBound)
  return json(normalized)
}

const normalizeDirectionName = (value) =>
  text(value)
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s/·\-—_]+/gu, '')

async function careerInspiration(request, env, payload) {
  const evidenceUnits = list(payload.evidenceUnits).filter(
    (unit) => text(unit.id) && text(unit.originalText),
  )
  const stamp = now()
  if (!evidenceUnits.length) {
    return json({
      id: id(),
      status: 'insufficient-profile',
      profileSummary: {
        recurringWorkPatterns: [],
        coreCapabilities: [],
        transferableCapabilities: [],
        domainAssets: [],
        interestSignals: [],
      },
      directions: [],
      generatedAt: stamp,
    })
  }
  const result = await qwen(
    request,
    env,
    payload,
    'careerInspiration',
    `你是职业路径分析师和人才能力迁移顾问，只输出 JSON。
只输出最终结论，不输出推理或分析过程；内部证据 ID 只能写入 matchedEvidenceIds，不得出现在可见文案中。
必须阅读候选人的任务、行动、成果、合作方式和兴趣，每个方向必须引用 matchedEvidenceIds。
区分 direct、adjacent、hybrid、exploratory；不得把可迁移能力写成已有同岗位经验。
不得重复 savedDirections 或 excludedDirections，不得固定在预设岗位列表。
输出 profileSummary 和 directions；方向字段为 name,category,directionType,fitScore,confidence,summary,whySuitable,matchedEvidenceIds,transferableCapabilities,evidenceGaps,differenceFromExisting,transitionDifficulty,possibleTitles,nextActions,searchKeywords。`,
    {
      evidenceUnits: compactCareerEvidenceUnits(evidenceUnits),
      savedDirections: list(payload.savedDirections).map((value) => compactPromptText(value, 100)).filter(Boolean).slice(0, 20),
      excludedDirections: list(payload.excludedDirections).map((value) => compactPromptText(value, 100)).filter(Boolean).slice(0, 20),
      feedback: list(payload.feedback).slice(0, 20),
      preferences: payload.preferences && typeof payload.preferences === 'object' ? payload.preferences : {},
    },
  )
  const knownIds = new Set(evidenceUnits.map((unit) => unit.id))
  const excluded = new Set(
    [...list(payload.savedDirections), ...list(payload.excludedDirections)].map(
      normalizeDirectionName,
    ),
  )
  const seen = new Set()
  const rawDirections = list(result.directions)
  const directions = rawDirections
    .map((item) => {
      const name = text(item.name)
      const matchedEvidenceIds = list(item.matchedEvidenceIds).filter((value) =>
        knownIds.has(value),
      )
      const fitScore = Number(item.fitScore)
      return {
        id: id(),
        name,
        category: text(item.category),
        directionType: enumValue(
          item.directionType,
          ['direct', 'adjacent', 'hybrid', 'exploratory'],
          'exploratory',
        ),
        fitScore: Number.isFinite(fitScore)
          ? Math.max(0, Math.min(100, fitScore))
          : 0,
        confidence: enumValue(
          item.confidence,
          ['high', 'medium', 'low'],
          'low',
        ),
        summary: text(item.summary),
        whySuitable: text(item.whySuitable),
        matchedEvidenceIds,
        transferableCapabilities: list(item.transferableCapabilities)
          .map(String)
          .filter(Boolean),
        evidenceGaps: list(item.evidenceGaps).map(String).filter(Boolean),
        differenceFromExisting: text(item.differenceFromExisting),
        transitionDifficulty: enumValue(
          item.transitionDifficulty,
          ['low', 'medium', 'high'],
          'high',
        ),
        possibleTitles: list(item.possibleTitles).map(String).filter(Boolean),
        nextActions: list(item.nextActions).map(String).filter(Boolean),
        searchKeywords: list(item.searchKeywords).map(String).filter(Boolean),
      }
    })
    .filter((item) => {
      const key = normalizeDirectionName(item.name)
      if (
        !key ||
        excluded.has(key) ||
        seen.has(key) ||
        !item.summary ||
        !item.whySuitable ||
        !item.matchedEvidenceIds.length
      ) {
        return false
      }
      seen.add(key)
      return true
    })
    .slice(0, 8)
  const summary = result.profileSummary ?? {}
  return json({
    id: id(),
    status:
      directions.length === 0
        ? 'parse-failed'
        : directions.length < rawDirections.length
          ? 'partial'
          : 'completed',
    profileSummary: {
      recurringWorkPatterns: list(summary.recurringWorkPatterns),
      coreCapabilities: list(summary.coreCapabilities),
      transferableCapabilities: list(summary.transferableCapabilities),
      domainAssets: list(summary.domainAssets),
      interestSignals: list(summary.interestSignals),
    },
    directions,
    generatedAt: stamp,
  })
}

const cleanVisibleAIText = (value) => text(value)
  .replace(/\s*[（(]\s*(?:(?:claim|span|profile-material)[-:][^（）()]+|[^（）()]*-claim-\d+)\s*[）)]/giu, '')
  .replace(/\s+([，。；：！？])/gu, '$1')
  .replace(/\s{2,}/gu, ' ')
  .trim()

async function careerDirectionAnalysis(request, env, payload) {
  const directionId = text(payload.directionId)
  const directionName = text(payload.directionName)
  const evidenceUnits = list(payload.evidenceUnits).filter(
    (item) => text(item.id) && text(item.originalText),
  )
  if (!directionId || !directionName) {
    return json({ message: '岗位分析请求无效' }, 400)
  }
  const possibleTitles = list(payload.possibleTitles).map(String).filter(Boolean)
  if (request.signal.aborted) {
    throw aiServiceError('DEEPSEEK_ABORTED', 'careerFit', id())
  }
  const accessedAt = now()
  const generated = await qwen(
    request,
    env,
    payload,
    'careerFit',
    `你是就业市场岗位研究员，只输出 JSON。根据已有职业知识归纳 6—10 条常见职责和能力要求，内容非实时联网结果。
sourceIds 固定为空；个人判断只能引用 evidenceIds 的真实档案，每项给出 3—4 条不超过 90 字的原文关键短句，不整段复制。
没有个人证据不得标 advantage 或 basic-match。可见文案只写最终结论，不输出分析过程、claim、span、profile-material 等内部编号。
输出 requirements[{requirement,category(responsibility|capability|knowledge|working-style),importance(high|medium|low),sourceIds,evidenceIds,evidenceExcerpts,matchReason,matchStatus(advantage|basic-match|evidence-gap|clear-gap|confirm),preparationAdvice}],capabilityGaps[{title,reason,action,priority}],mindsetGaps[{title,reason,action,priority}]。`,
    {
      directionName,
      possibleTitles,
      evidenceUnits: compactCareerEvidenceUnits(evidenceUnits),
      sources: [],
    },
  )
  const evidenceById = new Map(evidenceUnits.map((item) => [item.id, item]))
  let partial = false
  const requirements = list(generated.requirements).flatMap((item, index) => {
    const sourceIds = []
    const evidenceIds = list(item.evidenceIds).filter((value) => evidenceById.has(value))
    if (evidenceIds.length !== list(item.evidenceIds).length) partial = true
    const evidenceTexts = evidenceIds.map((value) => text(evidenceById.get(value)?.originalText))
    let evidenceExcerpts = list(item.evidenceExcerpts)
      .map(cleanVisibleAIText)
      .filter((excerpt) => excerpt && evidenceTexts.some((original) => original.includes(excerpt)))
      .map((excerpt) => excerpt.slice(0, 90))
      .slice(0, 4)
    if (evidenceIds.length && !evidenceExcerpts.length) {
      evidenceExcerpts = evidenceTexts.slice(0, 4).map((value) => value.slice(0, 90))
      partial = true
    }
    let matchStatus = enumValue(
      item.matchStatus,
      ['advantage', 'basic-match', 'evidence-gap', 'clear-gap', 'confirm'],
      'confirm',
    )
    if (!evidenceIds.length && ['advantage', 'basic-match'].includes(matchStatus)) {
      matchStatus = 'evidence-gap'
      partial = true
    }
    const requirement = cleanVisibleAIText(item.requirement)
    const matchReason = cleanVisibleAIText(item.matchReason)
    const preparationAdvice = cleanVisibleAIText(item.preparationAdvice)
    if (!requirement || !matchReason || !preparationAdvice) return []
    return [{
      id: `market-requirement-${index + 1}`,
      requirement,
      category: enumValue(item.category, ['responsibility', 'capability', 'knowledge', 'working-style'], 'capability'),
      importance: enumValue(item.importance, ['high', 'medium', 'low'], 'medium'),
      sourceIds,
      evidenceIds,
      evidenceExcerpts,
      matchReason,
      matchStatus,
      preparationAdvice,
    }]
  })
  const gaps = (value) => list(value).flatMap((item) => {
    const title = cleanVisibleAIText(item.title)
    const reason = cleanVisibleAIText(item.reason)
    const action = cleanVisibleAIText(item.action)
    return title && reason && action ? [{
      title,
      reason,
      action,
      priority: enumValue(item.priority, ['high', 'medium', 'low'], 'medium'),
    }] : []
  })
  const scores = { advantage: 95, 'basic-match': 70, 'evidence-gap': 35, 'clear-gap': 10, confirm: 25 }
  const weights = { high: 3, medium: 2, low: 1 }
  const totalWeight = requirements.reduce((sum, item) => sum + weights[item.importance], 0)
  const fitScore = totalWeight
    ? Math.round(requirements.reduce(
        (sum, item) => sum + scores[item.matchStatus] * weights[item.importance],
        0,
      ) / totalWeight)
    : 0
  return json({
    id: id(),
    directionId,
    directionName,
    status: partial ? 'partial' : 'completed',
    fitScore,
    requirements,
    capabilityGaps: gaps(generated.capabilityGaps),
    mindsetGaps: gaps(generated.mindsetGaps),
    sources: [],
    knowledgeMode: 'model-knowledge',
    generatedAt: accessedAt,
  })
}

async function tavilySources(env, company) {
  if (!text(env.TAVILY_API_KEY) || !text(company) || company === '待补充') return []
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.TAVILY_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: `${company} 官网 招聘 企业文化 人才理念`,
        max_results: 6,
        include_raw_content: 'markdown',
      }),
    })
    if (!response.ok) return []
    const result = await response.json()
    const accessedAt = now()
    return list(result.results)
      .map((item, index) => ({
        id: `source-${index + 1}`,
        title: text(item.title, '公开信息'),
        url: text(item.url),
        content: text(item.raw_content, text(item.content, '公开信息摘要')),
        sourceType: index < 2 ? 'official_website' : 'industry_media',
        accessedAt,
      }))
      .filter((item) => /^https?:\/\//.test(item.url))
  } catch {
    return []
  }
}

function qwenSourceType(title, url) {
  const value = `${title} ${url}`.toLowerCase()
  if (/官方招聘|official careers|official jobs/.test(value)) return 'official_careers'
  if (/官方网站|官网|official website|official site/.test(value)) return 'official_website'
  if (/年报|annual report|investor relations|esg/.test(value)) return 'official_report'
  if (/官方公众号|official social/.test(value)) return 'official_social'
  if (/招聘|career|jobs?/.test(value)) return 'job_platform'
  return 'industry_media'
}

async function qwenSources(request, env, payload, company) {
  if (!text(company) || company === '待补充') return []
  const role = text(payload.roleName, text(payload.analysis?.role, '目标岗位'))
  const website = text(payload.companyWebsite)
  const industry = text(payload.companyIndustry)
  const identityHint = `${website ? `用户提供官网：${website}。` : ''}${industry ? `所属行业：${industry}。` : ''}`
  const tasks = [
    `检索“${company}”官方网站、公司介绍和核心业务。`,
    `检索“${company}”企业文化、使命、愿景和价值观，优先官网。`,
    `检索“${company}”官方招聘、人才理念和团队工作方式。`,
    `检索“${company}”的“${role}”岗位、所属职能和任职要求。`,
    `检索“${company}”最新业务、年报、ESG、项目报告和官方新闻。`,
  ]
  const search = async (task) => {
    const response = await callQwen(request, env, {
      taskName: 'companySearch',
      url: DASHSCOPE_SEARCH_URL,
      body: {
        input: {
          messages: [{
            role: 'user',
            content: `${identityHint}${task}只总结可核验公开信息并保留来源，不采用匿名评价。`,
          }],
        },
        parameters: {
          enable_search: true,
          result_format: 'message',
          search_options: {
            enable_source: true,
            forced_search: true,
            search_strategy: 'max',
          },
        },
      },
    })
    const result = response.data
    const summary = text(
      result?.output?.choices?.[0]?.message?.content,
      '联网搜索未返回可用摘要',
    )
    return {
      summary,
      results: list(result?.output?.search_info?.search_results).slice(0, 5),
    }
  }
  const settled = await Promise.allSettled(tasks.map(search))
  const fulfilled = settled.filter((item) => item.status === 'fulfilled')
  if (!fulfilled.length) {
    const aiFailure = settled.find(
      (item) => item.status === 'rejected' && isAIServiceError(item.reason),
    )
    if (aiFailure?.status === 'rejected') throw aiFailure.reason
    throw Object.assign(new Error('企业联网检索失败，请检查网络后重试'), {
      code: 'search_failed',
      status: 502,
    })
  }
  const accessedAt = now()
  const seen = new Set()
  return fulfilled
    .flatMap(({ value }) =>
      value.results.map((item) => ({
        title: text(item.title),
        url: text(item.url),
        content: value.summary,
        sourceType: qwenSourceType(text(item.title), text(item.url)),
        accessedAt,
      })),
    )
    .filter((item) => {
      if (!item.title || !/^https?:\/\//.test(item.url) || seen.has(item.url)) {
        return false
      }
      seen.add(item.url)
      return true
    })
    .slice(0, 12)
    .map((item, index) => ({ ...item, id: `source-${index + 1}` }))
}

function safePublicUrl(value) {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = parsed.hostname.toLowerCase()
    return !(
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
      /^(?:::1|f[cd][0-9a-f]{2}:|fe8[0-9a-f]:)/i.test(host)
    )
  } catch {
    return false
  }
}

function cleanWebPage(html) {
  const decoded = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|svg|noscript|nav|footer|form|iframe)[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|nav|footer|form|iframe)>/giu, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/giu, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
  return [...new Set(
    decoded
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 8),
  )].join('\n').slice(0, 18000)
}

async function enrichResearchSources(sources, callerSignal) {
  return Promise.all(sources.slice(0, 8).map(async (source) => {
    let domain = ''
    try { domain = new URL(source.url).hostname.replace(/^www\./, '') }
    catch {}
    if (!safePublicUrl(source.url)) {
      return {
        ...source,
        domain,
        contentStatus: 'failed',
        failureReason: '链接不是可访问的公开网页',
      }
    }
    try {
      const controller = new AbortController()
      const abort = () => controller.abort(callerSignal?.reason)
      if (callerSignal?.aborted) abort()
      else callerSignal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(
        () => controller.abort(new Error('RESEARCH_PAGE_TIMEOUT')),
        8_000,
      )
      let response
      try {
        response = await fetch(source.url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'OfferAdventureResearch/1.0',
          },
        })
      } finally {
        clearTimeout(timer)
        callerSignal?.removeEventListener('abort', abort)
      }
      const type = response.headers.get('content-type') || ''
      if (!response.ok || (!type.includes('html') && !type.includes('text'))) {
        throw new Error(response.ok ? '页面格式暂不支持正文提取' : `页面返回 ${response.status}`)
      }
      const content = cleanWebPage((await response.text()).slice(0, 600000))
      if (!content) throw new Error('页面没有可提取的正文')
      return {
        ...source,
        content,
        domain,
        publisher: domain,
        contentStatus: content.length >= 50 ? 'full' : 'partial',
      }
    } catch (error) {
      return {
        ...source,
        domain,
        content: source.content || '该来源正文暂时无法读取，请直接查看原链接。',
        contentStatus: source.content ? 'snippet-only' : 'failed',
        failureReason: error instanceof Error ? error.message : '页面读取失败',
      }
    }
  }))
}

function compactResearchSources(sources) {
  let remaining = 28_000
  return sources.slice(0, 8).map((source) => {
    const content = text(source.content).slice(0, Math.min(3_500, remaining))
    remaining = Math.max(0, remaining - content.length)
    return { ...source, content }
  })
}

function compactProfileContext(profileContext) {
  return {
    claims: list(profileContext?.claims).map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      label: claim.label,
      detail: claim.detail,
      experienceId: claim.experienceId,
      experience: claim.experience,
      evidence: list(claim.evidence).map((item) => ({ quote: item.quote })),
    })),
    profileMaterials: list(profileContext?.profileMaterials),
  }
}

async function interviewResearch(request, env, payload, companyOnly) {
  if (!text(payload.analysisId) || !text(payload.jdText)) {
    return json({ message: '面试研究请求无效' }, 400)
  }
  const company = text(payload.companyName, text(payload.analysis?.company))
  if (!company || company === '待补充') {
    return json({ message: '请先补充并选择企业名称', code: 'company_missing' }, 400)
  }
  const sources = []
  const sourceIds = new Set(sources.map((source) => source.id))
  const ids = claimIds(payload)
  const identityStatus = 'confirmed'
  const allowCompanyInsights = true
  const researchPrompt = `你是证据驱动的面试研究助手，只输出 JSON。候选人事实只能来自 profileContext。
只输出最终结论，不输出推理或分析过程；内部证据 ID 只能写入 evidenceClaimIds、sourceIds 等结构化字段，不得出现在可见文案中。
企业洞察仅使用模型已有知识，统一标为 inference 且 sourceIds 为空；不是实时联网结果，无法确认时写“现有知识不足”。
输出：companyInsights[{topic(company|culture|talent),content,evidenceType(official|public|inference),sourceIds}],
competencies[{competency,requirement,priority(high|medium|low),assessment(match|gap|unknown),evidenceClaimIds,sourceIds}],
interviewPriorities[{title,priority,rationale,evidenceClaimIds}],
predictedQuestions[{question,category(motivation|competency|behavioral|case|culture|other),priority,rationale,evidenceClaimIds,sourceIds,companyBasis,jdBasis,resumeBasis,validationGoal,followUpQuestions}],
preparationChecklist[{label}]。没有可靠来源时 companyInsights 必须为空；不得编造经历或数字。高优先级问题必须同时具有企业、JD、简历依据。`
  let normalizationPartial = false
  let result = {}
  try {
    result = await qwen(request, env, payload, 'companyResearch', researchPrompt, {
      companyIdentity: {
        companyName: company,
        companyWebsite: text(payload.companyWebsite),
        companyIndustry: text(payload.companyIndustry),
        roleName: text(payload.roleName, text(payload.analysis?.role)),
      },
      jdText: payload.jdText,
      analysis: { ...(payload.analysis || {}), company },
      profileContext: compactProfileContext(payload.profileContext),
      sources: compactResearchSources(sources),
      allowCompanyInsights,
      companyOnly,
    })
  } catch (error) { throw error }
  const companyResult = result
  const stamp = now()
  const companyInsights = allowCompanyInsights
    ? list(companyResult.companyInsights)
        .map((item) => ({
            id: id(),
            topic: enumValue(item.topic, ['company', 'culture', 'talent'], 'company'),
            content: text(item.content),
            evidenceType: 'inference',
            sourceIds: [],
          }))
        .filter((item) => item.content)
    : []
  const addCommon = (item) => ({
    id: id(),
    priority: enumValue(item.priority, ['high', 'medium', 'low'], 'medium'),
    evidenceClaimIds: knownIds(item.evidenceClaimIds, ids),
  })
  return json({
    id: text(payload.researchId) || id(),
    analysisId: payload.analysisId,
    jobId: text(payload.jobId) || undefined,
    companyName: company,
    companyIdentityHash: text(payload.companyIdentityHash) || undefined,
    jdHash: text(payload.jdHash) || undefined,
    researchContextHash: text(payload.researchContextHash) || undefined,
    researchStatus: companyInsights.length === 0
      ? 'no-reliable-info'
      : normalizationPartial ? 'partial' : 'completed',
    identityStatus,
    knowledgeMode: 'model-knowledge',
    sources,
    companyInsights,
    competencies: companyOnly
      ? []
      : list(result.competencies)
          .map((item) => ({
            ...addCommon(item),
            competency: text(item.competency),
            requirement: text(item.requirement),
            assessment: enumValue(item.assessment, ['match', 'gap', 'unknown'], 'unknown'),
            sourceIds: knownIds(item.sourceIds, sourceIds),
          }))
          .filter((item) => item.competency && item.requirement),
    interviewPriorities: companyOnly
      ? []
      : list(result.interviewPriorities)
          .map((item) => ({
            ...addCommon(item),
            title: text(item.title),
            rationale: text(item.rationale),
          }))
          .filter((item) => item.title && item.rationale),
    predictedQuestions: companyOnly
      ? []
      : list(result.predictedQuestions)
          .map((item) => ({
            ...addCommon(item),
            priority:
              item.priority === 'high' &&
              (!text(item.companyBasis) || !text(item.jdBasis) || !text(item.resumeBasis))
                ? 'medium'
                : enumValue(item.priority, ['high', 'medium', 'low'], 'medium'),
            question: text(item.question),
            category: enumValue(item.category, ['motivation', 'competency', 'behavioral', 'case', 'culture', 'other'], 'other'),
            rationale: text(item.rationale),
            sourceIds: knownIds(item.sourceIds, sourceIds),
            companyBasis: text(item.companyBasis) || undefined,
            jdBasis: text(item.jdBasis) || undefined,
            resumeBasis: text(item.resumeBasis) || undefined,
            validationGoal: text(item.validationGoal) || undefined,
            followUpQuestions: list(item.followUpQuestions).map(String).filter(Boolean),
          }))
          .filter((item) => item.question && item.rationale),
    preparationChecklist: companyOnly
      ? []
      : list(result.preparationChecklist)
          .map((item) => ({ id: id(), label: text(item.label), completed: false }))
          .filter((item) => item.label),
    createdAt: stamp,
    updatedAt: stamp,
  })
}

async function answerOptimization(request, env, payload) {
  if (!text(payload.analysisId) || !text(payload.question) || !text(payload.originalAnswer)) {
    return json({ message: '回答优化请求无效' }, 400)
  }
  const ids = claimIds(payload)
  const result = await qwen(
    request,
    env,
    payload,
    'answerOptimization',
    `你是面试回答教练，只输出 JSON。不得补造经历或数字，缺失数据用「[补充具体数据]」。
输出 optimizedAnswerZh,optimizedAnswerEn,improvements[string],evidenceClaimIds[string]。中英文事实一致，适合口头表达。`,
    payload,
  )
  const stamp = now()
  return json({
    id: id(),
    analysisId: payload.analysisId,
    question: payload.question,
    originalAnswer: payload.originalAnswer,
    optimizedAnswerZh: text(result.optimizedAnswerZh, '请补充更具体的回答思路后重试。'),
    optimizedAnswerEn: text(result.optimizedAnswerEn, 'Please add more specific evidence and try again.'),
    improvements: list(result.improvements).map(String).filter(Boolean),
    evidenceClaimIds: knownIds(result.evidenceClaimIds, ids),
    status: 'completed',
    createdAt: stamp,
    updatedAt: stamp,
  })
}

async function questionPractice(request, env, payload) {
  if (!text(payload.analysisId) || !text(payload.question) || !text(payload.originalAnswer)) {
    return json({ message: '单题练习请求无效' }, 400)
  }
  const ids = claimIds(payload)
  const result = await qwen(
    request,
    env,
    payload,
    'answerOptimization',
    '你是面试练习点评助手，只输出 JSON：{"answerCoverage":"回答覆盖","evidenceAssessment":"证据与个人贡献","roleRelevance":"岗位关联","risks":[],"improvements":[],"followUpQuestions":[],"evidenceClaimIds":[]}。不得编造经历、数字或企业事实；缺失数据用「[补充具体数据]」。',
    payload,
  )
  const stamp = now()
  return json({
    id: id(),
    analysisId: payload.analysisId,
    questionId: text(payload.questionId, 'manual-question'),
    question: payload.question,
    originalAnswer: payload.originalAnswer,
    inputMode: enumValue(payload.inputMode, ['text', 'voice'], 'text'),
    answerCoverage: text(result.answerCoverage, '已记录回答，请补充更具体的结构。'),
    evidenceAssessment: text(result.evidenceAssessment, '请明确个人负责部分和可核验结果。'),
    roleRelevance: text(result.roleRelevance, '请补充与目标岗位的直接关联。'),
    risks: list(result.risks).map(String).filter(Boolean),
    improvements: list(result.improvements).map(String).filter(Boolean),
    followUpQuestions: list(result.followUpQuestions).map(String).filter(Boolean),
    evidenceClaimIds: knownIds(result.evidenceClaimIds, ids),
    status: 'completed',
    createdAt: stamp,
    updatedAt: stamp,
  })
}

async function startInterview(request, env, payload) {
  if (!text(payload.analysisId)) return json({ message: '模拟面试请求无效' }, 400)
  const result = await qwen(
    request,
    env,
    payload,
    'mockInterviewStart',
    '你是专业资深面试官，只输出 JSON：{"question":"一个主要问题","questionType":"motivation|experience|business|competency|scenario|behavioral","focusDimension":"考察维度"}。根据 interviewType 分流：hr 只问动机、经历核实和岗位期待；business 只问业务理解、JD 能力和场景行为。一次只问一个问题，不给标准答案。',
    { ...payload.context, interviewType: payload.interviewType || 'business' },
  )
  const stamp = now()
  return json({
    id: id(),
    analysisId: payload.analysisId,
    mode: enumValue(payload.mode, ['text', 'voice'], 'text'),
    interviewType: enumValue(payload.interviewType, ['hr', 'business'], 'business'),
    status: 'active',
    turns: [{
      id: id(),
      sequence: 1,
      question: text(result.question, '请先简要介绍你自己，以及为什么申请这个岗位？'),
      answer: '',
      inputMode: enumValue(payload.mode, ['text', 'voice'], 'text'),
      questionType: enumValue(result.questionType, ['motivation', 'experience', 'business', 'competency', 'scenario', 'behavioral'], payload.interviewType === 'hr' ? 'motivation' : 'business'),
      focusDimension: text(result.focusDimension, payload.interviewType === 'hr' ? '动机与经历核实' : '能力与场景深挖'),
      createdAt: stamp,
    }],
    createdAt: stamp,
    updatedAt: stamp,
  })
}

async function interviewTurn(request, env, payload) {
  if (!payload.session || !text(payload.answer)) return json({ message: '模拟面试轮次无效' }, 400)
  const result = await qwen(
    request,
    env,
    payload,
    'mockInterviewTurn',
    '你是专业资深面试官，只输出 JSON：{"feedback":"内部简短判断","nextQuestion":"一个追问","questionType":"motivation|experience|business|competency|scenario|behavioral","focusDimension":"考察维度","followUpReason":"追问原因"}。根据 interviewType 保持 HR 或业务方向，不得问敏感问题，不给标准答案。',
    payload,
  )
  const turns = list(payload.session.turns).map((turn, index, all) =>
    index === all.findIndex((item) => !item.answer)
      ? { ...turn, answer: payload.answer, inputMode: enumValue(payload.inputMode, ['text', 'voice'], 'text'), feedback: text(result.feedback, '已记录。') }
      : turn,
  )
  turns.push({
    id: id(),
    sequence: turns.length + 1,
    question: text(result.nextQuestion, '如果重新做一次，你会改变什么？'),
    answer: '',
    inputMode: enumValue(payload.inputMode, ['text', 'voice'], 'text'),
    questionType: enumValue(result.questionType, ['motivation', 'experience', 'business', 'competency', 'scenario', 'behavioral'], payload.session.interviewType === 'hr' ? 'experience' : 'business'),
    focusDimension: text(result.focusDimension, payload.session.interviewType === 'hr' ? '经历核实' : '岗位能力'),
    followUpReason: text(result.followUpReason, '继续核实上一轮回答'),
    createdAt: now(),
  })
  return json({ ...payload.session, status: 'active', turns, updatedAt: now() })
}

async function completeInterview(request, env, payload) {
  if (!payload.session) return json({ message: '模拟面试会话无效' }, 400)
  const result = await qwen(
    request,
    env,
    payload,
    'interviewReport',
    '你是面试复盘教练，只输出 JSON：{"summary":"总体评价","strengths":["优势"],"improvements":["改进方向"]}。基于真实对话，专业具体，不给录用结论。',
    payload,
  )
  const stamp = now()
  return json({
    session: { ...payload.session, status: 'completed', updatedAt: stamp, completedAt: stamp },
    summary: text(result.summary, '本轮面试已完成，请结合逐题记录继续练习。'),
    strengths: list(result.strengths).map(String).filter(Boolean),
    improvements: list(result.improvements).map(String).filter(Boolean),
  })
}

async function qwenHealth(request, env) {
  const config = qwenConfig(env)
  if (!config.configured) {
    return json({
      provider: 'deepseek',
      configured: false,
      reachable: false,
      authenticated: false,
      modelAvailable: false,
      errorCode: 'DEEPSEEK_NOT_CONFIGURED',
    })
  }
  const startedAt = Date.now()
  try {
    const response = await callQwen(request, env, {
      taskName: 'health',
      body: {
        messages: [
          { role: 'user', content: '只回复 JSON：{"status":"ok"}' },
        ],
        response_format: { type: 'json_object' },
        stream: false,
        max_tokens: 16,
      },
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw aiServiceError(
        'DEEPSEEK_INVALID_RESPONSE',
        'health',
        response.requestId,
      )
    }
    return json({
      provider: 'deepseek',
      configured: true,
      reachable: true,
      authenticated: true,
      modelAvailable: true,
      latencyMs: Date.now() - startedAt,
    })
  } catch (error) {
    const code = isAIServiceError(error)
      ? error.code
      : 'DEEPSEEK_NETWORK_ERROR'
    return json({
      provider: 'deepseek',
      configured: true,
      reachable: !['DEEPSEEK_NETWORK_ERROR', 'DEEPSEEK_TIMEOUT'].includes(code),
      authenticated: code !== 'DEEPSEEK_AUTH_FAILED',
      modelAvailable: ![
        'DEEPSEEK_AUTH_FAILED',
        'DEEPSEEK_MODEL_NOT_FOUND',
      ].includes(code),
      latencyMs: Date.now() - startedAt,
      errorCode: code,
    })
  }
}

async function api(request, env) {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/ai/health') {
    return qwenHealth(request, env)
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/health') {
    const context = requestQwenContext(env, await body(request))
    return qwenHealth(request, context.env)
  }
  if (request.method === 'GET' && url.pathname === '/api/service-status') {
    return json({ researchConfigured: qwenConfig(env).configured })
  }
  if (request.method !== 'POST') return json({ message: '接口不存在' }, 404)
  const context = requestQwenContext(env, await body(request))
  const payload = context.payload
  const requestEnv = context.env
  if (url.pathname === '/api/ai/extract') return extract(request, requestEnv, payload)
  if (url.pathname === '/api/jd-analysis') return analyzeJd(request, requestEnv, payload)
  if (url.pathname === '/api/career-inspiration') return careerInspiration(request, requestEnv, payload)
  if (url.pathname === '/api/career-direction-analysis') return careerDirectionAnalysis(request, requestEnv, payload)
  if (url.pathname === '/api/interview-research') return interviewResearch(request, requestEnv, payload, false)
  if (/^\/api\/interview-research\/[^/]+\/regenerate$/.test(url.pathname)) return interviewResearch(request, requestEnv, payload, false)
  if (/^\/api\/interview-research\/[^/]+\/company-only$/.test(url.pathname)) return interviewResearch(request, requestEnv, payload, true)
  if (url.pathname === '/api/answer-optimization') return answerOptimization(request, requestEnv, payload)
  if (url.pathname === '/api/mock-interview/question-practice') return questionPractice(request, requestEnv, payload)
  if (url.pathname === '/api/mock-interview/session') return startInterview(request, requestEnv, payload)
  if (/^\/api\/mock-interview\/[^/]+\/turn$/.test(url.pathname)) return interviewTurn(request, requestEnv, payload)
  if (/^\/api\/mock-interview\/[^/]+\/complete$/.test(url.pathname)) return completeInterview(request, requestEnv, payload)
  return json({ message: '接口不存在' }, 404)
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await api(request, env)
      const response = await env.ASSETS.fetch(request)
      const acceptsHtml = request.headers.get('accept')?.includes('text/html')
      if (response.status !== 404 || !acceptsHtml || !['GET', 'HEAD'].includes(request.method)) return response
      const indexUrl = new URL(request.url)
      indexUrl.pathname = '/index.html'
      indexUrl.search = ''
      return env.ASSETS.fetch(new Request(indexUrl, request))
    } catch (error) {
      return json(
        {
          message: error instanceof Error ? error.message : '服务暂时不可用，请重试',
          ...(error?.code ? { code: error.code } : {}),
          ...(error?.taskName ? { taskName: error.taskName } : {}),
          ...(error?.requestId ? { requestId: error.requestId } : {}),
          ...(error?.timeoutMs ? { timeoutMs: error.timeoutMs } : {}),
          ...(typeof error?.retryable === 'boolean'
            ? { retryable: error.retryable }
            : {}),
        },
        Number(error?.status) || 502,
      )
    }
  },
}
