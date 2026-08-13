export const careerDirectionAnalysisInstruction = `
你是就业市场岗位研究员。只输出 JSON，不输出推理过程、分析过程、括号式证据编号或内部字段说明。
根据你的已有职业知识归纳目标岗位最常见且最关键的 6—10 条职责和能力要求，并明确这些是非实时的模型知识。
sourceIds 固定为空数组；个人适配判断只能引用 evidenceIds 中的真实档案证据。每项返回 3—4 条原文关键短句，每条不超过 90 个中文字符，不能整段搬运。
没有个人证据时使用 evidence-gap、clear-gap 或 confirm，不得标为 advantage 或 basic-match。
输出 requirements、capabilityGaps、mindsetGaps。
requirements 每项包含 requirement,category(responsibility|capability|knowledge|working-style),importance(high|medium|low),sourceIds,evidenceIds,evidenceExcerpts,matchReason,matchStatus(advantage|basic-match|evidence-gap|clear-gap|confirm),preparationAdvice。
capabilityGaps 和 mindsetGaps 每项包含 title,reason,action,priority(high|medium|low)。
所有可见文案只写最终结论，不出现 claim、span、profile-material 等内部编号。
`.trim()

const compactPromptText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized
}

export const compactCareerEvidenceUnits = (units: unknown) =>
  (Array.isArray(units) ? units : []).map((unit) => {
    const item = (unit && typeof unit === 'object' ? unit : {}) as Record<string, unknown>
    const compactList = (value: unknown) =>
      (Array.isArray(value) ? value : [])
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => compactPromptText(entry, 60))
        .filter(Boolean)
        .slice(0, 8)
    return {
      id: compactPromptText(item.id, 140),
      sourceLabel: compactPromptText(item.sourceLabel, 100),
      evidenceType: compactPromptText(item.evidenceType, 40),
      originalText: compactPromptText(item.originalText, 360),
      normalizedDescription: compactPromptText(item.normalizedDescription, 360),
      capabilities: compactList(item.capabilities),
      domains: compactList(item.domains),
      tools: compactList(item.tools),
      stakeholders: compactList(item.stakeholders),
      measurableResult: compactPromptText(item.measurableResult, 360),
      personalContribution: compactPromptText(item.personalContribution, 360),
      confidence: compactPromptText(item.confidence, 20),
    }
  })

export const buildCareerDirectionAnalysisInput = (input: unknown) => {
  if (!input || typeof input !== 'object') return JSON.stringify(input)
  const value = input as Record<string, unknown>
  return JSON.stringify({
    directionName: compactPromptText(value.directionName, 120),
    possibleTitles: (Array.isArray(value.possibleTitles) ? value.possibleTitles : [])
      .filter((title): title is string => typeof title === 'string')
      .map((title) => compactPromptText(title, 100))
      .filter(Boolean)
      .slice(0, 12),
    evidenceUnits: compactCareerEvidenceUnits(value.evidenceUnits),
    sources: [],
  })
}
