import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLocalServerEnv, parseDotEnv } from '../scripts/start-local-html.mjs'

test('parses local DeepSeek settings without loading them into frontend files', () => {
  const parsed = parseDotEnv(`
# local-only settings
DEEPSEEK_API_KEY="local-secret"
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=4310
`)

  assert.deepEqual(parsed, {
    DEEPSEEK_API_KEY: 'local-secret',
    DEEPSEEK_MODEL: 'deepseek-v4-flash',
    PORT: '4310',
  })
})

test('builds a local server environment that serves html-export', () => {
  const env = buildLocalServerEnv(
    { PATH: '/bin', PORT: '4321' },
    { DEEPSEEK_API_KEY: 'local-secret' },
  )

  assert.equal(env.DEEPSEEK_API_KEY, 'local-secret')
  assert.equal(env.HTML_DIST_DIR, 'html-export')
  assert.equal(env.PORT, '4321')
})
