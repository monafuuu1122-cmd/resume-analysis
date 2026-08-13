// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import {
  createResearchProvider,
  TAVILY_SEARCH_URL,
  TavilyResearchProvider,
} from '../server/research/tavilyProvider'
import {
  DASHSCOPE_SEARCH_URL,
  QwenSearchProvider,
} from '../server/research/qwenSearchProvider'
import {
  type FetchImplementation,
  type ResearchDocument,
  type ResearchProvider,
} from '../server/research/provider'
import { researchCompany } from '../server/research/researchService'

describe('TavilyResearchProvider', () => {
  it('uses the server key, forwards cancellation, and normalizes valid results', async () => {
    const accessedAt = new Date('2026-07-28T03:00:00.000Z')
    const fetchMock = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: ' Example company ',
              url: 'https://example.com/about',
              raw_content: ' Official company profile. ',
              published_date: '2026-07-20T00:00:00.000Z',
            },
            {
              title: '',
              url: 'not-a-url',
              content: '',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const provider = new TavilyResearchProvider(
      'server-secret',
      fetchMock,
      () => accessedAt,
    )
    const controller = new AbortController()

    await expect(
      provider.search(
        {
          query: 'Example company official website',
          maxResults: 8,
          includeDomains: ['example.com'],
        },
        controller.signal,
      ),
    ).resolves.toEqual([
      {
        title: 'Example company',
        url: 'https://example.com/about',
        content: 'Official company profile.',
        publishedAt: '2026-07-20T00:00:00.000Z',
        accessedAt: '2026-07-28T03:00:00.000Z',
      },
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(TAVILY_SEARCH_URL)
    expect(init?.headers).toEqual({
      authorization: 'Bearer server-secret',
      'content-type': 'application/json',
    })
    expect(init?.signal).toBe(controller.signal)
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'Example company official website',
      include_raw_content: 'markdown',
      max_results: 8,
      include_domains: ['example.com'],
    })
  })

  it('returns an explicit unavailable provider when the server key is absent', async () => {
    const provider = createResearchProvider({})

    expect(provider.availability).toBe('unavailable')
    await expect(
      provider.search({ query: 'Example' }, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'provider_unavailable',
      message: '企业研究服务未配置',
    })
  })
})

describe('QwenSearchProvider', () => {
  it('uses the current Qwen key and returns traceable search sources', async () => {
    const fetchMock = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: 'Example 重视用户价值与跨团队协作。',
                },
              },
            ],
            search_info: {
              search_results: [
                {
                  site_name: 'Example',
                  title: 'Example 官方网站',
                  url: 'https://example.com/about',
                },
                {
                  site_name: '无效来源',
                  title: '',
                  url: 'not-a-url',
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    )
    const provider = new QwenSearchProvider(
      'browser-secret',
      'deepseek-v4-flash',
      fetchMock,
      () => new Date('2026-07-28T03:00:00.000Z'),
    )

    await expect(
      provider.search(
        {
          query: 'Example official website',
          maxResults: 5,
          includeDomains: ['example.com'],
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual([
      {
        title: 'Example 官方网站',
        url: 'https://example.com/about',
        content: 'Example 重视用户价值与跨团队协作。',
        accessedAt: '2026-07-28T03:00:00.000Z',
      },
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(DASHSCOPE_SEARCH_URL)
    expect(init?.headers).toEqual({
      authorization: 'Bearer browser-secret',
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      parameters: {
        enable_search: true,
        result_format: 'message',
        search_options: {
          enable_source: true,
          forced_search: true,
        },
      },
    })
  })
})

function document(url: string, title = url): ResearchDocument {
  return {
    title,
    url,
    content: `${title} content`,
    accessedAt: '2026-07-28T03:00:00.000Z',
  }
}

describe('researchCompany', () => {
  it('stops after official-domain discovery when company identity is uncertain', async () => {
    const search = vi.fn<ResearchProvider['search']>().mockResolvedValue([
      document('https://acme-one.example/about'),
      document('https://acme-two.example/about'),
      document('https://www.acme-one.example/careers'),
    ])
    const provider: ResearchProvider = {
      availability: 'available',
      search,
    }

    await expect(
      researchCompany(
        provider,
        { company: 'Acme' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      identityStatus: 'uncertain',
      candidateDomains: ['acme-one.example', 'acme-two.example'],
      documents: [],
      partial: false,
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0].query).toContain('official website')
  })

  it('prioritizes official sources and keeps successful sources after a partial failure', async () => {
    const search = vi.fn<ResearchProvider['search']>(
      async (query) => {
        if (query.query.includes('official website')) {
          return [
            document('https://example.com/about', 'Official site'),
            document('https://careers.example.com', 'Official careers'),
            document('https://linkedin.com/company/example', 'Directory result'),
          ]
        }
        if (query.query.includes('careers')) {
          throw new Error('careers unavailable')
        }
        if (query.query.includes('annual report')) {
          return [document('https://example.com/report.pdf', 'Annual report')]
        }
        if (query.query.includes('official social')) {
          return [document('https://linkedin.com/company/example', 'LinkedIn')]
        }
        if (query.query.includes('industry news')) {
          return [document('https://news.example.test/example', 'Industry')]
        }
        return [document('https://jobs.example.test/example', 'Jobs')]
      },
    )
    const provider: ResearchProvider = {
      availability: 'available',
      search,
    }

    const result = await researchCompany(
      provider,
      { company: 'Example' },
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      identityStatus: 'confirmed',
      officialDomain: 'example.com',
      candidateDomains: ['example.com'],
      partial: true,
      failures: [
        {
          sourceType: 'official_careers',
          message: 'careers unavailable',
        },
      ],
    })
    expect(result.documents.map(({ sourceType }) => sourceType)).toEqual([
      'official_website',
      'official_report',
      'official_social',
      'industry_media',
      'job_platform',
    ])
    expect(search.mock.calls.slice(1).map(([query]) => query.includeDomains))
      .toEqual([
        ['example.com'],
        ['example.com'],
        undefined,
        undefined,
        undefined,
      ])
    expect(search.mock.calls[2][0].query).toContain(
      'annual report ESG project report',
    )
  })

  it('reports unavailable without attempting discovery', async () => {
    const provider = createResearchProvider({})
    const search = vi.spyOn(provider, 'search')

    await expect(
      researchCompany(
        provider,
        { company: 'Example' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
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
    })
    expect(search).not.toHaveBeenCalled()
  })
})
