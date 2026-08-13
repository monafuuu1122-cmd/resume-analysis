import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  requestCareerDirectionAnalysis,
  requestCareerInspiration,
} from '../ai/client'
import { sanitizeVisibleAIText } from '../ai/safeOutput'
import {
  deleteCareerDirection,
  ensureLegacyCareerDirections,
  listCareerDirectionFeedback,
  listCareerDirections,
  saveCareerDirection,
  saveCareerDirectionMarketAnalysis,
  saveCareerDirectionFeedback,
  updateCareerDirectionStatus,
} from '../db/careerDirectionRepository'
import { buildCareerEvidenceUnits } from '../domain/careerEvidence'
import {
  analyzeCareerDirection,
  matchCareerEvidence,
} from '../domain/careerMatching'
import {
  type CareerInspirationCard,
  type CareerInspirationResult,
} from '../domain/careerSchemas'
import type { CareerDirection } from '../domain/types'
import { useCareerInspiration } from '../hooks/useCareerInspiration'
import { useConfirmedEvidence } from '../hooks/useConfirmedEvidence'

const now = () => new Date().toISOString()
const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const compactEvidenceExcerpt = (value: string, maxLength = 90) => {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  const firstClause = normalized.split(/[。！？；\n]/u)[0]?.trim() || normalized
  return firstClause.length > maxLength
    ? `${firstClause.slice(0, maxLength).trimEnd()}…`
    : firstClause
}

