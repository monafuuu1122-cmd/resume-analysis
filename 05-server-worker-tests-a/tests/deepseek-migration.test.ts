import { describe, expect, it, vi } from 'vitest'

import { callQwen } from '../server/qwen'

describe('DeepSeek gateway migration', () => {
  it('sends structured generation only to the DeepSeek API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ claims: [] }) } }],
    }), { status: 200 }))

    await callQwen('deepseek-key', 'deepseek-v4-flash', 'Return JSON.', 'input', fetchMock)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
  })
})
