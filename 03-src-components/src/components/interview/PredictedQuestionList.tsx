import type { PredictedQuestion } from '../../domain/types'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'

const categoryLabels = {
  motivation: '求职动机', competency: '专业能力', behavioral: '行为面试',
  case: '案例题', culture: '文化匹配', other: '其他',
}

export default function PredictedQuestionList({
  analysisId,
  questions,
}: {
  analysisId?: string
  questions: PredictedQuestion[]
}) {
  return questions.length === 0 ? (
    <p className="interview-empty">暂无高概率问题。</p>
  ) : (
    <ol className="research-list question-list">
      {questions.map((item) => (
        <li key={item.id}>
          <div><strong>{sanitizeVisibleAIText(item.question)}</strong><span className={`research-tag priority-${item.priority}`}>{categoryLabels[item.category]}</span></div>
          <p>{sanitizeVisibleAIText(item.rationale)}</p>
          {(item.companyBasis || item.jdBasis || item.resumeBasis) && (
            <details>
              <summary>查看出题依据</summary>
              {item.companyBasis && <p><strong>企业依据：</strong>{sanitizeVisibleAIText(item.companyBasis)}</p>}
              {item.jdBasis && <p><strong>JD 依据：</strong>{sanitizeVisibleAIText(item.jdBasis)}</p>}
              {item.resumeBasis && <p><strong>经历依据：</strong>{sanitizeVisibleAIText(item.resumeBasis)}</p>}
              {item.validationGoal && <p><strong>想验证：</strong>{sanitizeVisibleAIText(item.validationGoal)}</p>}
              {item.followUpQuestions?.length ? (
                <p><strong>可能追问：</strong>{item.followUpQuestions.map(sanitizeVisibleAIText).join('；')}</p>
              ) : null}
            </details>
          )}
          {analysisId && (
            <a className="question-practice-link"
              href={`/jd-lab/${analysisId}/interview?mode=practice&questionId=${encodeURIComponent(item.id)}&question=${encodeURIComponent(item.question)}`}
            >练习这道题 →</a>
          )}
        </li>
      ))}
    </ol>
  )
}
