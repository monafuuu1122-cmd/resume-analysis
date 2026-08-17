import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePath } from '../api/[...path].js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function listJavaScriptFiles(directory, prefix = '') {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = join(prefix, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(directory, relativePath))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath)
    }
  }
  return files
}

test('Vercel Hobby deployment exposes one catch-all function', async () => {
  const apiFiles = (await listJavaScriptFiles(join(repoRoot, 'api')))
    .map((file) => file.replaceAll('\\', '/'))
    .sort()

  assert.deepEqual(apiFiles, ['[...path].js'])

  const catchAll = await readFile(join(repoRoot, 'api/[...path].js'), 'utf8')
  assert.match(catchAll, /from ['"]\.\.\/server\/vercel-worker-handler\.js['"]$/m)

  await readFile(join(repoRoot, 'server/vercel-worker-handler.js'), 'utf8')
})

test('routes nested API requests through the catch-all function before the SPA fallback', async () => {
  const config = JSON.parse(await readFile(join(repoRoot, 'vercel.json'), 'utf8'))
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:path*',
    destination: '/api/[...path]',
  })
  assert.equal(config.rewrites.at(-1).destination, '/index.html')
})

test('catch-all preserves legacy API aliases and parameterised routes', () => {
  assert.equal(resolvePath('/api/ai-health'), '/api/ai/health')
  assert.equal(resolvePath('/api/ai-extract'), '/api/ai/extract')
  assert.equal(
    resolvePath('/api/interview-research-regenerate?analysisId=analysis-1'),
    '/api/interview-research/analysis-1/regenerate',
  )
  assert.equal(
    resolvePath('/api/interview-research-company-only?analysisId=analysis-1'),
    '/api/interview-research/analysis-1/company-only',
  )
  assert.equal(
    resolvePath('/api/mock-interview-turn?sessionId=session-1'),
    '/api/mock-interview/session-1/turn',
  )
  assert.equal(
    resolvePath('/api/mock-interview-complete?sessionId=session-1'),
    '/api/mock-interview/session-1/complete',
  )
  assert.equal(resolvePath('/api/mock-interview-session'), '/api/mock-interview/session')
  assert.equal(
    resolvePath('/api/mock-interview-question-practice'),
    '/api/mock-interview/question-practice',
  )
})

test('catch-all resolves Vercel dynamic route parameters when req.url is the route template', () => {
  assert.equal(
    resolvePath('/api/[...path]', { path: ['ai', 'health'] }),
    '/api/ai/health',
  )
})
