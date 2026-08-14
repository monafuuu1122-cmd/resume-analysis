import { handleWorkerRequest } from './_worker-handler.js'

export default function handler(req, res) {
  const rawPathname = String(req.url ?? '/api').split('?')[0] || '/api'
  const aliases = {
    '/api/ai-health': '/api/ai/health',
    '/api/ai-extract': '/api/ai/extract',
    '/api/mock-interview-session': '/api/mock-interview/session',
    '/api/mock-interview-question-practice':
      '/api/mock-interview/question-practice',
  }
  const pathname = aliases[rawPathname] ?? rawPathname
  return handleWorkerRequest(req, res, pathname)
}
