# Static HTML + DeepSeek Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible static HTML export for the existing Offer 探险日 web app while keeping all DeepSeek requests behind the same-origin Worker API.

**Architecture:** Keep the current Vite React SPA and Cloudflare Worker unchanged as the runtime boundary. Vite continues to build `dist/client/index.html` and assets; a small Node export script copies that client build into an ignored `html-export/` folder for static hosting or inspection. DeepSeek credentials remain Worker environment variables or one-request browser overrides and are never copied into the export.

**Tech Stack:** React 19, Vite 6, TypeScript, Node ESM scripts, Cloudflare Worker Sites adapter, Vitest/Node test runner.

---

### Task 1: Define the static export contract with a failing test

**Files:**
- Create: `tests/html-export.test.mjs`
- Modify: `package.json` only after the test exists

- [ ] **Step 1: Write the failing test**

Create a Node test that imports `exportStaticHtml` from `scripts/export-static-html.mjs`, creates a temporary source directory containing `index.html` and `assets/app.js`, exports it to a temporary destination, and verifies:

```js
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

  assert.equal(await readFile(path.join(destination, 'index.html'), 'utf8'), '<script src="/assets/app.js"></script>')
  assert.equal(await readFile(path.join(destination, 'assets', 'app.js'), 'utf8'), 'console.log("ok")')
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/html-export.test.mjs
```

Expected: FAIL because `scripts/export-static-html.mjs` does not exist.

### Task 2: Implement the static HTML exporter

**Files:**
- Create: `scripts/export-static-html.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Implement the minimal exporter**

Implement a named `exportStaticHtml({ sourceDir, outputDir })` function that:

1. Verifies `sourceDir/index.html` exists.
2. Removes only the requested `outputDir` and recreates it.
3. Recursively copies the Vite client build, preserving assets and filenames.
4. Writes `README.md` explaining that the folder is a static frontend and must be served with the same-origin Worker API for DeepSeek features; it must not contain a key or ask users to paste one into source files.
5. Exposes a CLI default of `dist/client` → `html-export`.

Use `fs/promises` (`access`, `cp`, `mkdir`, `rm`, `writeFile`) and avoid shell copy commands. Throw clear errors for a missing source or a destination equal to the source.

- [ ] **Step 2: Add generated-output ignore rules**

Append `html-export/` to `.gitignore` so generated static assets are never committed as a second copy of the production build.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
node --test tests/html-export.test.mjs
```

Expected: 2 passing tests.

### Task 3: Add the reproducible build command and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-06-static-html-deepseek-design.md` only if implementation details require clarification

- [ ] **Step 1: Add the build command**

Add this script without changing the existing production build:

```json
"build:html": "npm run build && node scripts/export-static-html.mjs"
```

The command must leave the normal `dist/` Sites deployment intact and create the ignored `html-export/` folder.

- [ ] **Step 2: Document usage and network boundaries**

Add a README section:

```text
静态 HTML 导出

npm run build:html

生成的 html-export/ 是静态前端文件夹。部署时需要让它与当前 Worker API 同域提供，才能使用 DeepSeek 分析；不要把 DEEPSEEK_API_KEY 写进 HTML 或前端环境变量。浏览器不需要直接连接 DeepSeek，也不需要在浏览器配置代理；实际可用性取决于 Worker 出站网络和网站域名可访问性。
```

- [ ] **Step 3: Run the command and verify its artifact contract**

Run:

```bash
npm run build:html
test -f html-export/index.html
test -f dist/client/index.html
rg -n "sk-[A-Za-z0-9]" html-export || true
```

Expected: build succeeds, both HTML entrypoints exist, and no secret-like key appears in the export.

### Task 4: Verify same-origin Worker routing and API behavior

**Files:**
- Test: `tests/sites-worker.test.mjs`
- Test: `tests/html-export.test.mjs`
- Modify: `worker/index.js` only if a regression is found

- [ ] **Step 1: Add route assertions if missing**

Assert that a browser request for `/capabilities` with `Accept: text/html` first checks the requested path and then receives `/index.html`, while `/api/service-status` never falls back to HTML. Keep the existing assertion that browser-local DeepSeek keys are used only for the current upstream request and are not included in the prompt.

- [ ] **Step 2: Run focused runtime tests**

Run:

```bash
node --test tests/sites-worker.test.mjs tests/html-export.test.mjs
```

Expected: all tests pass, including the existing timeout/cancel and secret-redaction cases.

### Task 5: Full validation and local browser check

**Files:**
- No new source files.

- [ ] **Step 1: Run the complete checks**

Run:

```bash
npm test -- --run
npm run build
npm run build:html
git diff --check
```

Expected: all existing tests pass, TypeScript/Vite/Sites build succeeds, and `html-export/index.html` is generated.

- [ ] **Step 2: Check the built HTML and critical routes in the local browser**

Open the running local app and verify `/`, `/capabilities`, `/role-directions`, `/jd-lab`, `/interview-prep`, and `/settings` render the same SPA entrypoint. Verify the API health panel still reports the server-side DeepSeek configuration without displaying the secret.

### Task 6: Publish the validated HTML-capable version

**Files:**
- Modify: `.openai/hosting.json` only if the existing project ID is missing (it is currently present)

- [ ] **Step 1: Commit the exact validated source**

```bash
git add scripts/export-static-html.mjs tests/html-export.test.mjs package.json README.md .gitignore
git commit -m "feat: add static html export"
```

- [ ] **Step 2: Push and package the same commit**

Push the current HEAD to the existing Sites source branch using a short-lived per-command credential, then run the Sites `package-site.sh` helper against the validated `dist/` output.

- [ ] **Step 3: Save and deploy a private Sites version**

Save the archive with the full pushed commit SHA, deploy using the existing private access policy, poll until `succeeded`, and return the unchanged production URL. Do not update access mode or runtime secrets as part of this export.

