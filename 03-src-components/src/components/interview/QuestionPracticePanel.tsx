import { ArrowClockwise, CheckCircle } from '@phosphor-icons/react'

import type { QuestionPractice } from '../../domain/types'
import type { SpeechProvider } from '../../services/speech/SpeechProvider'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'
import CandidateAnswerInput from './CandidateAnswerInput'

interface Props {
  busy: boolean
  provider: SpeechProvider
  question: string
  result?: QuestionPractice
  onBack: () => void
  onSubmit: (answer: string, inputMode: 'text' | 'voice') => void
  onRetry: () => void
}

/** A focused, one-question practice flow. It deliberately does not expose a
 * model answer before the candidate has submitted their own response. */
export default function QuestionPracticePanel({
  busy,
  provider,
  question,
  result,
  onBack,
  onSubmit,
  onRetry,
}: Props) {
  return (
    <section className="mock-panel question-practice-panel">
      <button className="mock-back-button" type="button" onClick={onBack}>← 返回 HR / 业务面</button>
      <header className="practice-heading">
        <div>
          <p className="eyebrow">QUESTION PRACTICE</p>
          <h1>单题练习</h1>
          <p className="practice-hint">先用自己的话回答，再查看基于 JD、企业信息和经历档案的点评。</p>
        </div>
        <span className="practice-badge">一次回答 · 一次点评</span>
      </header>

      <article className="practice-question-card">
        <span>当前问题</span>
        <h2>{sanitizeVisibleAIText(question)}</h2>
      </article>

      {!result ? (
        <CandidateAnswerInput
          key="practice-input"
          busy={busy}
          provider={provider}
          onSubmit={onSubmit}
        />
      ) : (
        <QuestionPracticeResult result={result} onRetry={onRetry} />
      )}
    </section>
  )
}

function QuestionPracticeResult({ result, onRetry }: { result: QuestionPractice; onRetry: () => void }) {
  const list = (items: string[]) => items.map(sanitizeVisibleAIText)
  return (
    <section className="question-practice-result" aria-label="单题点评结果">
      <div className="practice-result-heading">
        <div>
          <p className="eyebrow">FEEDBACK</p>
          <h2>这道题的回答点评</h2>
        </div>
        <CheckCircle size={28} weight="duotone" aria-hidden="true" />
      </div>
      <div className="practice-feedback-grid">
        <article><h3>回答覆盖</h3><p>{sanitizeVisibleAIText(result.answerCoverage)}</p></article>
        <article><h3>经历证据</h3><p>{sanitizeVisibleAIText(result.evidenceAssessment)}</p></article>
        <article><h3>岗位关联</h3><p>{sanitizeVisibleAIText(result.roleRelevance)}</p></article>
      </div>
      <div className="practice-feedback-columns">
        <article><h3>需要留意</h3>{result.risks.length ? <ul>{list(result.risks).map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂未发现明显风险。</p>}</article>
        <article><h3>下一次可以这样准备</h3>{result.improvements.length ? <ul>{list(result.improvements).map((item) => <li key={item}>{item}</li>)}</ul> : <p>保持当前结构，并补充可核验证据。</p>}</article>
      </div>
      {result.followUpQuestions.length ? (
        <details className="practice-followups">
          <summary>面试官可能继续追问</summary>
          <ul>{list(result.followUpQuestions).map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}
      <button className="mock-primary-button" type="button" onClick={onRetry}>
        <ArrowClockwise size={18} aria-hidden="true" /> 重新练习这道题
      </button>
    </section>
  )
}