export default function RoleDirectionsPage() {
  const { error, loading, snapshot } = useConfirmedEvidence()
  const [directions, setDirections] = useState<CareerDirection[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [inspiration, setInspiration] =
    useState<CareerInspirationResult | null>(null)
  const [inspirationOpen, setInspirationOpen] = useState(false)
  const [directionError, setDirectionError] = useState('')
  const [marketLoadingId, setMarketLoadingId] = useState<string | null>(null)
  const [marketErrors, setMarketErrors] = useState<Record<string, string>>({})

  const reload = async () => {
    try {
      await ensureLegacyCareerDirections()
      setDirections(await listCareerDirections())
      setDirectionError('')
    } catch (caught) {
      setDirectionError(
        caught instanceof Error ? caught.message : '岗位方向读取失败',
      )
    }
  }
  useEffect(() => {
    void reload()
  }, [])

  const units = useMemo(
    () => (snapshot ? buildCareerEvidenceUnits(snapshot) : []),
    [snapshot],
  )
  const analyzed = useMemo(
    () => directions.map((direction) => analyzeCareerDirection(direction, units)),
    [directions, units],
  )

  const addDirection = async () => {
    const name = newName.trim()
    if (!name) return
    await saveCareerDirection({
      id: id('direction'),
      name,
      normalizedName: name.normalize('NFKC').toLocaleLowerCase('zh-CN'),
      description: '由你手动添加的探索方向。',
      source: 'user-created',
      status: 'exploring',
      matchedEvidence: [],
      transferableCapabilities: [],
      evidenceGaps: [],
      possibleTitles: [],
      adjacentDirections: [],
      developmentSuggestions: [],
      updatedAt: now(),
    })
    setAdding(false)
    setNewName('')
    await reload()
  }

  const requestInspiration = useCallback(async (signal: AbortSignal) => {
    const feedback = await listCareerDirectionFeedback()
    return requestCareerInspiration(
      {
        evidenceUnits: units,
        savedDirections: directions.map((item) => item.name),
        excludedDirections: feedback
          .filter((item) => item.feedback === 'not-interested')
          .map((item) => item.directionName),
        feedback,
      },
      signal,
    )
  }, [directions, units])
  const inspirationLifecycle = useCareerInspiration({
    request: requestInspiration,
  })

  useEffect(() => {
    if (inspirationLifecycle.result) {
      setInspiration(inspirationLifecycle.result)
    }
  }, [inspirationLifecycle.result])

  const generate = () => {
    setInspirationOpen(true)
    void inspirationLifecycle.generate()
  }

  const saveSuggestion = async (card: CareerInspirationCard & { id: string }) => {
    const evidenceById = new Map(units.map((unit) => [unit.id, unit]))
    const matchedEvidence = card.matchedEvidenceIds.flatMap((evidenceId) => {
      const unit = evidenceById.get(evidenceId)
      if (!unit) return []
      const match = matchCareerEvidence(
        {
          name: card.name,
          description: card.summary,
          category: card.category,
          possibleTitles: card.possibleTitles,
        },
        unit,
        { force: true },
      )
      return match ? [match] : []
    })
    await saveCareerDirection({
      id: card.id,
      name: card.name,
      normalizedName: card.name.normalize('NFKC').toLocaleLowerCase('zh-CN'),
      category: card.category,
      description: card.summary,
      source: 'ai-recommended',
      status: 'interested',
      fitScore: card.fitScore,
      confidence: card.confidence,
      matchedEvidence,
      transferableCapabilities: [],
      evidenceGaps: card.evidenceGaps.map((gap) => ({
        requirement: gap,
        missingEvidence: gap,
        suggestion: '补充一段可验证的相关经历或案例。',
        priority: 'medium',
      })),
      possibleTitles: card.possibleTitles,
      adjacentDirections: [],
      developmentSuggestions: card.nextActions,
      recommendationReason: card.whySuitable,
      generatedAt: now(),
      updatedAt: now(),
    })
    setInspirationOpen(false)
    await reload()
  }

  const excludeSuggestion = async (
    card: CareerInspirationCard & { id: string },
  ) => {
    await saveCareerDirectionFeedback({
      id: id('feedback'),
      directionId: card.id,
      directionName: card.name,
      feedback: 'not-interested',
      createdAt: now(),
    })
    setInspiration((current) =>
      current
        ? {
            ...current,
            directions: current.directions.filter((item) => item.id !== card.id),
          }
        : current,
    )
  }

  const generateMarketAnalysis = async (direction: CareerDirection) => {
    if (marketLoadingId) return
    const controller = new AbortController()
    setMarketLoadingId(direction.id)
    setMarketErrors((current) => ({ ...current, [direction.id]: '' }))
    try {
      const result = await requestCareerDirectionAnalysis({
        directionId: direction.id,
        directionName: direction.name,
        possibleTitles: direction.possibleTitles,
        evidenceUnits: units,
      }, controller.signal)
      await saveCareerDirectionMarketAnalysis(direction.id, result)
      await reload()
    } catch (caught) {
      setMarketErrors((current) => ({
        ...current,
        [direction.id]: caught instanceof Error
          ? caught.message
          : '岗位分析暂时不可用，请稍后重试。',
      }))
    } finally {
      setMarketLoadingId(null)
    }
  }

  return (
    <section className="page" aria-labelledby="role-directions-title">
      <div className="page-heading-row">
        <div>
          <h1 id="role-directions-title">岗位方向</h1>
          <p className="page-intro">
            从完整经历档案中寻找直接匹配与可迁移能力，也可以请DeepSeek打开新的职业思路。
          </p>
        </div>
        <div className="page-actions">
          <button
            className="pill-button"
            disabled={inspirationLifecycle.busy}
            onClick={generate}
            type="button"
          >
            获取岗位灵感
          </button>
          <button className="pill-button" onClick={() => setAdding(true)} type="button">
            新增方向
          </button>
        </div>
      </div>

      {adding && (
        <div className="inline-editor">
          <label>
            方向名称
            <input
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              value={newName}
            />
          </label>
          <button className="pill-button" onClick={() => void addDirection()} type="button">
            保存方向
          </button>
          <button className="text-button" onClick={() => setAdding(false)} type="button">
            取消
          </button>
        </div>
      )}

      {loading && <p role="status">正在分析已确认的经历证据…</p>}
      {(error || directionError) && (
        <p role="alert">本地存储失败：{error || directionError}</p>
      )}
      {!loading && !error && !directionError && units.length === 0 && (
        <div className="empty-state compact-empty-state">
          <h2>还没有已确认的证据</h2>
          <p>补充经历并确认提炼结果后，匹配理由会更有依据。</p>
          <Link className="text-link" to="/experiences">去补充经历</Link>
        </div>
      )}

      {!loading && !error && !directionError && (
        <div className="role-grid">
          {analyzed.map((direction, index) => (
            <DirectionCard
              direction={direction}
              expanded={expanded.has(direction.id)}
              index={index}
              key={direction.id}
              onDelete={async () => {
                await deleteCareerDirection(direction.id)
                await reload()
              }}
              onStatus={async (status) => {
                await updateCareerDirectionStatus(direction.id, status)
                await reload()
              }}
              marketError={marketErrors[direction.id]}
              marketLoading={marketLoadingId === direction.id}
              onGenerateMarket={() => generateMarketAnalysis(direction)}
              onToggle={() =>
                setExpanded((current) => {
                  const next = new Set(current)
                  next.has(direction.id)
                    ? next.delete(direction.id)
                    : next.add(direction.id)
                  return next
                })
              }
            />
          ))}
        </div>
      )}

      {inspirationOpen && (
        <div aria-label="岗位灵感" aria-modal="true" className="career-dialog" role="dialog">
          <div className="career-dialog-card">
            <button
              aria-label="关闭岗位灵感"
              className="dialog-close"
              onClick={() => {
                if (inspirationLifecycle.busy) inspirationLifecycle.cancel()
                setInspirationOpen(false)
              }}
              type="button"
            >
              ×
            </button>
            <h2>岗位灵感</h2>
            {inspirationLifecycle.status === 'checking-ai-service' && (
              <p className="career-stage" role="status">
                正在检测智能分析服务…
              </p>
            )}
            {inspirationLifecycle.status === 'reading-profile' && (
              <p className="career-stage" role="status">
                正在重新阅读你的经历档案
              </p>
            )}
            {inspirationLifecycle.status === 'generating' && (
              <p className="career-stage" role="status">
                正在生成并整理可用方向…
              </p>
            )}
            {inspirationLifecycle.busy && (
              <button
                className="text-button"
                onClick={inspirationLifecycle.cancel}
                type="button"
              >
                停止生成
              </button>
            )}
            {inspirationLifecycle.error &&
              !inspirationLifecycle.busy && (
              <div className="empty-state compact-empty-state" role="alert">
                <p>{inspirationLifecycle.error}</p>
                <button className="pill-button" onClick={generate} type="button">
                  重新检测并重试
                </button>
                <a className="text-link" href="/settings">查看配置说明</a>
              </div>
              )}
            {inspiration?.status === 'insufficient-profile' && (
              <p>经历证据还不够，先补充并确认至少一段经历。</p>
            )}
            <div className="inspiration-grid">
              {inspiration?.directions.map((card) => (
                <article className="inspiration-card" key={card.id}>
                  <div className="role-score">
                    <div>
                      <h3>{sanitizeVisibleAIText(card.name)}</h3>
                      <span className="match-band">{card.directionType}</span>
                    </div>
                    <strong>{card.fitScore}%</strong>
                  </div>
                  <p>{sanitizeVisibleAIText(card.summary)}</p>
                  <p><strong>为什么适合：</strong>{sanitizeVisibleAIText(card.whySuitable)}</p>
                  <div className="chip-row">
                    {card.possibleTitles.map((title) => (
                      <span className="keyword-chip" key={title}>{sanitizeVisibleAIText(title)}</span>
                    ))}
                  </div>
                  <div className="page-actions">
                    <button
                      aria-label={`加入岗位方向 ${card.name}`}
                      className="pill-button"
                      onClick={() => void saveSuggestion(card)}
                      type="button"
                    >
                      加入岗位方向
                    </button>
                    <button
                      aria-label={`排除岗位方向 ${card.name}`}
                      className="text-button"
                      onClick={() => void excludeSuggestion(card)}
                      type="button"
                    >
                      不感兴趣
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function DirectionCard({
  direction,
  expanded,
  index,
  onDelete,
  onStatus,
  marketError,
  marketLoading,
  onGenerateMarket,
  onToggle,
}: {
  direction: CareerDirection
  expanded: boolean
  index: number
  onDelete: () => Promise<void>
  onStatus: (status: CareerDirection['status']) => Promise<void>
  marketError?: string
  marketLoading: boolean
  onGenerateMarket: () => Promise<void>
  onToggle: () => void
}) {
  const detailId = `role-direction-detail-${index}`
  const score = direction.marketAnalysis?.fitScore ?? direction.fitScore ?? 0
  const band = score >= 70 ? '优先探索' : score >= 35 ? '可尝试' : '待积累'
  return (
    <article className="role-card">
      <div className="role-score">
        <div>
          <h2>{sanitizeVisibleAIText(direction.name)}</h2>
          <span className={`match-band match-band-${band}`}>{band}</span>
        </div>
        <strong aria-label={`匹配度 ${score}%`}>{score}%</strong>
      </div>
      <div className="direction-toolbar">
        <select
          aria-label={`${direction.name}探索状态`}
          onChange={(event) =>
            void onStatus(event.target.value as CareerDirection['status'])
          }
          value={direction.status}
        >
          <option value="exploring">探索中</option>
          <option value="interested">感兴趣</option>
          <option value="primary">主方向</option>
          <option value="secondary">备选方向</option>
          <option value="archived">已归档</option>
        </select>
        <button
          aria-controls={detailId}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'}“${direction.name}”的分析`}
          className="pill-button"
          onClick={onToggle}
          type="button"
        >
          {expanded ? '收起分析' : '查看分析'}
        </button>
        <button
          aria-label={`删除方向 ${direction.name}`}
          className="text-button danger-text"
          onClick={() => void onDelete()}
          type="button"
        >
          删除
        </button>
      </div>
      {expanded && (
        <div className="role-detail" id={detailId}>
          <div className="market-analysis-actions">
            <div>
              <h3>岗位要求与经历对照</h3>
              <p>根据常见岗位知识整理要求，再与你的档案逐条对照。</p>
            </div>
            <button
              className="pill-button"
              disabled={marketLoading}
              onClick={() => void onGenerateMarket()}
              type="button"
            >
              {marketLoading
                ? '正在整理岗位要求并对照经历…'
                : direction.marketAnalysis
                  ? '重新生成岗位分析'
                  : '生成岗位分析'}
            </button>
          </div>
          {marketError && <p className="inline-error" role="alert">{marketError}</p>}
          {direction.marketAnalysis ? (
            <>
              <section aria-label="市场岗位要求逐条对照">
                <h3>市场岗位要求逐条对照</h3>
                <div className="market-requirement-list">
                  {direction.marketAnalysis.requirements.map((item) => (
                    <article className="market-requirement-card" key={item.id}>
                      <div className="market-requirement-heading">
                        <strong>{sanitizeVisibleAIText(item.requirement)}</strong>
                        <span className={`market-match-status status-${item.matchStatus}`}>
                          {{
                            advantage: '优势',
                            'basic-match': '基本匹配',
                            'evidence-gap': '证据不足',
                            'clear-gap': '明显短板',
                            confirm: '待确认',
                          }[item.matchStatus]}
                        </span>
                      </div>
                      {item.evidenceExcerpts.length > 0 ? (
                        <div className="market-evidence-excerpts">
                          <span>你的对应经历</span>
                          {item.evidenceExcerpts.map((excerpt) => (
                            <blockquote key={excerpt}>{sanitizeVisibleAIText(excerpt)}</blockquote>
                          ))}
                        </div>
                      ) : <p className="muted-copy">当前档案暂无直接证据。</p>}
                      <p><strong>为什么匹配：</strong>{sanitizeVisibleAIText(item.matchReason)}</p>
                      <p><strong>准备建议：</strong>{sanitizeVisibleAIText(item.preparationAdvice)}</p>
                    </article>
                  ))}
                </div>
              </section>
              <GapSection
                items={direction.marketAnalysis.capabilityGaps}
                label="需补充能力"
              />
              <GapSection
                items={direction.marketAnalysis.mindsetGaps}
                label="需建立的岗位思维"
              />
            </>
          ) : (
            <p className="muted-copy">尚未生成岗位要求对照，下方为本地经历的初步匹配。</p>
          )}
          <section aria-label="匹配证据">
            <h3>{direction.marketAnalysis ? '档案补充证据' : '匹配证据'}</h3>
            {direction.matchedEvidence.length ? (
              <ul>
                {direction.matchedEvidence.slice(0, 4).map((evidence) => (
                  <li key={evidence.id}>
                    <strong>{sanitizeVisibleAIText(evidence.sourceLabel)}</strong>
                    <span>：{sanitizeVisibleAIText(evidence.matchAngle)}</span>
                    <blockquote>
                      {compactEvidenceExcerpt(sanitizeVisibleAIText(evidence.originalText))}
                    </blockquote>
                  </li>
                ))}
              </ul>
            ) : <p>暂无可追溯证据，建议补充相关项目事实。</p>}
          </section>
          <section aria-label="待补缺口">
            <h3>待补缺口</h3>
            <p>{direction.evidenceGaps.length
              ? direction.evidenceGaps.map((gap) => sanitizeVisibleAIText(gap.requirement)).join('、')
              : '根据目标 JD 继续核对专业要求与成果数据。'}</p>
          </section>
          <section aria-label="建议搜索词">
            <h3>建议搜索词</h3>
            <div className="chip-row">
              {[direction.name, ...direction.possibleTitles].map((keyword) => (
                <button
                  aria-label={`复制搜索词“${keyword}”`}
                  className="keyword-chip"
                  key={keyword}
                  onClick={() => void navigator.clipboard?.writeText(keyword)}
                  type="button"
                >
                  {sanitizeVisibleAIText(keyword)}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </article>
  )
}

function GapSection({
  items,
  label,
}: {
  items: NonNullable<CareerDirection['marketAnalysis']>['capabilityGaps']
  label: '需补充能力' | '需建立的岗位思维'
}) {
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      {items.length ? (
        <ul className="market-gap-list">
          {items.map((item) => (
            <li key={`${item.title}-${item.action}`}>
              <strong>{sanitizeVisibleAIText(item.title)}</strong>
              <p>{sanitizeVisibleAIText(item.reason)}</p>
              <p><strong>行动：</strong>{sanitizeVisibleAIText(item.action)}</p>
            </li>
          ))}
        </ul>
      ) : <p>当前没有明确缺口，仍建议结合具体 JD 复核。</p>}
    </section>
  )
}
