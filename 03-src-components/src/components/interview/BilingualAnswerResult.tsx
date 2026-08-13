import type { AnswerOptimization } from '../../domain/types'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

interface Props {
  result: AnswerOptimization
  onRegenerate: (focus?: string) => void
}

export default function BilingualAnswerResult({ result, onRegenerate }: Props) {
  const copy = (value: string) => void navigator.clipboard?.writeText(value)
  const answerZh = sanitizeVisibleAIText(result.optimizedAnswerZh)
  const answerEn = sanitizeVisibleAIText(result.optimizedAnswerEn)
  return (
    <section className="coach-result" aria-label="双语优化结果">
      <div className="mock-section-heading">
        <div><p className="eyebrow">COACHED ANSWER</p><h2>双语回答建议</h2></div>
        <button type="button" onClick={() => onRegenerate()}>重新生成</button>
      </div>
      <div className="bilingual-grid">
        <article><span>中文口语回答</span><p>{answerZh}</p><button type="button" onClick={() => copy(answerZh)}>复制中文</button></article>
        <article><span>Natural English</span><p>{answerEn}</p><button type="button" onClick={() => copy(answerEn)}>复制英文</button></article>
      </div>
      <h3>改进动作</h3>
      <ul>{result.improvements.map((item) => <li key={item}>{sanitizeVisibleAIText(item)}</li>)}</ul>
      <div className="coach-actions" aria-label="优化方向">
        {['更简洁', '强化策略', '突出贡献', '补充数据', '更口语化'].map((focus) => (
          <button key={focus} type="button" onClick={() => onRegenerate(focus)}>{focus}</button>
        ))}
      </div>
    </section>
  )
}
