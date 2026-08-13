# Dynamic Career Directions and Company Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four fixed role scores with persistent evidence-backed career directions and complete company research by fetching source pages before Qwen analysis.

**Architecture:** Career directions live in IndexedDB and are analyzed against reusable evidence units built from the complete confirmed profile. Qwen produces schema-validated inspiration batches through dedicated endpoints. Company research keeps Qwen search as URL discovery, adds a safe HTML content extractor, then runs separate company-analysis and interview-preparation model stages.

**Tech Stack:** React 19, TypeScript, Zustand, Dexie, Zod, Express, Cloudflare Worker, Vitest, Testing Library, Qwen DashScope.

---

### Task 1: Persistent career direction domain

**Files:**
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/db/database.ts`
- Create: `src/db/careerDirectionRepository.ts`
- Test: `tests/career-direction-repository.test.ts`

- [ ] **Step 1: Write the failing migration and repository tests**

```ts
it('seeds the four legacy directions once and allows unlimited custom records', async () => {
  await ensureLegacyCareerDirections()
  await ensureLegacyCareerDirections()
  await saveCareerDirection(makeDirection('企业文化', 'user-created'))
  expect(await listCareerDirections()).toHaveLength(5)
})

it('updates status and deletes one direction without changing the rest', async () => {
  const first = await saveCareerDirection(makeDirection('品牌营销', 'default'))
  const second = await saveCareerDirection(makeDirection('内容策略', 'default'))
  await updateCareerDirectionStatus(first.id, 'primary')
  await deleteCareerDirection(second.id)
  expect(await listCareerDirections()).toMatchObject([{ id: first.id, status: 'primary' }])
})
```

- [ ] **Step 2: Run the repository test and verify missing APIs fail**

Run: `node node_modules/vitest/vitest.mjs run tests/career-direction-repository.test.ts`

Expected: FAIL because `careerDirectionRepository` does not exist.

- [ ] **Step 3: Add schemas, Dexie v5 tables, one-time default seeding, CRUD and feedback storage**

```ts
export const careerDirectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  source: z.enum(['default', 'user-created', 'ai-recommended', 'jd-derived']),
  status: z.enum(['exploring', 'interested', 'primary', 'secondary', 'archived']),
  fitScore: z.number().min(0).max(100).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  matchedEvidence: z.array(careerEvidenceSchema).default([]),
  possibleTitles: z.array(z.string()).default([]),
  adjacentDirections: z.array(z.string()).default([]),
  developmentSuggestions: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
})
```

Dexie v5 adds `careerDirections`, `careerDirectionFeedback`, and `careerInspirationBatches`. `ensureLegacyCareerDirections` seeds the original four names only when the table is empty.

- [ ] **Step 4: Run the repository test**

Run: `node node_modules/vitest/vitest.mjs run tests/career-direction-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add job-search-dashboard/src/domain job-search-dashboard/src/db job-search-dashboard/tests/career-direction-repository.test.ts
git commit -m "feat: persist expandable career directions"
```

### Task 2: Complete profile evidence units and dynamic matching

**Files:**
- Create: `src/domain/careerEvidence.ts`
- Create: `src/domain/careerMatching.ts`
- Modify: `src/db/evidenceRepository.ts`
- Test: `tests/career-evidence.test.ts`
- Test: `tests/career-matching.test.ts`

- [ ] **Step 1: Write failing evidence tests**

```ts
it('joins claim, quote, experience and profile material into reusable units', () => {
  const units = buildCareerEvidenceUnits(snapshot)
  expect(units).toEqual(expect.arrayContaining([
    expect.objectContaining({
      experienceId: 'world-cup',
      originalText: '参与直播脚本修改和现场流程测试',
      evidenceType: 'action',
    }),
  ]))
})

