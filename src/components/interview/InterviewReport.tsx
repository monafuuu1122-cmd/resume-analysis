import type { MockInterviewSession } from '../../domain/types'
import type { InterviewReportData } from '../../stores/interviewStore'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

interface Props {
  session: MockInterviewSession
  report: InterviewReportData
  onRestart: () => void
  onWeaknessPractice: () => void
  /** Kept optional for old callers; answer coaching is now embedded in the
   * HR/business flows and is no longer a separate report destination. */
  onCoachAnswer?: () => void
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function InterviewReport({ session, report, onRestart, onWeaknessPractice, onCoachAnswer }: Props) {
  const summary = sanitizeVisibleAIText(report.summary)
  const strengths = report.strengths.map(sanitizeVisibleAIText)
  const improvements = report.improvements.map(sanitizeVisibleAIText)
  const markdown = [
    '# 模拟面试报告',
    '', summary, '', '## 优势',
    ...strengths.map((item) => `- ${item}`),
    '', '## 改进方向',
    ...improvements.map((item) => `- ${item}`),
    '', '## 逐题复盘',
    ...session.turns.filter((turn) => turn.answer).flatMap((turn) => [
      `### ${turn.sequence}. ${sanitizeVisibleAIText(turn.question)}`,
      sanitizeVisibleAIText(turn.answer ?? ''), turn.feedback ? `> ${sanitizeVisibleAIText(turn.feedback)}` : '',
    ]),
  ].join('\n')
  return (
    <section className="mock-panel report-panel">
      <p className="eyebrow">INTERVIEW REVIEW</p>
      <h1>本轮复盘</h1>
      <p className="interview-report-mode">{session.interviewType === 'hr' ? 'HR 面｜动机与经历核实' : '业务面｜能力与场景深挖'}</p>
      <p className="simulation-disclaimer">AI 模拟，不代表企业真实录用判断</p>
      <article className="report-summary"><h2>总体评价</h2><p>{summary}</p></article>
      <div className="report-columns">
        <article><h2>做得好的</h2><ul>{strengths.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <article><h2>下一步改进</h2><ul>{improvements.map((item) => <li key={item}>{item}</li>)}</ul></article>
      </div>
      <section><h2>逐题复盘</h2>{session.turns.filter((turn) => turn.answer).map((turn) => (
        <article className="turn-review" key={turn.id}>
          <span>问题 {turn.sequence}</span><h3>{sanitizeVisibleAIText(turn.question)}</h3><p>{sanitizeVisibleAIText(turn.answer ?? '')}</p>
          {turn.feedback ? <blockquote>{sanitizeVisibleAIText(turn.feedback)}</blockquote> : null}
        </article>
      ))}</section>
      <section><h2>最终准备清单</h2><ul>
        {session.interviewType === 'hr' ? <><li>把求职动机压缩成岗位、企业、个人经历三点</li><li>准备一段不超过两分钟的自我介绍</li><li>核对每段经历中的个人贡献和转岗动机</li></> : <><li>为薄弱回答补充可核验的数据</li><li>准备一个能说明决策、执行和结果的业务案例</li><li>练习面对追问时先给结论，再补证据</li></>}
      </ul></section>
      <div className="report-actions">
        <button type="button" onClick={onRestart}>重新模拟</button>
        <button type="button" onClick={onWeaknessPractice}>只练薄弱项</button>
        {onCoachAnswer ? <button type="button" onClick={onCoachAnswer}>继续练习</button> : null}
        <button type="button" onClick={() => download('mock-interview-report.md', markdown, 'text/markdown')}>导出 Markdown</button>
        <button type="button" onClick={() => download('mock-interview-report.json', JSON.stringify({ session, report }, null, 2), 'application/json')}>导出 JSON</button>
      </div>
    </section>
  )
}
