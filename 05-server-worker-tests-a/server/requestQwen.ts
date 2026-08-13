import type { Request } from 'express'

export function requestQwenKey(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const headerKey = String(request.header('x-deepseek-key') ?? '').trim()
  if (headerKey) return headerKey
  const browserKey = typeof request.body?.clientDeepSeek?.apiKey === 'string'
    ? request.body.clientDeepSeek.apiKey.trim()
    : ''
  return browserKey || String(env.DEEPSEEK_API_KEY ?? '').trim()
}
