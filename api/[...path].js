import { handleWorkerRequest } from '../server/vercel-worker-handler.js'

const aliases = {
  '/api/ai-health': '/api/ai/health',
  '/api/ai-extract': '/api/ai/extract',
  '/api/mock-interview-session': '/api/mock-interview/session',
  '/api/mock-interview-question-practice':
    '/api/mock-interview/question-practice',
}

const parameterisedAliases = {
  '/api/interview-research-regenerate': {
    parameter: 'analysisId',
    target: (value) => `/api/interview-research/${encodeURIComponent(value)}/regenerate`,
  },
  '/api/interview-research-company-only': {
    parameter: 'analysisId',
    target: (value) => `/api/interview-research/${encodeURIComponent(value)}/company-only`,
  },
  '/api/mock-interview-turn': {
    parameter: 'sessionId',
    target: (value) => `/api/mock-interview/${encodeURIComponent(value)}/turn`,
  },
  '/api/mock-interview-complete': {
    parameter: 'sessionId',
    target: (value) => `/api/mock-interview/${encodeURIComponent(value)}/complete`,
  },
}

function resolveDynamicPath(query) {
  const value = query?.path
  if (Array.isArray(value)) {
    return value.filter((segment) => segment != null && String(segment) !== '')
  }

  if (typeof value === 'string' && value) {
    return value.split('/').filter(Boolean)
  }

  return []
}

export function resolvePath(url, query = {}) {
  const parsed = new URL(String(url ?? '/api'), 'http://vercel.local')
  let rawPathname = parsed.pathname || '/api'

  // Vercel can expose the dynamic catch-all template as req.url while the
  // matched segments are available through req.query.path.
  if (rawPathname === '/api/[...path]' || rawPathname === '/api') {
    const dynamicSegments = resolveDynamicPath(query)
    if (dynamicSegments.length > 0) {
      rawPathname = `/api/${dynamicSegments
        .map((segment) => encodeURIComponent(String(segment)))
        .join('/')}`
    }
  }

  if (aliases[rawPathname]) return aliases[rawPathname]

  const parameterisedAlias = parameterisedAliases[rawPathname]
  const parameter = parameterisedAlias?.parameter
  const value = parameter ? parsed.searchParams.get(parameter) : null
  return value ? parameterisedAlias.target(value) : rawPathname
}

export default function handler(req, res) {
  const pathname = resolvePath(req.url, req.query)
  return handleWorkerRequest(req, res, pathname)
}