it('reinterprets one evidence unit differently for two directions', () => {
  expect(matchCareerDirection(brand, units).matchedEvidence[0].matchAngle)
    .toContain('品牌传播')
  expect(matchCareerDirection(event, units).matchedEvidence[0].matchAngle)
    .toContain('现场流程')
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/career-evidence.test.ts tests/career-matching.test.ts`

Expected: FAIL because evidence and matching services do not exist.

- [ ] **Step 3: Implement joined evidence units and conservative local matching**

```ts
export function buildCareerEvidenceUnits(snapshot: ConfirmedEvidenceSnapshot) {
  const spans = new Map(snapshot.evidenceSpans.map(span => [span.id, span]))
  return snapshot.claims.flatMap(claim =>
    claim.evidenceSpanIds.flatMap(spanId => {
      const span = spans.get(spanId)
      if (!span) return []
      return [{
        id: `${claim.id}:${span.id}`,
        experienceId: claim.experienceId,
        evidenceType: claimKindToEvidenceType(claim.kind),
        originalText: span.quote,
        normalizedDescription: [claim.label, claim.detail].filter(Boolean).join('：'),
        confidence: 'high' as const,
      }]
    }),
  )
}
```

Local matching may identify direct keyword evidence and gaps but must label semantic transfer as `ability-transfer`; Qwen later supplies richer angles while preserving IDs.

- [ ] **Step 4: Run the evidence tests**

Run: `node node_modules/vitest/vitest.mjs run tests/career-evidence.test.ts tests/career-matching.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add job-search-dashboard/src/domain/careerEvidence.ts job-search-dashboard/src/domain/careerMatching.ts job-search-dashboard/src/db/evidenceRepository.ts job-search-dashboard/tests/career-*.test.ts
git commit -m "feat: build reusable career evidence units"
```

### Task 3: Qwen career inspiration service

**Files:**
- Create: `src/domain/careerSchemas.ts`
- Create: `src/ai/careerPrompts.ts`
- Create: `src/ai/careerParsers.ts`
- Modify: `src/ai/client.ts`
- Create: `server/career.ts`
- Modify: `server/index.ts`
- Modify: `worker/index.js`
- Test: `tests/career-api.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Write failing API tests**

```ts
it('sends complete evidence and accepts a non-predefined direction', async () => {
  const response = await runCareerHandler({
    evidenceUnits: [unit],
    savedDirections: ['品牌营销'],
    excludedDirections: ['用户运营'],
  })
  expect(qwenInput).toContain(unit.id)
  expect(response.directions[0].name).toBe('雇主品牌')
})

it('drops one invalid card instead of losing valid recommendations', async () => {
  const result = parseCareerInspiration({ directions: [validCard, invalidCard] })
  expect(result.directions).toEqual([validCard])
  expect(result.status).toBe('partial')
})
```

- [ ] **Step 2: Run tests and verify missing endpoint/parser failures**

Run: `node node_modules/vitest/vitest.mjs run tests/career-api.test.ts`

Expected: FAIL because the endpoint and parser do not exist.

- [ ] **Step 3: Implement dedicated prompt, per-card validation, normalization and one retry**

```ts
export const careerInspirationCardSchema = z.object({
  name: z.string().min(1),
  directionType: z.enum(['direct', 'adjacent', 'hybrid', 'exploratory']),
  fitScore: z.number().min(0).max(100),
  confidence: z.enum(['high', 'medium', 'low']),
  whySuitable: z.string().min(1),
  matchedEvidenceIds: z.array(z.string().min(1)).min(1),
  transitionDifficulty: z.enum(['low', 'medium', 'high']),
  evidenceGaps: z.array(z.string()),
  nextActions: z.array(z.string()),
  searchKeywords: z.array(z.string()),
})
```

The server validates all evidence IDs, excludes rejected normalized names, retries one format failure, and returns `completed`, `partial`, `insufficient-profile`, `model-failed`, or `parse-failed`.

- [ ] **Step 4: Run API and Worker tests**

Run: `node node_modules/vitest/vitest.mjs run tests/career-api.test.ts && node --test tests/sites-worker.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add job-search-dashboard/src/ai job-search-dashboard/src/domain/careerSchemas.ts job-search-dashboard/server job-search-dashboard/worker job-search-dashboard/tests/career-api.test.ts job-search-dashboard/tests/sites-worker.test.mjs
git commit -m "feat: add Qwen career inspiration analysis"
```

### Task 4: Dynamic career direction and inspiration UI

**Files:**
- Rewrite: `src/pages/RoleDirectionsPage.tsx`
- Create: `src/components/career/CareerDirectionCard.tsx`
- Create: `src/components/career/CareerDirectionDetail.tsx`
- Create: `src/components/career/CareerInspirationDialog.tsx`
- Create: `src/components/career/CareerInspirationCard.tsx`
- Create: `src/stores/careerDirectionStore.ts`
- Modify: `src/styles/global.css`
- Test: `tests/role-directions.test.tsx`

- [ ] **Step 1: Replace fixed-card expectations with failing dynamic UI tests**

```tsx
it('adds and deletes a user direction without a four-item limit', async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: '新增方向' }))
  fireEvent.change(screen.getByLabelText('方向名称'), { target: { value: '企业文化' } })
  fireEvent.click(screen.getByRole('button', { name: '保存方向' }))
  expect(await screen.findByRole('heading', { name: '企业文化' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '删除方向 企业文化' }))
  expect(screen.queryByRole('heading', { name: '企业文化' })).not.toBeInTheDocument()
})

it('shows staged inspiration and saves an AI recommendation', async () => {
  fireEvent.click(screen.getByRole('button', { name: '获取岗位灵感' }))
  expect(screen.getByText('正在重新阅读你的经历档案')).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: '雇主品牌' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '加入岗位方向 雇主品牌' }))
})
```

- [ ] **Step 2: Run UI tests and verify fixed implementation fails**

Run: `node node_modules/vitest/vitest.mjs run tests/role-directions.test.tsx`

Expected: FAIL because dynamic controls do not exist.

- [ ] **Step 3: Implement store, persistent cards, statuses, feedback and inspiration dialog**

```ts
const stages = {
  'reading-profile': '正在重新阅读你的经历档案',
  'extracting-capabilities': '正在识别可迁移能力',
  generating: '正在生成新的岗位可能',
}
```

The dialog supports detail, save, exclude, next batch and more-like-this. Saving creates an `ai-recommended` direction with initial evidence analysis; exclusion writes feedback and removes the card.

- [ ] **Step 4: Run UI tests**

Run: `node node_modules/vitest/vitest.mjs run tests/role-directions.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add job-search-dashboard/src/pages/RoleDirectionsPage.tsx job-search-dashboard/src/components/career job-search-dashboard/src/stores/careerDirectionStore.ts job-search-dashboard/src/styles/global.css job-search-dashboard/tests/role-directions.test.tsx
git commit -m "feat: add dynamic career direction workspace"
```

### Task 5: Safe web content extraction for company sources

**Files:**
- Modify: `server/research/provider.ts`
- Create: `server/research/webContentService.ts`
- Modify: `server/research/researchService.ts`
- Modify: `server/interview.ts`
- Modify: `worker/index.js`
- Modify: `src/domain/interviewSchemas.ts`
- Test: `tests/web-content-service.test.ts`
- Test: `tests/research-provider.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Write failing extraction and partial-success tests**

```ts
it('extracts deduplicated body text and removes scripts, navigation and cookie text', async () => {
  const result = await fetchWebContent('https://example.com/culture', signal, fetchHtml)
  expect(result.content).toContain('长期主义')
  expect(result.content).not.toContain('Cookie')
  expect(result.contentStatus).toBe('full')
})

it('keeps successful pages when one fetch times out', async () => {
  const result = await enrichResearchDocuments([good, timeout], signal, fetcher)
  expect(result.documents[0].contentStatus).toBe('full')
  expect(result.documents[1].contentStatus).toBe('failed')
})
```

- [ ] **Step 2: Run tests and verify the extractor is missing**

Run: `node node_modules/vitest/vitest.mjs run tests/web-content-service.test.ts tests/research-provider.test.ts`

Expected: FAIL because `webContentService` does not exist.

- [ ] **Step 3: Implement public-URL validation, time/size limits and HTML cleaning**

```ts
export async function fetchWebContent(url: string, signal: AbortSignal, fetcher = fetch) {
  assertPublicHttpUrl(url)
  const response = await fetcher(url, {
    headers: { accept: 'text/html,text/plain;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  })
  const html = (await response.text()).slice(0, 500_000)
  return cleanResearchHtml(html, response.headers.get('content-type'))
}
```

Reject localhost, loopback, link-local and private IPv4/IPv6 hosts. Strip scripts, styles, navigation, footer, forms, cookie banners and duplicate paragraphs; retain a maximum of 16,000 relevant characters per source.

- [ ] **Step 4: Feed fetched source text into Qwen and preserve per-source status**

Server and Worker research results add `domain`, `publisher`, `contentStatus`, and optional `failureReason`. Only fetched or explicitly `snippet-only` content is passed to company analysis.

- [ ] **Step 5: Run extraction, provider and Worker tests**

Run: `node node_modules/vitest/vitest.mjs run tests/web-content-service.test.ts tests/research-provider.test.ts && node --test tests/sites-worker.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add job-search-dashboard/server/research job-search-dashboard/server/interview.ts job-search-dashboard/worker/index.js job-search-dashboard/src/domain/interviewSchemas.ts job-search-dashboard/tests
git commit -m "fix: fetch and clean company source pages"
```

### Task 6: Staged company analysis and triple-evidence interview questions

**Files:**
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `src/ai/interviewPrompts.ts`
- Modify: `src/ai/interviewParsers.ts`
- Modify: `server/interview.ts`
- Modify: `worker/index.js`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Modify: `src/components/interview/PredictedQuestionList.tsx`
- Modify: `src/components/interview/ResearchSourceDrawer.tsx`
- Test: `tests/interview-api.test.ts`
- Test: `tests/interview-research.test.tsx`

- [ ] **Step 1: Write failing triple-evidence and staged-state tests**

```ts
it('rejects a high-priority question without company, JD and resume bases', () => {
  expect(() => predictedQuestionSchema.parse({
    ...question,
    priority: 'high',
    companyBasis: undefined,
  })).toThrow()
})

it('shows fetched sources and distinct retry actions', async () => {
  expect(await screen.findByText('正在读取企业公开资料')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新搜索企业资料' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新读取网页' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests and verify schema/UI failures**

Run: `node node_modules/vitest/vitest.mjs run tests/interview-api.test.ts tests/interview-research.test.tsx`

Expected: FAIL because staged results and triple bases do not exist.

- [ ] **Step 3: Split model work into company analysis and interview preparation**

```ts
const predictedQuestionSchema = z.object({
  question: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  companyBasis: z.object({ summary: z.string(), sourceIds: z.array(idSchema) }).optional(),
  jdBasis: z.object({ requirement: z.string(), originalText: z.string().optional() }),
  resumeBasis: z.object({
    experienceId: idSchema,
    evidenceText: z.string().min(1),
    evidenceIds: z.array(idSchema).min(1),
  }),
  interviewerIntent: z.string().min(1),
  possibleFollowUps: z.array(z.string()).default([]),
})
```

The first model call only summarizes company sources with source IDs. The second receives that result, JD analysis and candidate evidence. Any high-priority question missing one basis is downgraded or rejected.

- [ ] **Step 4: Implement frontend stages, source metadata and retry actions**

Progress labels map to `validating-company`, `searching`, `fetching-pages`, `analyzing-company`, `matching-resume`, and `generating-questions`. Retry actions use stage-specific endpoints and preserve stored successful data.

- [ ] **Step 5: Run interview tests**

Run: `node node_modules/vitest/vitest.mjs run tests/interview-api.test.ts tests/interview-research.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add job-search-dashboard/src/domain/interviewSchemas.ts job-search-dashboard/src/ai job-search-dashboard/src/components/interview job-search-dashboard/server/interview.ts job-search-dashboard/worker/index.js job-search-dashboard/tests
git commit -m "feat: stage company research and ground interview questions"
```

### Task 7: Backup compatibility and documentation

**Files:**
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `src/db/backup.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Test: `tests/interview-backup.test.ts`

- [ ] **Step 1: Write a failing backup compatibility test**

```ts
it('imports v2 backups and defaults new career collections to empty', () => {
  const parsed = parseBackupV2(JSON.stringify(legacyV2))
  expect(parsed.careerDirections).toEqual([])
  expect(parsed.careerDirectionFeedback).toEqual([])
})
```

- [ ] **Step 2: Run the backup test and verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/interview-backup.test.ts`

Expected: FAIL because career collections are absent.

- [ ] **Step 3: Extend backup export/import and document the final chain**

Backups include directions, feedback and inspiration batches with empty defaults for older versions. README documents Qwen search URL discovery, safe page fetching, local Key storage, migration behavior, model costs and the absence of new required environment variables.

- [ ] **Step 4: Run the backup test**

Run: `node node_modules/vitest/vitest.mjs run tests/interview-backup.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add job-search-dashboard/src/domain/interviewSchemas.ts job-search-dashboard/src/db/backup.ts job-search-dashboard/README.md job-search-dashboard/.env.example job-search-dashboard/tests/interview-backup.test.ts
git commit -m "docs: document career and company research upgrade"
```

### Task 8: Full verification, browser QA and deployment

**Files:**
- Verify: all changed files
- Modify only if verification exposes a regression

- [ ] **Step 1: Run full automated verification**

```bash
node node_modules/vitest/vitest.mjs run
node --test tests/sites-worker.test.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/prepare-sites-build.mjs
git diff --check
```

Expected: all tests pass, typecheck exits 0, production build succeeds, and no whitespace errors.

- [ ] **Step 2: Perform browser interaction checks**

Verify:

- legacy four directions appear once and can be deleted;
- a custom direction can be added and marked primary;
- “获取岗位灵感” shows staged progress and saves a recommendation;
- enterprise research displays real source content status;
- high-priority questions display company, JD and resume bases;
- old JD records remain readable.

- [ ] **Step 3: Commit any verification-only fixes**

```bash
git add job-search-dashboard
git commit -m "fix: complete career and research verification"
```

- [ ] **Step 4: Push the exact subtree commit, save a Sites version and deploy**

Use the existing project ID from `.openai/hosting.json`. Push the exact `git subtree split --prefix=job-search-dashboard HEAD` SHA, save a new Sites version with that SHA, deploy the saved version, and poll to a terminal status.

