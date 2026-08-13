import {
  SpeechProviderError,
  type RecognitionOptions,
  type SpeakOptions,
  type SpeechPlaybackHandle,
  type SpeechProvider,
  type SpeechRecognitionHandle,
} from './SpeechProvider'

interface BrowserRecognitionResult {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}

interface BrowserRecognitionEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<BrowserRecognitionResult>
}

interface BrowserRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: BrowserRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type BrowserRecognitionConstructor = new () => BrowserRecognition

type SpeechGlobals = typeof globalThis & {
  SpeechRecognition?: BrowserRecognitionConstructor
  webkitSpeechRecognition?: BrowserRecognitionConstructor
}

function recognitionConstructor(): BrowserRecognitionConstructor | undefined {
  const speechGlobals = globalThis as SpeechGlobals
  return (
    speechGlobals.SpeechRecognition ?? speechGlobals.webkitSpeechRecognition
  )
}

function recognitionError(browserError: string): SpeechProviderError {
  switch (browserError) {
    case 'not-allowed':
    case 'service-not-allowed':
      return new SpeechProviderError(
        'permission-denied',
        '麦克风权限被拒绝，请允许访问后重试或继续文字输入。',
      )
    case 'no-speech':
      return new SpeechProviderError(
        'no-speech',
        '没有检测到语音，请重试或继续文字输入。',
      )
    case 'aborted':
      return new SpeechProviderError('aborted', '语音输入已取消。')
    case 'network':
      return new SpeechProviderError(
        'network',
        '语音服务暂时不可用，请稍后重试或继续文字输入。',
      )
    default:
      return new SpeechProviderError(
        'unknown',
        '语音输入失败，请重试或继续文字输入。',
      )
  }
}

const inertPlaybackHandle: SpeechPlaybackHandle = {
  play() {},
  pause() {},
  resume() {},
  replay() {},
  stop() {},
}

export class BrowserSpeechProvider implements SpeechProvider {
  canRecognize(): boolean {
    return recognitionConstructor() !== undefined
  }

  startRecognition(options: RecognitionOptions): SpeechRecognitionHandle {
    const Recognition = recognitionConstructor()
    if (!Recognition) {
      throw new SpeechProviderError(
        'unsupported',
        '当前浏览器不支持语音输入，请继续使用文字输入。',
      )
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = options.lang ?? 'zh-CN'
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript.trim()
        if (result?.isFinal && transcript) {
          options.onFinalTranscript(transcript)
        }
      }
    }
    recognition.onerror = (event) => {
      options.onError?.(recognitionError(event.error))
    }
    recognition.onend = () => {
      options.onEnd?.()
    }
    recognition.start()

    return {
      stop: () => recognition.stop(),
      abort: () => recognition.abort(),
    }
  }

  speak(text: string, options: SpeakOptions = {}): SpeechPlaybackHandle {
    const synth = globalThis.speechSynthesis
    const Utterance = globalThis.SpeechSynthesisUtterance
    if (!synth || !Utterance) {
      options.onError?.(
        new SpeechProviderError(
          'unsupported',
          '当前浏览器不支持语音播放，请直接阅读文字。',
        ),
      )
      return inertPlaybackHandle
    }

    const voices = synth.getVoices()
    const voice =
      voices.find((candidate) => candidate.name === options.voiceName) ??
      voices.find((candidate) => candidate.lang === options.lang) ??
      voices[0]
    if (!voice) {
      options.onError?.(
        new SpeechProviderError(
          'voice-unavailable',
          '没有可用的语音，请直接阅读文字。',
        ),
      )
      return inertPlaybackHandle
    }

    const play = () => {
      const utterance = new Utterance(text)
      utterance.lang = options.lang ?? voice.lang
      utterance.pitch = options.pitch ?? 1
      utterance.rate = options.rate ?? 1
      utterance.volume = options.volume ?? 1
      utterance.voice = voice
      utterance.onend = () => options.onEnd?.()
      utterance.onerror = () =>
        options.onError?.(
          new SpeechProviderError(
            'unknown',
            '语音播放失败，请直接阅读文字。',
          ),
        )
      synth.speak(utterance)
    }

    const handle: SpeechPlaybackHandle = {
      play,
      pause: () => synth.pause(),
      resume: () => synth.resume(),
      replay: () => {
        synth.cancel()
        play()
      },
      stop: () => synth.cancel(),
    }

    if (options.autoPlay === true) {
      handle.play()
    }
    return handle
  }
}
