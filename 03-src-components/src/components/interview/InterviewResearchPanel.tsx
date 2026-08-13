import { useEffect, useMemo, useRef, useState } from 'react'

import { aiRequestBody, serviceError } from '../../ai/client'
import {
  activateInterviewResearchVersion,
  getInterviewResearchForRecord,
  saveInterviewResearch,
} from '../../db/interviewRepository'
import { createAnalysisInputHash } from '../../domain/analysisJobs'
import { interviewResearchSchema } from '../../domain/interviewSchemas'
import type {
  InterviewResearch,
  JdAnalysis,
  JdRecord,
} from '../../domain/types'
import '../../styles/interview-research.css'
import CompanyCultureSection from './CompanyCultureSection'
import CompetencyMatrix from './CompetencyMatrix'
import InterviewPreparationChecklist from './InterviewPreparationChecklist'
import InterviewPriorityList from './InterviewPriorityList'
import PredictedQuestionList from './PredictedQuestionList'

type ResearchTab = 'company' | 'competencies' | 'priorities' | 'questions'
const tabs: Record<ResearchTab, string> = {
  company: '企业与人才画像',
  competencies: '岗位能力矩阵',
  priorities: '重点准备',
  questions: '高概率问题',
}
const statusCopy: Partial<Record<InterviewResearch['researchStatus'], string>> = {
  researching: '正在整理企业与岗位信息',
  generating: '正在生成面试重点',
  partial: '部分信息现有知识不足',
  uncertain: '企业身份仍需核实',
  'no-reliable-info': '现有知识不足',
  unavailable: '旧研究未完成，可直接使用DeepSeek重新生成。',
  failed: '面试研究生成失败',
}

