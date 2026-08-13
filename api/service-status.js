export default function handler(_req, res) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({
    researchConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
  }))
}
