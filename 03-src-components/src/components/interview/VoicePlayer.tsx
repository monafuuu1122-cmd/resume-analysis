import { useEffect, useRef, useState } from 'react'

import type {
  SpeechPlaybackHandle,
  SpeechProvider,
} from '../../services/speech/SpeechProvider'

interface VoicePlayerProps {
  provider: SpeechProvider
  text: string
  lang?: string
}

export default function VoicePlayer({
  provider,
  text,
  lang = 'zh-CN',
}: VoicePlayerProps) {
  const playbackRef = useRef<SpeechPlaybackHandle | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    const playback = provider.speak(text, {
      autoPlay: false,
      lang,
      onError: (speechError) => setError(speechError.message),
    })
    playbackRef.current = playback

    return () => {
      playback.stop()
      playbackRef.current = null
    }
  }, [lang, provider, text])

  return (
    <section aria-label="问题语音播放">
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="button" onClick={() => playbackRef.current?.play()}>
          播放
        </button>
        <button type="button" onClick={() => playbackRef.current?.pause()}>
          暂停
        </button>
        <button type="button" onClick={() => playbackRef.current?.resume()}>
          继续
        </button>
        <button type="button" onClick={() => playbackRef.current?.replay()}>
          重新播放
        </button>
      </div>
    </section>
  )
}
