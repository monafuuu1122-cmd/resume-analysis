export type SpeechErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-speech'
  | 'voice-unavailable'
  | 'aborted'
  | 'network'
  | 'unknown'

export class SpeechProviderError extends Error {
  readonly code: SpeechErrorCode

  constructor(code: SpeechErrorCode, message: string) {
    super(message)
    this.name = 'SpeechProviderError'
    this.code = code
  }
}

export interface RecognitionOptions {
  lang?: string
  onFinalTranscript: (transcript: string) => void
  onError?: (error: SpeechProviderError) => void
  onEnd?: () => void
}

export interface SpeechRecognitionHandle {
  stop(): void
  abort(): void
}

export interface SpeakOptions {
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
  voiceName?: string
  autoPlay?: boolean
  onError?: (error: SpeechProviderError) => void
  onEnd?: () => void
}

export interface SpeechPlaybackHandle {
  play(): void
  pause(): void
  resume(): void
  replay(): void
  stop(): void
}

export interface SpeechProvider {
  canRecognize(): boolean
  startRecognition(options: RecognitionOptions): SpeechRecognitionHandle
  speak(text: string, options?: SpeakOptions): SpeechPlaybackHandle
}
