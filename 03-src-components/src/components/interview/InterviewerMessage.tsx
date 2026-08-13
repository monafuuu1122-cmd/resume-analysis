import type { SpeechProvider } from '../../services/speech/SpeechProvider'
import { sanitizeVisibleAIText } from '../../ai/safeOutput'
import VoicePlayer from './VoicePlayer'

interface Props {
  question: string
  provider: SpeechProvider
}

export default function InterviewerMessage({ question, provider }: Props) {
  const visibleQuestion = sanitizeVisibleAIText(question)
  return (
    <article className="interviewer-message">
      <span>AI 面试官</span>
      <h2>{visibleQuestion}</h2>
      <VoicePlayer provider={provider} text={visibleQuestion} />
    </article>
  )
}
