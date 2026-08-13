import type {
  FetchImplementation,
  ResearchDocument,
  ResearchProvider,
  ResearchQuery,
} from './provider'
import { fetchResearchPage } from './webContentService'

export type ResearchSourceType =
  | 'official_website'
  | 'official_careers'
  | 'official_report'
  | 'official_social'
  | 'industry_media'
  | 'job_platform'

export interface SourcedResearchDocument extends ResearchDocument {
  sourceType: ResearchSourceType
}

export interface CompanyResearchResult {
  identityStatus: 'confirmed' | 'uncertain' | 'unavailable'
  officialDomain?: string
  candidateDomains: string[]
  documents: SourcedResearchDocument[]
  failures: Array<{ sourceType: ResearchSourceType; message: string }>
  partial: boolean
}

interface CompanyResearchInput {
  company: string
  website?: string
  industry?: string
  role?: string
}

interface SearchStage {
  sourceType: Exclude<ResearchSourceType, 'official_website'>
  query: ResearchQuery
}

const directoryDomains = [
  'linkedin.com',
  'wikipedia.org',
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'glassdoor.com',
  'indeed.com',
]

function domainOf(url: string) {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^(?:www|careers|jobs|ir|investors)\./, '')
  } catch {
    return undefined
  }
}

function isDirectoryDomain(domain: string) {
  return directoryDomains.some(
    (directory) => domain === directory || domain.endsWith(`.${directory}`),
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '来源检索失败'
}

function uniqueDocuments(documents: SourcedResearchDocument[]) {
  const seen = new Set<string>()
  return documents.filter((document) => {
    if (seen.has(document.url)) return false
    seen.add(document.url)
    return true
  })
}

export async function researchCompany(
  provider: ResearchProvider,
  input: CompanyResearchInput,
  signal: AbortSignal,
  contentFetch?: FetchImplementation,
): Promise<CompanyResearchResult> {
  if (provider.availability === 'unavailable') {
    return {
      identityStatus: 'unavailable',
      candidateDomains: [],
      documents: [],
      failures: [
        {
          sourceType: 'official_website',
          message: '企业研究服务未配置',
        },
      ],
      partial: false,
    }
  }

  const providedDomain = input.website ? domainOf(input.website) : undefined
  let discoveryDocuments: ResearchDocument[]
  try {
    discoveryDocuments = await provider.search(
      {
        query: `${input.company} ${input.website ?? ''} ${input.industry ?? ''} official website 官方网站`.trim(),
        maxResults: 5,
      },
      signal,
    )
  } catch (error) {
    if (signal.aborted) throw error
    return {
      identityStatus: 'unavailable',
      candidateDomains: [],
      documents: [],
      failures: [
        {
          sourceType: 'official_website',
          message: errorMessage(error),
        },
      ],
      partial: false,
    }
  }

  const candidateDomains = [
    ...new Set(
      discoveryDocuments
        .map(({ url }) => domainOf(url))
        .filter(
          (domain): domain is string =>
            typeof domain === 'string' && !isDirectoryDomain(domain),
        ),
    ),
  ]
  const officialHintDomains = [
    ...new Set(
      discoveryDocuments
        .filter(({ title }) =>
          /官方网站|官网|official (?:website|site|careers|jobs)/iu.test(title),
        )
        .map(({ url }) => domainOf(url))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ]
  const resolvedDomains = providedDomain
    ? [providedDomain]
    : officialHintDomains.length > 0
      ? officialHintDomains
      : candidateDomains

  if (resolvedDomains.length !== 1) {
    return {
      identityStatus:
        resolvedDomains.length > 1 ? 'uncertain' : 'unavailable',
      candidateDomains,
      documents: [],
      failures: [],
      partial: false,
    }
  }

  const officialDomain = resolvedDomains[0]
  const stages: SearchStage[] = [
    {
      sourceType: 'official_careers',
      query: {
        query: `${input.company} ${input.role ?? ''} careers jobs`.trim(),
        includeDomains: [officialDomain],
        maxResults: 5,
      },
    },
    {
      sourceType: 'official_report',
      query: {
        query: `${input.company} annual report ESG project report investor relations`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
    },
    {
      sourceType: 'official_social',
      query: {
        query: `${input.company} official social LinkedIn WeChat`,
        maxResults: 5,
      },
    },
    {
      sourceType: 'industry_media',
      query: {
        query: `${input.company} ${input.industry ?? ''} latest business industry news`.trim(),
        maxResults: 5,
      },
    },
    {
      sourceType: 'job_platform',
      query: {
        query: `${input.company} ${input.role ?? ''} jobs recruitment platform`.trim(),
        maxResults: 5,
      },
    },
  ]

  const settled = await Promise.allSettled(
    stages.map(({ query }) => provider.search(query, signal)),
  )
  if (signal.aborted) {
    const abortFailure = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected',
    )
    throw abortFailure?.reason ?? new DOMException('Aborted', 'AbortError')
  }

  const failures: CompanyResearchResult['failures'] = []
  const officialDiscoveryDocument = discoveryDocuments.find(
    ({ url }) => domainOf(url) === officialDomain,
  )
  const documents: SourcedResearchDocument[] = officialDiscoveryDocument
    ? [{ ...officialDiscoveryDocument, sourceType: 'official_website' }]
    : []
  settled.forEach((result, index) => {
    const sourceType = stages[index].sourceType
    if (result.status === 'rejected') {
      failures.push({ sourceType, message: errorMessage(result.reason) })
      return
    }
    documents.push(
      ...result.value.map((document) => ({ ...document, sourceType })),
    )
  })

  const unique = uniqueDocuments(documents)
  const enriched = contentFetch
    ? await Promise.all(
        unique.map(async (document) => {
          const page = await fetchResearchPage(
            document.url,
            signal,
            contentFetch,
          )
          return {
            ...document,
            content:
              page.contentStatus === 'failed' || !page.content
                ? document.content
                : page.content,
            domain: page.domain ?? domainOf(document.url),
            publisher: page.publisher,
            contentStatus:
              page.contentStatus === 'failed' && document.content
                ? ('snippet-only' as const)
                : page.contentStatus,
            ...(page.failureReason
              ? { failureReason: page.failureReason }
              : {}),
          }
        }),
      )
    : unique.map((document) => ({
        ...document,
        domain: domainOf(document.url),
        contentStatus: 'snippet-only' as const,
      }))
  const contentFailures = contentFetch
    ? enriched
        .filter(({ contentStatus }) => contentStatus !== 'full')
        .map((document) => ({
          sourceType: document.sourceType,
          message:
            document.failureReason ??
            `${document.title} 仅获得搜索摘要，未能读取完整正文`,
        }))
    : []

  return {
    identityStatus: 'confirmed',
    officialDomain,
    candidateDomains,
    documents: enriched,
    failures: [...failures, ...contentFailures],
    partial: failures.length > 0 || contentFailures.length > 0,
  }
}
