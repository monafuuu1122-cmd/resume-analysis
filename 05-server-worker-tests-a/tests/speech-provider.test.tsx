import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VoicePlayer from '../src/components/interview/VoicePlayer'
import VoiceRecorder from '../src/components/interview/VoiceRecorder'
import { BrowserSpeechProvider } from '../src/services/speech/BrowserSpeechProvider'
import type {
  RecognitionOptions,
  SpeechProvider,
} from '../src/services/speech/SpeechProvider'

class FakeRecognition {
  static instances: FakeRecognition[] = []

  continuous = false
  interimResults = true
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.instances.push(this)
  }
}

const makeResult = (transcript: string, isFinal: boolean) => ({
  0: { transcript },
  isFinal,
})

const createSynth = (voices: SpeechSynthesisVoice[] = [{} as SpeechSynthesisVoice]) => ({
  cancel: vi.fn(),
  getVoices: vi.fn(() => voices),
  pause: vi.fn(),
  paused: false,
  resume: vi.fn(),
  speak: vi.fn(),
})

beforeEach(() => {
  FakeRecognition.instances = []
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    lang = ''
    pitch = 1
    rate = 1
    text: string
    voice: SpeechSynthesisVoice | null = null
    volume = 1
    onend: (() => void) | null = null
    onerror: (() => void) | null = null

    constructor(text: string) {
      this.text = text
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BrowserSpeechProvider recognition', () => {
  it('detects missing recognition support', () => {
    const provider = new BrowserSpeechProvider()

    expect(provider.canRecognize()).toBe(false)
    expect(() =>
      provider.startRecognition({ onFinalTranscript: vi.fn() }),
    ).toThrow('当前浏览器不支持语音输入')
  })

  it('uses webkit recognition and emits final transcripts only', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    const onFinalTranscript = vi.fn()
    const provider = new BrowserSpeechProvider()

    provider.startRecognition({
      lang: 'zh-CN',
      onFinalTranscript,
    })
    const recognition = FakeRecognition.instances[0]
    recognition.onresult?.({
      resultIndex: 0,
      results: [
        makeResult('这只是临时结果', false),
        makeResult('这是最终回答', true),
      ],
    })

    expect(provider.canRecognize()).toBe(true)
    expect(recognition.lang).toBe('zh-CN')
    expect(recognition.interimResults).toBe(false)
    expect(onFinalTranscript).toHaveBeenCalledOnce()
    expect(onFinalTranscript).toHaveBeenCalledWith('这是最终回答')
  })

  it.each([
    ['not-allowed', 'permission-denied'],
    ['no-speech', 'no-speech'],
  ] as const)('normalizes %s recognition errors', (browserError, expectedCode) => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const onError = vi.fn()
    const provider = new BrowserSpeechProvider()

    provider.startRecognition({
      onFinalTranscript: vi.fn(),
      onError,
    })
    FakeRecognition.instances[0].onerror?.({ error: browserError })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: expectedCode }),
    )
  })
})

describe('BrowserSpeechProvider playback', () => {
  it('reports a missing TTS voice without attempting playback', () => {
    const synth = createSynth([])
    vi.stubGlobal('speechSynthesis', synth)
    const provider = new BrowserSpeechProvider()
    const onError = vi.fn()

    provider.speak('面试问题', { autoPlay: true, onError })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'voice-unavailable' }),
    )
    expect(synth.speak).not.toHaveBeenCalled()
  })

  it('keeps autoplay off and supports play, pause, resume, and replay', () => {
    const synth = createSynth()
    vi.stubGlobal('speechSynthesis', synth)
    const provider = new BrowserSpeechProvider()

    const playback = provider.speak('请介绍一下自己', { autoPlay: false })
    expect(synth.speak).not.toHaveBeenCalled()

    playback.play()
    playback.pause()
    playback.resume()
    playback.replay()

    expect(synth.speak).toHaveBeenCalledTimes(2)
    expect(synth.pause).toHaveBeenCalledOnce()
    expect(synth.resume).toHaveBeenCalledOnce()
    expect(synth.cancel).toHaveBeenCalledOnce()
  })
})

describe('voice components', () => {
  it('keeps the editable draft and submits it only after confirmation', () => {
    let options: RecognitionOptions | undefined
    const provider: SpeechProvider = {
      canRecognize: () => true,
      startRecognition: (nextOptions) => {
        options = nextOptions
        return { abort: vi.fn(), stop: vi.fn() }
      },
      speak: vi.fn(),
    }
    const onConfirm = vi.fn()

    render(
      <VoiceRecorder
        initialValue="原草稿"
        onConfirm={onConfirm}
        provider={provider}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '开始语音输入' }))
    act(() => options?.onFinalTranscript('语音转写稿'))

    const textarea = screen.getByRole('textbox', { name: '回答内容' })
    expect(textarea).toHaveValue('语音转写稿')
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.change(textarea, { target: { value: '编辑后的回答' } })
    fireEvent.click(screen.getByRole('button', { name: '确认回答' }))
    expect(onConfirm).toHaveBeenCalledWith('编辑后的回答')
  })

  it('falls back to text without clearing a draft after voice failure', () => {
    let options: RecognitionOptions | undefined
    const provider: SpeechProvider = {
      canRecognize: () => true,
      startRecognition: (nextOptions) => {
        options = nextOptions
        return { abort: vi.fn(), stop: vi.fn() }
      },
      speak: vi.fn(),
    }

    render(
      <VoiceRecorder
        initialValue="不能丢失的草稿"
        onConfirm={vi.fn()}
        provider={provider}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '开始语音输入' }))
    act(() => {
      options?.onError?.({
        code: 'permission-denied',
        message: '麦克风权限被拒绝',
        name: 'SpeechProviderError',
      } as Error & { code: 'permission-denied' })
    })

    expect(screen.getByRole('alert')).toHaveTextContent('麦克风权限被拒绝')
    expect(screen.getByRole('textbox', { name: '回答内容' })).toHaveValue(
      '不能丢失的草稿',
    )
    expect(
      screen.getByRole('button', { name: '重试语音' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '继续文字输入' }),
    ).toBeInTheDocument()
  })

  it('does not autoplay a question and exposes playback controls', () => {
    const playback = {
      pause: vi.fn(),
      play: vi.fn(),
      replay: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    }
    const provider: SpeechProvider = {
      canRecognize: () => false,
      startRecognition: vi.fn(),
      speak: vi.fn(() => playback),
    }

    render(<VoicePlayer provider={provider} text="为什么选择我们？" />)

    expect(provider.speak).toHaveBeenCalledWith(
      '为什么选择我们？',
      expect.objectContaining({ autoPlay: false }),
    )
    expect(playback.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '重新播放' }))

    expect(playback.play).toHaveBeenCalledOnce()
    expect(playback.pause).toHaveBeenCalledOnce()
    expect(playback.resume).toHaveBeenCalledOnce()
    expect(playback.replay).toHaveBeenCalledOnce()
  })
})
