import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'

import InterviewReport from '../components/interview/InterviewReport'
import InterviewSession from '../components/interview/InterviewSession'
import MockInterviewLanding from '../components/interview/MockInterviewLanding'
import QuestionPracticePanel from '../components/interview/QuestionPracticePanel'
import { BrowserSpeechProvider } from '../services/speech/BrowserSpeechProvider'
import { interviewStore } from '../stores/interviewStore'
import '../styles/mock-interview.css'

type View = 'landing' | 'practice' | 'session' | 'report'

export default function MockInterviewPage() {
  const { analysisId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const practiceMode = searchParams.get('mode') === 'practice' || searchParams.get('mode') === 'coach'
  const returnTo = searchParams.get('returnTo') || `/jd-lab?analysisId=${analysisId}&tab=interview`
  const state = useStore(interviewStore)
  const [view, setView] = useState<View>(
    practiceMode
        ? 'practice'
        : 'landing',
  )
  const provider = useMemo(() => new BrowserSpeechProvider(), [])

  useEffect(() => { void state.load(analysisId) }, [analysisId])
  useEffect(() => {
    if (practiceMode) return
    if (state.report) setView('report')
    else if (state.session) setView('session')
  }, [practiceMode, state.report, state.session])

  // A practice link is a fresh, focused flow. If a prior full interview is
  // still in the store, do not let it redirect the page away from the question.
  useEffect(() => {
    if (practiceMode) {
      setView('practice')
    }
  }, [practiceMode])

  if (state.loading) return <section className="page"><p>正在载入面试资料…</p></section>
  if (!state.context) return <section className="page"><h1>无法开始模拟面试</h1><p>{state.error ?? '没有找到对应分析。'}</p><Link to={returnTo}>返回 JD 实验室</Link></section>

  const { context } = state
  const predicted = context.research?.predictedQuestions
  const questionId = searchParams.get('questionId') ?? ''
  const question = searchParams.get('question') ?? predicted?.find((item) => item.id === questionId)?.question ?? ''
  const practiceResult = state.questionPracticeResult?.questionId === questionId
    ? state.questionPracticeResult
    : undefined
  const startInterview = (interviewType: 'hr' | 'business') => {
    void state.start('text', interviewType)
  }
  return (
    <section className="page mock-interview-page">
      {state.error ? <p className="mock-error" role="alert">{state.error}</p> : null}
      {view === 'landing' ? (
        <MockInterviewLanding jd={context.jd} research={context.research} busy={state.submitting} onStart={startInterview} />
      ) : null}
      {view === 'practice' ? (
          <QuestionPracticePanel
          busy={state.submitting}
          provider={provider}
          question={question}
          result={practiceResult}
          onBack={() => setView('landing')}
          onRetry={() => state.resetQuestionPractice()}
          onSubmit={(answer, inputMode) => void state.practiceQuestion(questionId, question, answer, inputMode)}
        />
      ) : null}
      {view === 'session' && state.session ? (
        <InterviewSession session={state.session} provider={provider} busy={state.submitting} onSubmit={(answer, mode) => void state.submit(answer, mode)} onPause={() => void state.setStatus('paused')} onResume={() => void state.setStatus('active')} onEnd={() => void state.complete()} onBack={() => setView('landing')} />
      ) : null}
      {view === 'report' && state.session && state.report ? (
        <InterviewReport session={state.session} report={state.report} onRestart={() => { state.resetPractice(); startInterview(state.session?.interviewType ?? 'business') }} onWeaknessPractice={() => { state.resetPractice(); startInterview(state.session?.interviewType ?? 'business') }} />
      ) : null}
    </section>
  )
}
