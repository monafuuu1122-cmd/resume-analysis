import { useEffect, useState } from 'react'

import type { AnswerOptimization, PredictedQuestion } from '../../domain/types'
import BilingualAnswerResult from './BilingualAnswerResult'

interface Props {
  busy: boolean
  initialQuestion?: string
  result?: AnswerOptimization
  questions?: PredictedQuestion[]
  onBack: () => void
  onSubmit: (question: string, answer: string) => void
}

export default function AnswerCoachPanel({ busy, initialQuestion, result, questions = [], onBack, onSubmit }: Props) {
  const firstQuestion = initialQuestion ?? questions[0]?.question ?? ''
  const [question, setQuestion] = useState(firstQuestion)
  const [answer, setAnswer] = useState('')
  const [focus, setFocus] = useState('')
  useEffect(() => setQuestion(firstQuestion), [firstQuestion])
  const submit = (nextFocus = focus) =>
    onSubmit(question, `${answer}${nextFocus ? `\n优化方向：${nextFocus}` : ''}`)

  return (
    <section className="mock-panel">
      <button className="mock-back-button" type="button" onClick={onBack}>← 返回模式选择</button>
      <p className="eyebrow">ANSWER COACH</p>
      <h1>回答优化</h1>
      <div className="coach-form">
        <label>面试问题
          <textarea aria-label="面试问题" value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <label>回答思路或草稿
          <textarea aria-label="回答思路或草稿" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="先写要点也可以；缺失的数字会保留为 [补充具体数据]" />
        </label>
        <label>本轮侧重点
          <select value={focus} onChange={(event) => setFocus(event.target.value)}>
            <option value="">综合优化</option><option>更简洁</option><option>强化策略</option><option>突出贡献</option><option>补充数据</option>
          </select>
        </label>
        <button className="mock-primary-button" disabled={busy || !question.trim() || !answer.trim()} type="button" onClick={() => submit()}>
          {busy ? '正在优化…' : '生成双语优化'}
        </button>
      </div>
      {result ? <BilingualAnswerResult result={result} onRegenerate={(next) => submit(next)} /> : null}
    </section>
  )
}
