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

export function resolvePath(url) {
  const parsed = new URL(String(url ?? '/api'), 'http://vercel.local')
  const rawPathname = parsed.pathname || '/api'
  if (aliases[rawPathname]) return aliases[rawPathname]

  const parameterisedAlias = parameterisedAliases[rawPathname]
  const parameter = parameterisedAlias?.parameter
  const value = parameter ? parsed.searchParams.get(parameter) : null
  return value ? parameterisedAlias.target(value) : rawPathname
}

export default function handler(req, res) {
  const pathname = resolvePath(req.url)
  return handleWorkerRequest(req, res, pathname)
}
