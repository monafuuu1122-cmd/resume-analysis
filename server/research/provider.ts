export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface ResearchQuery {
  query: string
  maxResults?: number
  includeDomains?: string[]
}

export interface ResearchDocument {
  title: string
  url: string
  content: string
  publishedAt?: string
  accessedAt: string
  domain?: string
  publisher?: string
  contentStatus?: 'full' | 'partial' | 'snippet-only' | 'failed'
  failureReason?: string
}

export interface ResearchProvider {
  readonly availability: 'available' | 'unavailable'
  search(
    input: ResearchQuery,
    signal: AbortSignal,
  ): Promise<ResearchDocument[]>
}

export class ResearchProviderUnavailableError extends Error {
  readonly code = 'provider_unavailable'

  constructor(message = '企业研究服务未配置') {
    super(message)
    this.name = 'ResearchProviderUnavailableError'
  }
}

export class UnavailableResearchProvider implements ResearchProvider {
  readonly availability = 'unavailable'

  async search(): Promise<never> {
    throw new ResearchProviderUnavailableError()
  }
}
