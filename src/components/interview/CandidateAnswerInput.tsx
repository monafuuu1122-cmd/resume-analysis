import { useState } from 'react'

import type { SpeechProvider } from '../../services/speech/SpeechProvider'
import VoiceRecorder from './VoiceRecorder'

interface Props {
  busy: boolean
  provider: SpeechProvider
  onSubmit: (answer: string, mode: 'text' | 'voice') => void
}

export default function CandidateAnswerInput({ busy, provider, onSubmit }: Props) {
  const [draft, setDraft] = useState('')
  const [voice, setVoice] = useState(false)
  if (voice) {
    return (
      <div className="candidate-input">
        <button type="button" onClick={() => setVoice(false)}>切换文字输入</button>
        <VoiceRecorder
          disabled={busy}
          provider={provider}
          value={draft}
          onChange={setDraft}
          onConfirm={(value) => onSubmit(value, 'voice')}
        />
      </div>
    )
  }
  return (
    <div className="candidate-input">
      <label>你的回答
        <textarea aria-label="你的回答" value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <div className="mock-inline-actions">
        <button type="button" onClick={() => setVoice(true)}>使用语音输入</button>
        <button className="mock-primary-button" disabled={busy || !draft.trim()} type="button" onClick={() => onSubmit(draft, 'text')}>
          {busy ? '正在生成追问…' : '提交回答'}
        </button>
      </div>
    </div>
  )
}
