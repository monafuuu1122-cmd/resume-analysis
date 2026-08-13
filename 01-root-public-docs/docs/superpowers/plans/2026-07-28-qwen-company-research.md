# Qwen Company Research Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make company research use the saved Qwen key directly and never mislabel an empty search result as an unconfigured service.

**Architecture:** Keep the existing browser-key → same-origin API → DashScope flow. Correct status mapping in both the Express and Sites worker implementations, preserve source-first generation, and make legacy `unavailable` records retryable in the existing panel.

**Tech Stack:** React 19, TypeScript, Vitest, Node test runner, Express, Cloudflare Sites worker, DashScope native web search.

---

### Task 1: Reproduce the status error in tests

**Files:**
- Modify: `tests/interview-api.test.ts`
- Modify: `tests/sites-worker.test.mjs`
- Modify: `tests/interview-research.test.tsx`

- [ ] **Step 1: Change the server expectation for a configured Qwen search with no sources**

```ts
expect(response.read()).toMatchObject({
  status: 200,
  payload: {
    researchStatus: 'no-reliable-info',
    identityStatus: 'unavailable',
    sources: [],
    companyInsights: [],
  },
})
```

- [ ] **Step 2: Add a Sites worker regression test**

```js
test('does not label an empty Qwen search as unconfigured', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) =>
    String(url).includes('/text-generation/generation')
      ? new Response(JSON.stringify({
          output: {
            choices: [{ message: { content: '未找到可靠来源' } }],
            search_info: { search_results: [] },
          },
        }))
      : new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                companyInsights: [],
                competencies: [],
                interviewPriorities: [],
                predictedQuestions: [],
                preparationChecklist: [],
              }),
            },
          }],
        }))
  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/interview-research', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dashscope-key': 'saved-browser-key',
        },
        body: JSON.stringify({
          analysisId: 'analysis-empty',
          jdText: '负责内容策略',
          model: 'qwen-plus',
          analysis: {
            company: 'Example',
            role: '内容策略',
            department: '待补充',
            location: '待补充',
            level: '校招',
          },
          profileContext: { claims: [], experiences: [] },
        }),
      }),
      { ASSETS: assets() },
    )
    assert.equal((await response.json()).researchStatus, 'no-reliable-info')
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

- [ ] **Step 3: Require legacy records to offer regeneration**

```tsx
expect(
  await screen.findByText('旧研究未完成，可直接使用千问重新生成。'),
).toBeInTheDocument()
expect(
  screen.getByRole('button', { name: '重新生成面试研究' }),
).toBeInTheDocument()
```

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/interview-api.test.ts tests/interview-research.test.tsx
node --test tests/sites-worker.test.mjs
```

Expected: failures because the current implementations return `unavailable` and hide retry for legacy records.

### Task 2: Correct research status and legacy UI

**Files:**
- Modify: `server/interview.ts`
- Modify: `worker/index.js`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`

- [ ] **Step 1: Map completed Qwen requests with no sources to `no-reliable-info`**

```ts
const researchStatus = researched.partial
  ? 'partial'
  : researched.identityStatus === 'uncertain'
    ? 'uncertain'
    : sources.length
      ? 'completed'
      : 'no-reliable-info'
```

Apply the equivalent expression in `worker/index.js`.

- [ ] **Step 2: Make legacy `unavailable` records retryable**

```tsx
const statusCopy = {
  unavailable: '旧研究未完成，可直接使用千问重新生成。',
}

{['failed', 'no-reliable-info', 'unavailable'].includes(
  research.researchStatus,
) && (
  <button type="button" onClick={() => void generate()}>
    {research.researchStatus === 'unavailable'
      ? '重新生成面试研究'
      : '重试面试研究'}
  </button>
)}
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run the commands from Task 1.

Expected: all focused tests pass.

### Task 3: Validate, document, and publish

**Files:**
- Verify: `server/research/qwenSearchProvider.ts`
- Verify: `worker/index.js`
- Verify: `.openai/hosting.json`

- [ ] **Step 1: Confirm the Qwen request keeps official-source search controls**

Verify the request contains:

```ts
enable_search: true
search_options: {
  enable_source: true,
  forced_search: true,
}
```

- [ ] **Step 2: Run full verification**

```bash
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b
node --test tests/sites-worker.test.mjs
node node_modules/vite/bin/vite.js build
node scripts/prepare-sites-build.mjs
git diff --check
```

Expected: all tests and checks pass; only the existing chunk-size warning may remain.

- [ ] **Step 3: Commit**

```bash
git add server/interview.ts worker/index.js src/components/interview/InterviewResearchPanel.tsx tests/interview-api.test.ts tests/interview-research.test.tsx tests/sites-worker.test.mjs
git commit -m "fix: use Qwen directly for company research"
```

- [ ] **Step 4: Publish to the existing Sites project**

Create the app-root subtree commit, push it to the existing Sites source branch, save a new site version, deploy that saved version, and poll until the deployment reports `succeeded`.
