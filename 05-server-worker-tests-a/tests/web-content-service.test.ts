import { describe, expect, it, vi } from 'vitest'

import {
  fetchResearchPage,
  isSafeResearchUrl,
} from '../server/research/webContentService'

describe('webContentService', () => {
  it('rejects local and private network targets', () => {
    expect(isSafeResearchUrl('http://127.0.0.1/admin')).toBe(false)
    expect(isSafeResearchUrl('http://192.168.1.5')).toBe(false)
    expect(isSafeResearchUrl('https://company.example/careers')).toBe(true)
  })

  it('fetches and cleans meaningful page content', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        `<html><head><title>人才理念</title><style>x</style></head>
        <body><nav>菜单</nav><main><h1>人才理念</h1>
        <p>我们鼓励主人翁意识，并重视跨团队协作。</p>
        <p>当前重点业务是智能化产品与全球市场。</p></main>
        <script>alert(1)</script></body></html>`,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    )
    const result = await fetchResearchPage(
      'https://company.example/careers',
      new AbortController().signal,
      fetcher,
    )
    expect(result.contentStatus).toBe('full')
    expect(result.content).toContain('主人翁意识')
    expect(result.content).toContain('智能化产品')
    expect(result.content).not.toContain('alert(1)')
  })

  it('keeps a structured failure instead of inventing content', async () => {
    const result = await fetchResearchPage(
      'https://company.example/report',
      new AbortController().signal,
      vi.fn().mockRejectedValue(new Error('timeout')),
    )
    expect(result.contentStatus).toBe('failed')
    expect(result.content).toBe('')
    expect(result.failureReason).toContain('timeout')
  })
})
