import { describe, expect, it } from 'vitest'

import { parseExtraction } from '../src/ai/parsers'

describe('parseExtraction', () => {
  const source =
    '负责 ChatGPT 工作流设计，通过提示词模板将周报整理时间从 2 小时缩短到 20 分钟。'

  it('creates a pending claim linked to an exact ChatGPT source quote', () => {
    const result = parseExtraction(
      source,
      {
        claims: [
          {
            kind: 'ai',
            label: '使用 ChatGPT 优化周报流程',
            detail: '通过提示词模板显著缩短整理时间。',
            quote: '通过提示词模板将周报整理时间从 2 小时缩短到 20 分钟',
          },
        ],
      },
      'experience-1',
      'artifact-1',
    )

    const quote = result.evidenceSpans[0].quote

    expect(source.slice(result.evidenceSpans[0].start, result.evidenceSpans[0].end)).toBe(
      quote,
    )
    expect(result).toEqual({
      evidenceSpans: [
        {
          id: 'artifact-1-span-0',
          sourceArtifactId: 'artifact-1',
          quote,
          start: source.indexOf(quote),
          end: source.indexOf(quote) + quote.length,
        },
      ],
      claims: [
        {
          id: 'artifact-1-claim-0',
          experienceId: 'experience-1',
          kind: 'ai',
          label: '使用 ChatGPT 优化周报流程',
          detail: '通过提示词模板显著缩短整理时间。',
          status: 'pending',
          evidenceSpanIds: ['artifact-1-span-0'],
        },
      ],
    })
  })

  it.each(['', '把周报整理时间缩短到 5 分钟'])(
    'rejects missing or fabricated evidence quote %j',
    (quote) => {
      expect(() =>
        parseExtraction(
          source,
          {
            claims: [
              {
                kind: 'result',
                label: '提升效率',
                detail: '',
                quote,
              },
            ],
          },
          'experience-1',
          'artifact-1',
        ),
      ).toThrow(`AI 返回了无法定位的证据：${quote}`)
    },
  )
})
