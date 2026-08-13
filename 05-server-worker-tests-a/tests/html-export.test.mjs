import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { exportStaticHtml } from '../scripts/export-static-html.mjs'

test('copies the Vite client build into a static HTML export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'offer-html-'))
  const source = path.join(root, 'client')
  const destination = path.join(root, 'html-export')
  await mkdir(path.join(source, 'assets'), { recursive: true })
  await writeFile(path.join(source, 'index.html'), '<script src="/assets/app.js"></script>')
  await writeFile(path.join(source, 'assets', 'app.js'), 'console.log("ok")')

  await exportStaticHtml({ sourceDir: source, outputDir: destination })

  assert.equal(
    await readFile(path.join(destination, 'index.html'), 'utf8'),
    '<script src="/assets/app.js"></script>',
  )
  assert.equal(
    await readFile(path.join(destination, 'assets', 'app.js'), 'utf8'),
    'console.log("ok")',
  )
  assert.match(await readFile(path.join(destination, 'README.md'), 'utf8'), /Worker API/i)
})

test('does not invent or copy a DeepSeek secret into the export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'offer-html-secret-'))
  const source = path.join(root, 'client')
  const destination = path.join(root, 'html-export')
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, 'index.html'), 'static app')

  await exportStaticHtml({ sourceDir: source, outputDir: destination })

  const readme = await readFile(path.join(destination, 'README.md'), 'utf8')
  assert.doesNotMatch(readme, /sk-[A-Za-z0-9]/)
  assert.doesNotMatch(readme, /DEEPSEEK_API_KEY\s*=/)
})
