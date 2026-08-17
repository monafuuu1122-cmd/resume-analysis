import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useStore } from 'zustand'

import { AIServiceError, requestJdAnalysis } from '../ai/client'
import { parseJdAnalysis, readJdAnalysis } from '../ai/interviewParsers'
import { sanitizeVisibleAIText } from '../ai/safeOutput'
import {
  createAnalysisJob,
  getAnalysisJob,
  updateAnalysisJob,
} from '../db/analysisJobRepository'
import { loadConfirmedEvidenceSnapshot } from '../db/evidenceRepository'
import { getJdRecord } from '../db/jdRepository'
import { getResumeVersion } from '../db/resumeVersionRepository'
import { migrateIfNeeded } from '../db/localDataMigration'
import {
  createAnalysisInputHash,
  type AnalysisJob,
} from '../domain/analysisJobs'
import { buildInterviewProfileContext } from '../domain/interviewContext'
import type { JdAnalysis, JdRecord } from '../domain/types'
import type { ResumeVersion } from '../domain/types'
import { interviewProfileContextSchema } from '../domain/schemas'
import { jdStore } from '../stores/jdStore'
import InterviewResearchPanel from '../components/interview/InterviewResearchPanel'
import AnalysisProgress from '../components/jd/AnalysisProgress'
import ResumeVersionPicker from '../components/jd/ResumeVersionPicker'

type ResultTab = 'diagnosis' | 'resume' | 'interview'

const tabLabels: Record<ResultTab, string> = {
  diagnosis: '适配诊断',
  resume: '简历改写',
  interview: '面试准备',
}

