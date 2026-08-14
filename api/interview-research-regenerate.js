import { handleWorkerRequest } from './_worker-handler.js'

export default function handler(req, res) {
  return handleWorkerRequest(req, res, `/api/interview-research/${req.query.analysisId}/regenerate`)
}
