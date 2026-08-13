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

function absoluteUrl(req, pathname) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https'
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  return `${protocol}://${host}${pathname}${query}`
}

async function requestBody(req) {
  if (!req.body || req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function sendResponse(response, res) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

export async function handleWorkerRequest(req, res, pathname) {
  try {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value != null) headers.set(key, String(value))
    }
    const request = new Request(absoluteUrl(req, pathname), {
      method: req.method,
      headers,
      body: await requestBody(req),
    })
    const worker = await import('../worker/index.js')
    await sendResponse(await worker.default.fetch(request, env), res)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      message: error instanceof Error ? error.message : '服务暂时不可用，请重试',
    }))
  }
}