export default function JdLabPage() {
  const [routeQuery, setRouteQuery] = useState(() => window.location.search)
  const searchParams = useMemo(() => new URLSearchParams(routeQuery), [routeQuery])
  const draft = useStore(jdStore, (state) => state.draft)
  const selectedRecord = useStore(jdStore, (state) => state.selectedRecord)
  const records = useStore(jdStore, (state) => state.records)
  const companyTargets = useStore(jdStore, (state) => state.companyTargets)
  const loadingRecords = useStore(jdStore, (state) => state.loading)
  const updateDraft = useStore(jdStore, (state) => state.updateDraft)
  const [activeTab, setActiveTab] = useState<ResultTab>(() => {
    const tab = searchParams.get('tab')
    return tab === 'resume' || tab === 'interview' ? tab : 'diagnosis'
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [activeJob, setActiveJob] = useState<AnalysisJob>()
  const [selectedResumeVersion, setSelectedResumeVersion] =
    useState<ResumeVersion>()

  useEffect(() => {
    let active = true
    if (!selectedRecord?.resumeVersionId) {
      setSelectedResumeVersion(undefined)
      return
    }
    void getResumeVersion(selectedRecord.resumeVersionId).then((version) => {
      if (active) setSelectedResumeVersion(version)
    })
    return () => {
      active = false
    }
  }, [selectedRecord?.id, selectedRecord?.resumeVersionId])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await migrateIfNeeded()
        if (!active) return
        await Promise.all([
          jdStore.getState().loadRecords(),
          jdStore.getState().loadCompanyTargets(),
        ])
        const analysisId = new URLSearchParams(window.location.search).get('analysisId')
        if (active && analysisId) await jdStore.getState().selectRecord(analysisId)
      } catch {
        // A test or page transition may close the local database while the
        // initial read is still pending. The next mount will retry it.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedRecord?.activeJobId) {
      setActiveJob(undefined)
      return
    }
    void getAnalysisJob(selectedRecord.activeJobId).then((job) => {
      if (active) setActiveJob(job)
    })
    return () => {
      active = false
    }
  }, [selectedRecord?.activeJobId, selectedRecord?.analysisStatus])

  const analysis = useMemo(
    () =>
      selectedRecord?.analysisStatus === 'completed'
        ? readJdAnalysis(selectedRecord.analysis)
        : null,
    [selectedRecord],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!draft.company.trim()) {
      setError('请先添加并选择企业')
      return
    }
    if (!draft.role.trim()) {
      setError('请输入岗位名称')
      return
    }
    setSubmitting(true)
    let pendingRecord: JdRecord | undefined
    let jobId: string | undefined
    try {
      await migrateIfNeeded()
      const snapshot = await loadConfirmedEvidenceSnapshot()
      const selectedVersion = selectedResumeVersion
      const profileSnapshot = selectedVersion
        ? interviewProfileContextSchema.parse({
            ...selectedVersion.profileSnapshot,
            resumeText: selectedVersion.resumeText,
            resumeVersionId: selectedVersion.id,
            resumeVersionName: selectedVersion.name,
          })
        : buildInterviewProfileContext(snapshot)
      const now = new Date().toISOString()
      const analysisId =
        globalThis.crypto?.randomUUID?.() ??
        `jd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const inputSnapshot = {
        company: draft.company.trim(),
        companyWebsite: draft.companyWebsite.trim() || undefined,
        companyIndustry: draft.companyIndustry.trim() || undefined,
        role: draft.role.trim(),
        jdText: draft.jdText.trim(),
        profileSnapshot,
        ...(selectedVersion
          ? {
              resumeVersionId: selectedVersion.id,
              resumeVersionName: selectedVersion.name,
              resumeSnapshot: {
                id: selectedVersion.id,
                name: selectedVersion.name,
                source: selectedVersion.source,
                resumeText: selectedVersion.resumeText,
              },
            }
          : {}),
      }
      const inputHash = await createAnalysisInputHash(inputSnapshot)
      const job = await createAnalysisJob({ analysisId, inputHash })
      jobId = job.id
      pendingRecord = {
        id: analysisId,
        company: draft.company.trim(),
        companyWebsite: draft.companyWebsite.trim() || undefined,
        companyIndustry: draft.companyIndustry.trim() || undefined,
        companyTargetId: draft.selectedCompanyTargetId,
        role: draft.role.trim(),
        jdText: draft.jdText.trim(),
        profileSnapshot,
        ...(selectedVersion
          ? {
              resumeVersionId: selectedVersion.id,
              resumeVersionName: selectedVersion.name,
              resumeSnapshot: {
                id: selectedVersion.id,
                name: selectedVersion.name,
                source: selectedVersion.source,
                resumeText: selectedVersion.resumeText,
              },
            }
          : {}),
        inputSnapshot,
        inputHash,
        parentAnalysisId: selectedRecord?.id,
        activeJobId: job.id,
        analysisStatus: 'analyzing',
        createdAt: now,
        updatedAt: now,
      }
      await jdStore.getState().persistRecord(pendingRecord)
      await updateAnalysisJob(job.id, analysisId, {
        status: 'running',
        currentStage: 'jd-analysis',
        startedAt: now,
      })
      const result = parseJdAnalysis(
        await requestJdAnalysis(
          draft.jdText,
          profileSnapshot,
          {
            companyName: draft.company.trim(),
            companyWebsite: draft.companyWebsite.trim() || undefined,
            companyIndustry: draft.companyIndustry.trim() || undefined,
            roleName: draft.role.trim(),
          },
        ),
      )
      const analysisWithIdentity = {
        ...result,
        company: draft.company.trim(),
        role: draft.role.trim(),
      }
      const current = await getJdRecord(analysisId)
      if (
        current?.activeJobId !== job.id ||
        current.inputHash !== inputHash
      ) {
        await updateAnalysisJob(job.id, analysisId, {
          status: 'cancelled',
          errorCode: 'STALE_ANALYSIS_RESULT',
          errorMessage: '结果对应的分析上下文已变化',
        })
        return
      }
      const completedAt = new Date().toISOString()
      await jdStore.getState().persistRecord({
        ...current,
        analysisStatus: 'completed',
        analysis: analysisWithIdentity,
        completedAt,
        updatedAt: completedAt,
      })
      await updateAnalysisJob(job.id, analysisId, {
        status: 'completed',
        currentStage: 'resume-match',
        completedAt,
      })
      setActiveTab('diagnosis')
    } catch (caught) {
      if (pendingRecord && jobId) {
        const status =
          caught instanceof AIServiceError && caught.code === 'DEEPSEEK_TIMEOUT'
            ? 'timeout'
            : caught instanceof AIServiceError && caught.code === 'DEEPSEEK_ABORTED'
              ? 'cancelled'
              : 'failed'
        const updatedAt = new Date().toISOString()
        await jdStore.getState().persistRecord({
          ...pendingRecord,
          analysisStatus: status,
          updatedAt,
        })
        await updateAnalysisJob(jobId, pendingRecord.id, {
          status,
          errorCode:
            caught instanceof AIServiceError ? caught.code : 'ANALYSIS_FAILED',
          errorMessage:
            caught instanceof Error ? caught.message : 'JD 分析失败',
        })
      }
      setError(
        caught instanceof Error ? caught.message : 'JD 分析失败，请重试',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page" aria-labelledby="jd-lab-title">
      <h1 id="jd-lab-title">JD 实验室</h1>
      <p className="page-intro">
        粘贴完整岗位描述，只用已确认且可回溯原文的经历证据进行适配分析。
      </p>

      <div className="jd-lab-layout">
        <form className="stack-form jd-input-panel" onSubmit={submit}>
          <ResumeVersionPicker
            selectedId={selectedResumeVersion?.id}
            onSelect={setSelectedResumeVersion}
          />
          <CompanyTargetPicker companyTargets={companyTargets} />
          <label>
            岗位名称
            <input
              required
              placeholder="例如：品牌内容策略"
              value={draft.role}
              onChange={(event) => updateDraft({ role: event.target.value })}
            />
          </label>
          <label>
            完整 JD
            <textarea
              required
              rows={12}
              value={draft.jdText}
              onChange={(event) =>
                updateDraft({ jdText: event.target.value })
              }
            />
          </label>
          <button disabled={submitting} type="submit">
            {submitting
              ? '正在分析…'
              : selectedRecord?.analysisStatus === 'completed'
                  ? '开始新分析'
                  : selectedRecord
                    ? '重新分析'
                    : '开始分析'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>

        <aside className="jd-records" aria-label="历史 JD">
          <h2>历史记录</h2>
          {loadingRecords && <p role="status">正在读取…</p>}
          {!loadingRecords && records.length === 0 && <p>暂无已保存记录</p>}
          <ul className="jd-history-list">
            {records.map((record) => (
              <li className="jd-history-pill" key={record.id}>
                <button
                  aria-pressed={record.id === selectedRecord?.id}
                  className="jd-history-pill-main"
                  onClick={() => void jdStore.getState().selectRecord(record.id)}
                  title={`${record.analysisStatus ?? 'pending'} · ${new Date(
                    record.createdAt ?? record.updatedAt,
                  ).toLocaleString('zh-CN')}`}
                  type="button"
                >
                  {record.company} · {record.role}
                  {record.resumeVersionName && (
                    <small> · {record.resumeVersionName}</small>
                  )}
                </button>
                <button
                  aria-label={`删除分析 ${record.company} · ${record.role}`}
                  className="jd-history-pill-delete"
                  onClick={() => {
                    if (
                      window.confirm(
                        `确认删除“${record.company} · ${record.role}”这条分析记录？`,
                      )
                    ) {
                      void jdStore.getState().deleteRecord(record.id)
                    }
                  }}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {selectedRecord && (
        <AnalysisProgress job={activeJob} record={selectedRecord} />
      )}

      <div className="jd-results">
        <div aria-label="JD 分析结果" className="jd-tabs" role="tablist">
          {(Object.keys(tabLabels) as ResultTab[]).map((tab) => (
            <button
              aria-controls={`jd-panel-${tab}`}
              aria-selected={activeTab === tab}
              id={`jd-tab-${tab}`}
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                const next = new URLSearchParams(searchParams)
                next.set('tab', tab)
                const nextQuery = `?${next.toString()}`
                window.history.replaceState({}, '', `/jd-lab${nextQuery}`)
                setRouteQuery(nextQuery)
              }}
              role="tab"
              type="button"
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {!analysis && selectedRecord && (
          <p className="empty-state">此记录需要重新分析</p>
        )}
        {!analysis && !selectedRecord && (
          <p className="empty-state">完成分析后，这里会显示证据覆盖和准备建议。</p>
        )}
        {analysis && (
          <ResultPanel
            activeTab={activeTab}
            analysis={analysis}
            record={selectedRecord!}
          />
        )}
      </div>
    </section>
  )
}

function CompanyTargetPicker({
  companyTargets,
}: {
  companyTargets: ReturnType<typeof jdStore.getState>['companyTargets']
}) {
  const draft = useStore(jdStore, (state) => state.draft)
  const selectedRecord = useStore(jdStore, (state) => state.selectedRecord)
  const companyTargetState = useStore(
    jdStore,
    (state) => state.companyTargetState,
  )
  const companyTargetError = useStore(
    jdStore,
    (state) => state.companyTargetError,
  )
  const activeCompanyTargetId = useStore(
    jdStore,
    (state) => state.activeCompanyTargetId,
  )
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string>()

  const add = async () => {
    if (!name.trim()) {
      setError('请输入企业名称')
      return
    }
    try {
      await jdStore.getState().addCompanyTarget({
        name,
        website,
        industry,
      })
      setName('')
      setWebsite('')
      setIndustry('')
      setError(undefined)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '企业信息保存失败',
      )
    }
  }

  return (
    <section className="company-target-picker" aria-labelledby="company-target-title">
      <div>
        <p className="eyebrow">独立企业信息</p>
        <h2 id="company-target-title">企业目标</h2>
        <p>添加后选择本次 JD 对应的企业，研究不会再从长文本猜名称。</p>
      </div>
      <label>
        企业名称
        <input
          placeholder="例如：字节跳动、Nike、L'Oréal"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        企业官网（可选）
        <input
          inputMode="url"
          placeholder="用于准确识别同名企业"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>
      <label>
        所属行业（可选）
        <input
          placeholder="仅用于消除企业歧义"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
      </label>
      <button
        className="secondary-button"
        aria-busy={companyTargetState === 'saving'}
        onClick={() => void add()}
        type="button"
      >
        添加企业
      </button>
      {companyTargetState === 'saving' && (
        <p role="status">正在添加企业…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {companyTargetState === 'loading' && (
        <p role="status">正在读取企业列表…</p>
      )}
      {companyTargetState === 'failed' && companyTargetError && (
        <div role="alert">
          <p>企业列表操作失败：{companyTargetError}</p>
          <button
            className="text-button"
            onClick={() => void jdStore.getState().retryCompanyTargets()}
            type="button"
          >
            重试企业列表
          </button>
        </div>
      )}
      {companyTargets.length === 0 ? (
        <p className="muted">尚未添加企业</p>
      ) : (
        <ul className="company-target-list">
          {companyTargets.map((target) => (
            <li key={target.id}>
              <button
                aria-label={`选择企业 ${target.name}`}
                aria-pressed={draft.selectedCompanyTargetId === target.id}
                className="company-target-main"
                disabled={companyTargetState === 'loading'}
                onClick={() =>
                  jdStore.getState().selectCompanyTarget(target.id)
                }
                type="button"
              >
                <strong>{target.name}</strong>
                <span>
                  {[target.industry, target.website].filter(Boolean).join(' · ') ||
                    '未补充官网与行业'}
                </span>
              </button>
              <button
                aria-label={`删除企业 ${target.name}`}
                className="danger-button company-target-delete"
                disabled={
                  companyTargetState === 'deleting' &&
                  activeCompanyTargetId === target.id
                }
                onClick={() => {
                  void jdStore
                    .getState()
                    .deleteCompanyTarget(target.id)
                    .catch((caught) =>
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : '企业信息删除失败',
                      ),
                    )
                }}
                type="button"
              >
                {companyTargetState === 'deleting' &&
                activeCompanyTargetId === target.id
                  ? '删除中…'
                  : '删除'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedRecord &&
        draft.company.trim() &&
        (selectedRecord.company !== draft.company.trim() ||
          selectedRecord.companyWebsite !==
            (draft.companyWebsite.trim() || undefined) ||
          selectedRecord.companyIndustry !==
            (draft.companyIndustry.trim() || undefined)) && (
          <button
            className="secondary-button"
            onClick={() =>
              void jdStore.getState().applySelectedCompanyToRecord()
            }
            type="button"
          >
            绑定到当前 JD
          </button>
        )}
    </section>
  )
}

function ResultPanel({
  activeTab,
  analysis,
  record,
}: {
  activeTab: ResultTab
  analysis: JdAnalysis
  record: JdRecord
}) {
  return (
    <section
      aria-labelledby={`jd-tab-${activeTab}`}
      className="jd-result-panel"
      id={`jd-panel-${activeTab}`}
      role="tabpanel"
    >
      <div className="button-row">
        <a className="text-link" href={`/jd-lab/${record.id}/interview?returnTo=${encodeURIComponent(`/jd-lab?analysisId=${record.id}&tab=${activeTab}`)}`}>
          开始模拟面试
        </a>
      </div>
      {activeTab === 'diagnosis' && (
        <>
          <div className="jd-summary">
            <div>
              <h2>{sanitizeVisibleAIText(analysis.company)} · {sanitizeVisibleAIText(analysis.role)}</h2>
              <p>
                {sanitizeVisibleAIText(analysis.department)} / {sanitizeVisibleAIText(analysis.location)} / {sanitizeVisibleAIText(analysis.level)}
              </p>
            </div>
            <strong aria-label={`适配度 ${analysis.matchScore}%`}>
              {analysis.matchScore}%
            </strong>
          </div>
          <p>{sanitizeVisibleAIText(analysis.evidenceCoverage)}</p>
          <AnalysisList title="当前优势" items={analysis.strengths} />
          <AnalysisList title="证据缺口" items={analysis.gaps} />
        </>
      )}
      {activeTab === 'resume' && (
        <>
          <h2>基于原事实的简历改写</h2>
          {analysis.resumeRewrites.length === 0 ? (
            <p>没有可安全改写的已确认证据。</p>
          ) : (
            <ul>
              {analysis.resumeRewrites.map((rewrite) => (
                <ResumeRewriteItem
                  key={`${rewrite.sourceClaimId}-${rewrite.rewritten}`}
                  record={record}
                  rewrite={rewrite}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {activeTab === 'interview' && (
        <>
          <h2>面试准备维度</h2>
          {analysis.interviewDimensions.length === 0 ? (
            <p>暂无可生成的面试准备维度。</p>
          ) : (
            <ul>
              {analysis.interviewDimensions.map((item) => (
                <li key={`${item.dimension}-${item.priority}`}>
                  <strong>{sanitizeVisibleAIText(item.dimension)}</strong>：{sanitizeVisibleAIText(item.focus)}
                </li>
              ))}
            </ul>
          )}
          <InterviewResearchPanel analysis={analysis} record={record} />
        </>
      )}
    </section>
  )
}

function ResumeRewriteItem({
  record,
  rewrite,
}: {
  record: JdRecord
  rewrite: JdAnalysis['resumeRewrites'][number]
}) {
  const claimIds = new Set([
    rewrite.sourceClaimId,
    ...(rewrite.supportingClaimIds ?? []),
  ])
  const evidenceLabels =
    record.profileSnapshot?.claims
      .filter(({ id }) => claimIds.has(id))
      .map(({ label }) => label) ?? []
  const materialIds = new Set(rewrite.profileMaterialIds ?? [])
  const materialLabels =
    record.profileSnapshot?.profileMaterials
      ?.filter(({ id }) => materialIds.has(id))
      .map(({ title }) => title) ?? []

  return (
    <li>
      {rewrite.targetRequirement && (
        <p className="eyebrow">对应 JD：{sanitizeVisibleAIText(rewrite.targetRequirement)}</p>
      )}
      <p><strong>{sanitizeVisibleAIText(rewrite.rewritten)}</strong></p>
      <p>原始事实：{sanitizeVisibleAIText(rewrite.original)}</p>
      {(evidenceLabels.length > 0 || materialLabels.length > 0) && (
        <p>
          调用证据：{[...evidenceLabels, ...materialLabels].join('、')}
        </p>
      )}
      <p>{sanitizeVisibleAIText(rewrite.rationale)}</p>
    </li>
  )
}

function AnalysisList({
  items,
  title,
}: {
  items: Array<{ title: string; explanation: string }>
  title: string
}) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p>待补充</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={`${item.title}-${item.explanation}`}>
              <strong>{sanitizeVisibleAIText(item.title)}</strong>：{sanitizeVisibleAIText(item.explanation)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
