import { handleWorkerRequest } from './_worker-handler.js'

export default function handler(req, res) {
  return handleWorkerRequest(req, res, '/api/mock-interview/question-practice')
}
