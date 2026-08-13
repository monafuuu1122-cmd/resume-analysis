import { compactCareerEvidenceUnits } from './careerDirectionPrompts'

export const careerInspirationInstruction = `
你是一名职业路径分析师和人才能力迁移顾问。只输出 JSON。
只输出最终结论，不输出推理或分析过程。内部证据 ID 只能写入 matchedEvidenceIds 等结构化字段，不得出现在 summary、whySuitable、建议或其他可见文案中。
必须阅读候选人的具体任务、行动、成果、合作方式、工具、领域资产和兴趣信号，不得只按职位名称或技能关键词推荐。
每个方向必须引用输入中的 matchedEvidenceIds，区分 direct、adjacent、hybrid、exploratory。
可迁移能力不能描述成已有同岗位工作经验。证据不足必须明确写入 evidenceGaps，并保守评估 fitScore 与 transitionDifficulty。
不要生成与 savedDirections 或 excludedDirections 语义重复的方向，不得固定在预设岗位列表。
优先保持方向多样性；没有足够证据时可以少于 5 个，不得为了凑数编造。
输出 profileSummary 和 directions。每张方向卡包含 name,category,directionType,fitScore,confidence,summary,whySuitable,
matchedEvidenceIds,transferableCapabilities,evidenceGaps,differenceFromExisting,transitionDifficulty,possibleTitles,nextActions,searchKeywords。
`.trim()

export const buildCareerInspirationInput = (input: unknown) => {
  if (!input || typeof input !== 'object') return JSON.stringify(input)
  const value = input as Record<string, unknown>
  const compactNames = (items: unknown) =>
    (Array.isArray(items) ? items : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/gu, ' ').trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 20)
  return JSON.stringify({
    evidenceUnits: compactCareerEvidenceUnits(value.evidenceUnits),
    savedDirections: compactNames(value.savedDirections),
    excludedDirections: compactNames(value.excludedDirections),
    feedback: Array.isArray(value.feedback) ? value.feedback.slice(0, 20) : [],
    preferences: value.preferences ?? {},
  })
}