export default function InterviewResearchPanel({
  analysis,
  record,
}: {
  analysis: JdAnalysis
  record: JdRecord
}) {
  const [research, setResearch] = useState<InterviewResearch>()
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [requestStage, setRequestStage] = useState<
    'searching' | 'reading' | 'analyzing'
  >('searching')
  const [activeTab, setActiveTab] = useState<ResearchTab>('company')
  const [error, setError] = useState<string>()
  const requestRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    requestRef.current?.abort()
    const generation = ++generationRef.current
    let active = true
    setLoading(true)
    setResearch(undefined)
    setError(undefined)
    void getInterviewResearchForRecord(record)
      .then((value) => {
        if (active && generation === generationRef.current) setResearch(value)
      })
      .catch(() => {
        if (active) setError('读取面试研究失败，请重试')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      requestRef.current?.abort()
    }
  }, [
    record.id,
    record.companyResearchId,
    record.activeJobId,
    record.inputHash,
    record.company,
  ])

  const summary = useMemo(() => {
    if (!research) return null
    const highPriorities = research.interviewPriorities.filter(
      (item) => item.priority === 'high',
    ).length
    const evidenceGaps = research.competencies.filter(
      (item) => item.assessment !== 'match',
    ).length
    const completed = research.preparationChecklist.filter(
      (item) => item.completed,
    ).length
    return { highPriorities, evidenceGaps, completed }
  }, [research])

  const generate = async () => {
    setError(undefined)
    if (!record.company.trim() || record.company === '待补充') {
      setError('请先在上方“企业目标”中添加企业，并绑定到当前 JD')
      return
    }
    setRequesting(true)
    setRequestStage('searching')
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const generation = ++generationRef.current
    const readingTimer = window.setTimeout(
      () => setRequestStage('reading'),
      8_000,
    )
    const analysisTimer = window.setTimeout(
      () => setRequestStage('analyzing'),
      22_000,
    )
    // The server may run two bounded DeepSeek stages (company context, then role
    // mapping). Keep the browser guard longer than their combined budget so a
    // slow but valid response is not cancelled halfway through the second stage.
    const timeout = window.setTimeout(() => controller.abort(), 300_000)
    try {
      const researchId =
        globalThis.crypto?.randomUUID?.() ??
        `research-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2)}`
      const [companyIdentityHash, jdHash, researchContextHash] =
        await Promise.all([
          createAnalysisInputHash({
            company: record.company,
            website: record.companyWebsite,
            industry: record.companyIndustry,
          }),
          createAnalysisInputHash(record.jdText),
          createAnalysisInputHash({
            inputHash: record.inputHash,
            analysis,
            profileSnapshot: record.profileSnapshot,
          }),
        ])
      const path = research
        ? `/api/interview-research/${encodeURIComponent(record.id)}/regenerate`
        : '/api/interview-research'
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: aiRequestBody({
          analysisId: record.id,
          researchId,
          jobId: record.activeJobId,
          companyIdentityHash,
          jdHash,
          researchContextHash,
          companyName: record.company,
          companyWebsite: record.companyWebsite,
          companyIndustry: record.companyIndustry,
          roleName: record.role,
          jdText: record.jdText,
          analysis,
          profileContext: record.profileSnapshot ?? {
            claims: [],
            experiences: [],
          },
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw serviceError(body, '面试研究生成失败，请重试')
      }
      const parsed = interviewResearchSchema.parse({
        ...(body as object),
        id: researchId,
        analysisId: record.id,
        jobId: record.activeJobId,
        companyName: record.company,
        companyIdentityHash,
        jdHash,
        researchContextHash,
      })
      const activated = await activateInterviewResearchVersion(parsed, {
        expectedCurrentResearchId: record.companyResearchId,
        jobId: record.activeJobId,
        inputHash: record.inputHash,
      })
      if (
        generation !== generationRef.current ||
        controller.signal.aborted
      ) {
        return
      }
      if (!activated) {
        setError('当前 JD 或企业信息已变化，本次旧研究已归档但不会覆盖当前结果。')
        return
      }
      setResearch(parsed)
      setActiveTab('company')
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === 'AbortError'
          ? '企业画像生成超时。可以重新尝试，已有 JD 分析不会受影响。'
          : caught instanceof Error
            ? caught.message
            : '面试研究生成失败，请重试',
      )
    } finally {
      window.clearTimeout(readingTimer)
      window.clearTimeout(analysisTimer)
      window.clearTimeout(timeout)
      if (generation === generationRef.current) {
        setRequesting(false)
      }
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const toggleChecklist = (id: string) => {
    if (!research) return
    const updated = {
      ...research,
      preparationChecklist: research.preparationChecklist.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
      updatedAt: new Date().toISOString(),
    }
    setResearch(updated)
    void saveInterviewResearch(updated).catch(() =>
      setError('清单保存失败，请重试'),
    )
  }

  if (loading) return <p className="research-status" role="status">正在读取面试研究…</p>
  if (!research) {
    return (
      <section className="research-empty">
        <h3>这条 JD 还没有面试研究</h3>
        <p>生成后可查看企业画像、能力矩阵、面试重点和预测问题。</p>
        <button disabled={requesting} onClick={() => void generate()} type="button">
          {requesting
            ? requestStage === 'searching'
              ? '正在整理企业信息…'
              : requestStage === 'reading'
                ? '正在核对岗位要求…'
                : '正在结合 JD 与经历生成…'
            : '生成面试研究'}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  const status = statusCopy[research.researchStatus]
  const blocking =
    research.researchStatus === 'researching' ||
    research.researchStatus === 'generating' ||
    research.researchStatus === 'no-reliable-info' ||
    research.researchStatus === 'unavailable' ||
    research.researchStatus === 'failed'

  if (blocking) {
    return (
      <section className={`research-status status-${research.researchStatus}`} role="status">
        <h3>{status}</h3>
        <p>
          {research.researchStatus === 'unavailable'
            ? '无需配置额外搜索服务；将直接复用本地保存的DeepSeek Key。'
            : research.researchStatus === 'no-reliable-info'
              ? '为避免编造，公司事实和文化判断不会生成。'
              : research.researchStatus === 'failed'
                ? '已有 JD 分析不会被覆盖，可以安全重试。'
                : '请稍候，研究完成后会保存在本地。'}
        </p>
        {(research.researchStatus === 'failed' ||
          research.researchStatus === 'no-reliable-info' ||
          research.researchStatus === 'unavailable') && (
          <button disabled={requesting} onClick={() => void generate()} type="button">
            {requesting
              ? requestStage === 'searching'
                ? '正在整理企业信息…'
                : requestStage === 'reading'
                  ? '正在核对岗位要求…'
                  : '正在结合 JD 与经历生成…'
              : research.researchStatus === 'unavailable'
                ? '重新生成面试研究'
                : '重试面试研究'}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <section className="interview-research" aria-labelledby="interview-research-title">
      <div className="research-title-row">
        <div>
          <p className="research-eyebrow">INTERVIEW RESEARCH</p>
          <h3 id="interview-research-title">面试研究摘要</h3>
        </div>
        <button disabled={requesting} onClick={() => void generate()} type="button">
          {requesting
            ? requestStage === 'searching'
              ? '正在整理企业信息…'
              : requestStage === 'reading'
                ? '正在核对岗位要求…'
                : '正在结合 JD 与经历生成…'
            : '更新研究'}
        </button>
      </div>
      {status && <p className={`research-notice status-${research.researchStatus}`} role="status">{status}</p>}
      <p className="research-notice">基于模型已有知识，非实时联网结果；现有知识不足的内容会明确标注。</p>
      <div className="research-summary" aria-label="研究摘要">
        <span><strong>{research.companyInsights.length}</strong> 项企业与人才信息</span>
        <span><strong>{summary?.highPriorities}</strong> 个高优先级重点</span>
        <span><strong>{summary?.evidenceGaps}</strong> 项证据不足或待核实</span>
        <span><strong>{summary?.completed}</strong> / {research.preparationChecklist.length} 项已准备</span>
      </div>
      <div className="research-tabs" role="tablist" aria-label="面试研究内容">
        {(Object.keys(tabs) as ResearchTab[]).map((tab) => (
          <button aria-selected={activeTab === tab} key={tab} onClick={() => setActiveTab(tab)} role="tab" type="button">{tabs[tab]}</button>
        ))}
      </div>
      <div className="research-tab-panel" role="tabpanel">
        {activeTab === 'company' && <CompanyCultureSection insights={research.companyInsights} sources={research.sources} />}
        {activeTab === 'competencies' && <CompetencyMatrix items={research.competencies} />}
        {activeTab === 'priorities' && <>
          <InterviewPriorityList items={research.interviewPriorities} />
          <InterviewPreparationChecklist items={research.preparationChecklist} onToggle={toggleChecklist} />
        </>}
        {activeTab === 'questions' && <PredictedQuestionList analysisId={record.id} questions={research.predictedQuestions} />}
      </div>
      <a className="research-start-link" href={`/jd-lab/${record.id}/interview`}>
        开始模拟面试
      </a>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
