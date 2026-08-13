import type { FetchImplementation } from './provider'

export type ResearchContentStatus =
  | 'full'
  | 'partial'
  | 'snippet-only'
  | 'failed'

export interface ResearchPageContent {
  content: string
  contentStatus: ResearchContentStatus
  domain?: string
  publisher?: string
  failureReason?: string
}

const privateIpv4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/
const privateIpv6 = /^(?:::1|f[cd][0-9a-f]{2}:|fe8[0-9a-f]:)/i

export function isSafeResearchUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return !(
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      privateIpv4.test(hostname) ||
      privateIpv6.test(hostname)
    )
  } catch {
    return false
  }
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (_, decimal: string, hex: string, name: string) =>
      decimal
        ? String.fromCodePoint(Number(decimal))
        : hex
          ? String.fromCodePoint(Number.parseInt(hex, 16))
          : named[name.toLowerCase()] ?? ' ',
  )
}

function cleanHtml(html: string) {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/<[^>]+>/g, ' ') ??
    ''
  const plain = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(?:script|style|svg|noscript|nav|footer|form|iframe)[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|nav|footer|form|iframe)>/giu,
        ' ',
      )
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/giu, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
  const lines = `${title}\n${plain}`
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8)
  return [...new Set(lines)].join('\n').slice(0, 18_000)
}

export async function fetchResearchPage(
  pageUrl: string,
  signal: AbortSignal,
  fetcher: FetchImplementation = fetch,
): Promise<ResearchPageContent> {
  if (!isSafeResearchUrl(pageUrl)) {
    return {
      content: '',
      contentStatus: 'failed',
      failureReason: '链接不是可访问的公开网页',
    }
  }
  try {
    const response = await fetcher(pageUrl, {
      signal,
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.8',
        'user-agent': 'OfferAdventureResearch/1.0',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const redirect = response.headers.get('location')
      if (!redirect) throw new Error('页面重定向缺少目标地址')
      const resolved = new URL(redirect, pageUrl).toString()
      if (!isSafeResearchUrl(resolved)) throw new Error('页面重定向到非公开地址')
      return fetchResearchPage(resolved, signal, fetcher)
    }
    if (!response.ok) throw new Error(`页面返回 ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return {
        content: '',
        contentStatus: 'partial',
        domain: new URL(pageUrl).hostname,
        failureReason: '当前页面格式暂不支持正文提取',
      }
    }
    const content = cleanHtml((await response.text()).slice(0, 600_000))
    if (!content) throw new Error('页面没有可提取的正文')
    const domain = new URL(pageUrl).hostname.replace(/^www\./, '')
    return {
      content,
      contentStatus: content.length >= 25 ? 'full' : 'partial',
      domain,
      publisher: domain,
    }
  } catch (error) {
    if (signal.aborted) throw error
    return {
      content: '',
      contentStatus: 'failed',
      failureReason: error instanceof Error ? error.message : '页面读取失败',
    }
  }
}
