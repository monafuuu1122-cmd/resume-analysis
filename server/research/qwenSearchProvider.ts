import type {
  FetchImplementation,
  ResearchDocument,
  ResearchProvider,
  ResearchQuery,
} from './provider'

export const DASHSCOPE_SEARCH_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'

interface SearchResult {
  title?: unknown
  url?: unknown
}

export class QwenSearchProvider implements ResearchProvider {
  readonly availability = 'available'

  constructor(
    private readonly apiKey: string,
    private readonly model = 'deepseek-v4-flash',
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async search(input: ResearchQuery, signal: AbortSignal) {
    const domainInstruction = input.includeDomains?.length
      ? `。仅检索这些域名：${input.includeDomains.join('、')}`
      : ''
    const response = await this.fetchImplementation(DASHSCOPE_SEARCH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: {
          messages: [
            {
              role: 'user',
              content: `${input.query}${domainInstruction}。请总结与企业、招聘、文化或业务直接相关的可核验信息。`,
            },
          ],
        },
        parameters: {
          enable_search: true,
          result_format: 'message',
          search_options: {
            enable_source: true,
            forced_search: true,
            search_strategy: 'turbo',
          },
        },
      }),
      signal,
    })
    if (!response.ok) {
      throw new Error(`DeepSeek联网搜索失败（${response.status}）`)
    }
    const payload = (await response.json()) as {
      output?: {
        choices?: Array<{ message?: { content?: unknown } }>
        search_info?: { search_results?: unknown }
      }
    }
    const summary = payload.output?.choices?.[0]?.message?.content
    const content =
      typeof summary === 'string' && summary.trim()
        ? summary.trim()
        : '搜索结果未提供可用摘要'
    const rawResults = Array.isArray(
      payload.output?.search_info?.search_results,
    )
      ? payload.output.search_info.search_results
      : []
    const accessedAt = this.now().toISOString()
    return rawResults
      .flatMap((value): ResearchDocument[] => {
        const result = value as SearchResult
        if (
          typeof result.title !== 'string' ||
          typeof result.url !== 'string' ||
          !result.title.trim()
        ) {
          return []
        }
        try {
          const url = new URL(result.url)
          if (!['http:', 'https:'].includes(url.protocol)) return []
        } catch {
          return []
        }
        return [
          {
            title: result.title.trim(),
            url: result.url,
            content,
            accessedAt,
          },
        ]
      })
      .slice(0, Math.min(Math.max(input.maxResults ?? 5, 1), 10))
  }
}
