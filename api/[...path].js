import { handleWorkerRequest } from './_worker-handler.js'

export default function handler(req, res) {
  const pathname = String(req.url ?? '/api').split('?')[0] || '/api'
  return handleWorkerRequest(req, res, pathname)
}
