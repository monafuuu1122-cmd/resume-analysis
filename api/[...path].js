import worker from '../worker/index.js'

const env = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  DEEPSEEK_TIMEOUT_DEFAULT_MS: process.env.DEEPSEEK_TIMEOUT_DEFAULT_MS,
  DEEPSEEK_TIMEOUT_RESUME_EXTRACTION_MS:
    process.env.DEEPSEEK_TIMEOUT_RESUME_EXTRACTION_MS,
  DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS:
    process.env.DEEPSEEK_TIMEOUT_JD_ANALYSIS_MS,
  DEEPSEEK_TIMEOUT_COMPANY_RESEARCH_MS:
    process.env.DEEPSEEK_TIMEOUT_COMPANY_RESEARCH_MS,
  DEEPSEEK_TIMEOUT_CAREER_FIT_MS:
    process.env.DEEPSEEK_TIMEOUT_CAREER_FIT_MS,
  DEEPSEEK_TIMEOUT_CAREER_INSPIRATION_MS:
    process.env.DEEPSEEK_TIMEOUT_CAREER_INSPIRATION_MS,
  DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_START_MS:
    process.env.DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_START_MS,
  DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_TURN_MS:
    process.env.DEEPSEEK_TIMEOUT_MOCK_INTERVIEW_TURN_MS,
  DEEPSEEK_TIMEOUT_INTERVIEW_REPORT_MS:
    process.env.DEEPSEEK_TIMEOUT_INTERVIEW_REPORT_MS,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
}

function absoluteUrl(request) {
  const protocol = request.headers['x-forwarded-proto'] ?? 'https'
  const host = request.headers['x-forwarded-host'] ?? request.headers.host
  return `${protocol}://${host}${request.url}`
}

async function requestBody(request) {
  if (!request.body || request.method === 'GET' || request.method === 'HEAD') {
    return undefined
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function sendResponse(response, res) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const body = Buffer.from(await response.arrayBuffer())
  res.end(body)
}

export default async function handler(req, res) {
  try {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value != null) headers.set(key, String(value))
    }
    const request = new Request(absoluteUrl(req), {
      method: req.method,
      headers,
      body: await requestBody(req),
    })
    const response = await worker.fetch(request, env)
    await sendResponse(response, res)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      message: error instanceof Error ? error.message : '服务暂时不可用，请重试',
    }))
  }
}
