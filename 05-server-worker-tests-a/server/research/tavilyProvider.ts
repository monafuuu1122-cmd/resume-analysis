import {
  type FetchImplementation,
  type ResearchDocument,
  type ResearchProvider,
  type ResearchQuery,
  UnavailableResearchProvider,
} from './provider'

export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'

interface TavilyResult {
  title?: unknown
  url?: unknown
  content?: unknown
  raw_content?: unknown
  published_date?: unknown
}

function normalizedTimestamp(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return undefined
  }
  return new Date(value).toISOString()
}

function normalizeResult(
  result: TavilyResult,
  accessedAt: string,
): ResearchDocument | undefined {
  if (typeof result.title !== 'string' || typeof result.url !== 'string') {
    return undefined
  }
  const title = result.title.trim()
  const contentValue =
    typeof result.raw_content === 'string'
      ? result.raw_content
      : result.content
  const content =
    typeof contentValue === 'string' ? contentValue.trim() : ''

  try {
    new URL(result.url)
  } catch {
    return undefined
  }
  if (!title || !content) {
    return undefined
  }

  const publishedAt = normalizedTimestamp(result.published_date)
  return {
    title,
    url: result.url,
    content,
    ...(publishedAt ? { publishedAt } : {}),
    accessedAt,
  }
}

export class TavilyResearchProvider implements ResearchProvider {
  readonly availability = 'available'

  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async search(input: ResearchQuery, signal: AbortSignal) {
    const response = await this.fetchImplementation(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: input.query,
        include_raw_content: 'markdown',
        max_results: Math.min(Math.max(input.maxResults ?? 5, 1), 10),
        ...(input.includeDomains?.length
          ? { include_domains: input.includeDomains }
          : {}),
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Tavily search failed with status ${response.status}`)
    }

    const payload = (await response.json()) as { results?: unknown }
    const results = Array.isArray(payload.results) ? payload.results : []
    const accessedAt = this.now().toISOString()
    return results.flatMap((result) => {
      const normalized = normalizeResult(result as TavilyResult, accessedAt)
      return normalized ? [normalized] : []
    })
  }
}

export function createResearchProvider(
  env: Record<string, string | undefined>,
  fetchImplementation: FetchImplementation = fetch,
): ResearchProvider {
  const apiKey = env.TAVILY_API_KEY?.trim()
  return apiKey
    ? new TavilyResearchProvider(apiKey, fetchImplementation)
    : new UnavailableResearchProvider()
}
