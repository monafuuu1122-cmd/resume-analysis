import type { MockInterviewSession } from '../../domain/types'
import type { SpeechProvider } from '../../services/speech/SpeechProvider'
import CandidateAnswerInput from './CandidateAnswerInput'
import InterviewerMessage from './InterviewerMessage'
import InterviewProgress from './InterviewProgress'

interface Props {
  session: MockInterviewSession
  provider: SpeechProvider
  busy: boolean
  onSubmit: (answer: string, mode: 'text' | 'voice') => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onBack: () => void
}

export default function InterviewSession({ session, provider, busy, onSubmit, onPause, onResume, onEnd, onBack }: Props) {
  const current = session.turns.find((turn) => !turn.answer)
  const answered = session.turns.filter((turn) => turn.answer).length
  const paused = session.status === 'paused'
  return (
    <section className="mock-panel">
      <button className="mock-back-button" type="button" onClick={onBack}>← 返回 HR / 业务面</button>
      <div className="mock-section-heading">
        <div><p className="eyebrow">{session.interviewType === 'hr' ? 'HR INTERVIEW' : 'BUSINESS INTERVIEW'}</p><h1>{session.interviewType === 'hr' ? 'HR 面' : '业务面'}</h1></div>
        <InterviewProgress active={!paused && !busy} answered={answered} />
      </div>
      <p className="simulation-disclaimer">AI 模拟，不代表企业真实录用判断</p>
      {current ? <><div className="interview-focus-label">{current.focusDimension ?? (session.interviewType === 'hr' ? '动机与经历核实' : '能力与场景深挖')}</div><InterviewerMessage provider={provider} question={current.question} /></> : <p>正在准备下一问…</p>}
      {paused ? (
        <div className="paused-state"><strong>面试已暂停</strong><p>计时已停止，你可以准备好后继续。</p><button className="mock-primary-button" type="button" onClick={onResume}>继续面试</button></div>
      ) : current ? (
        <CandidateAnswerInput key={current.id} busy={busy} provider={provider} onSubmit={onSubmit} />
      ) : null}
      <div className="session-controls">
        {!paused ? <button type="button" onClick={onPause}>暂停</button> : null}
        <button type="button" onClick={onEnd} disabled={busy}>结束并生成复盘</button>
      </div>
    </section>
  )
}
