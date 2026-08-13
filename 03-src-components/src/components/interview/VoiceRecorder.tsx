import { useEffect, useRef, useState } from 'react'

import type {
  SpeechProvider,
  SpeechRecognitionHandle,
} from '../../services/speech/SpeechProvider'

interface VoiceRecorderProps {
  provider: SpeechProvider
  initialValue?: string
  value?: string
  onChange?: (value: string) => void
  onConfirm: (value: string) => void
  disabled?: boolean
}

export default function VoiceRecorder({
  provider,
  initialValue = '',
  value,
  onChange,
  onConfirm,
  disabled = false,
}: VoiceRecorderProps) {
  const [draft, setDraft] = useState(value ?? initialValue)
  const [error, setError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (value !== undefined) {
      setDraft(value)
    }
  }, [value])

  useEffect(
    () => () => {
      recognitionRef.current?.abort()
    },
    [],
  )

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft)
    onChange?.(nextDraft)
  }

  const startListening = () => {
    setError('')
    try {
      recognitionRef.current = provider.startRecognition({
        lang: 'zh-CN',
        onFinalTranscript: (transcript) => {
          updateDraft(transcript)
          setIsListening(false)
        },
        onError: (speechError) => {
          setError(speechError.message)
          setIsListening(false)
        },
        onEnd: () => setIsListening(false),
      })
      setIsListening(true)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '语音输入失败，请继续文字输入。',
      )
      setIsListening(false)
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  return (
    <section aria-label="语音回答">
      {error ? <p role="alert">{error}</p> : null}

      <label>
        回答内容
        <textarea
          aria-label="回答内容"
          disabled={disabled}
          ref={textareaRef}
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
        />
      </label>

      <div>
        {isListening ? (
          <button disabled={disabled} type="button" onClick={stopListening}>
            停止语音输入
          </button>
        ) : (
          <button disabled={disabled} type="button" onClick={startListening}>
            {error ? '重试语音' : '开始语音输入'}
          </button>
        )}
        {error ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() => textareaRef.current?.focus()}
          >
            继续文字输入
          </button>
        ) : null}
        <button
          disabled={disabled || draft.trim().length === 0}
          type="button"
          onClick={() => onConfirm(draft)}
        >
          确认回答
        </button>
      </div>
    </section>
  )
}
