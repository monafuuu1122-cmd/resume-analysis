# DeepSeek Migration and Offline Role Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every runtime Qwen dependency with DeepSeek and make role/company analysis rely on model knowledge without web search while preserving personalized, evidence-bound outputs.

**Architecture:** Introduce one DeepSeek-compatible server gateway and route every AI task through it. Keep existing domain records backward compatible, but mark new research as model knowledge and remove search calls from role/company analysis. Frontend settings and errors use DeepSeek terminology and store credentials under new keys.

**Tech Stack:** React 19, TypeScript, Vite, Express, Cloudflare Worker-compatible ESM, Zod, Dexie, Vitest.

---

### Task 1: DeepSeek server gateway

**Files:**
- Create: `server/deepseek.ts`
- Create: `server/requestDeepSeek.ts`
- Modify: `server/index.ts`
- Modify: `server/career.ts`
- Modify: `server/interview.ts`
- Modify: `server/careerDirectionAnalysis.ts`
- Test: `tests/deepseek-proxy.test.ts`
- Test: `tests/interview-api.test.ts`
- Test: `tests/career-api.test.ts`

- [ ] **Step 1: Write failing gateway tests**

Assert that requests use `https://api.deepseek.com/chat/completions`, `deepseek-v4-flash`, `response_format: { type: "json_object" }`, and translate 401/429/timeout/invalid JSON into DeepSeek-specific errors.

- [ ] **Step 2: Run the focused tests**

Run: `node node_modules/vitest/vitest.mjs run tests/deepseek-proxy.test.ts tests/interview-api.test.ts tests/career-api.test.ts`

Expected: FAIL because the DeepSeek gateway and request config do not exist.

- [ ] **Step 3: Implement the gateway**

Provide this public boundary:

```ts
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'

export async function callDeepSeekForSchema<T>(
  apiKey: string,
  model: string,
  instruction: string,
  input: unknown,
  schema: z.ZodType<T>,
  fetchImplementation: typeof fetch,
  timeoutMs?: number,
): Promise<T>
```

The request must set `response_format: { type: 'json_object' }`; prompts must contain the word JSON; API keys come from `request.body.clientDeepSeek.apiKey` or `DEEPSEEK_API_KEY` only.

- [ ] **Step 4: Update Express routes and run tests**

Expected: all focused tests pass and no Express route imports `server/qwen.ts` or reads `QWEN_API_KEY`.

- [ ] **Step 5: Commit**

```bash
git add server tests/deepseek-proxy.test.ts tests/interview-api.test.ts tests/career-api.test.ts
git commit -m "refactor: migrate server AI gateway to DeepSeek"
```

### Task 2: Production Worker DeepSeek migration

**Files:**
- Modify: `worker/index.js`
- Modify: `.env.example`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Change Worker contract tests**

Use `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, and `DEEPSEEK_TIMEOUT_*_MS`; expect provider `deepseek`, errors such as `DEEPSEEK_TIMEOUT`, and upstream URL `https://api.deepseek.com/chat/completions`.

- [ ] **Step 2: Run Worker tests and confirm failure**

Run: `node --test tests/sites-worker.test.mjs`

Expected: FAIL because the Worker still reads Qwen configuration and DashScope URLs.

- [ ] **Step 3: Replace the unified Worker gateway**

Rename the runtime boundary to `deepSeekConfig`, `deepSeekTimeout`, `callDeepSeek`, and `deepSeek`. Preserve AbortController cancellation, per-task timeouts, structured error responses, and no-key logging. Remove company/role calls to Qwen web search.

- [ ] **Step 4: Run Worker tests**

Expected: all tests pass and `rg "dashscope|QWEN_API_KEY" worker/index.js` returns no matches.

- [ ] **Step 5: Commit**

```bash
git add worker/index.js .env.example tests/sites-worker.test.mjs
git commit -m "refactor: migrate production Worker to DeepSeek"
```

### Task 3: Browser settings and AI client migration

**Files:**
- Modify: `src/ai/client.ts`
- Modify: `src/ai/safeOutput.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/domain/dashboardProgress.ts`
- Modify: `src/pages/ExperiencesPage.tsx`
- Modify: `src/hooks/useCareerInspiration.ts`
- Modify: `src/stores/interviewStore.ts`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Test: `tests/ai-client.test.ts`
- Test: `tests/settings.test.tsx`
- Test: `tests/dashboard.test.tsx`

- [ ] **Step 1: Update frontend tests**

Expect storage keys `offer-adventure:deepseek-api-key` and `offer-adventure:deepseek-model`, default model `deepseek-v4-flash`, request field `clientDeepSeek`, provider `deepseek`, and DeepSeek-specific user messages. Assert that the old Qwen key is not transmitted.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run tests/ai-client.test.ts tests/settings.test.tsx tests/dashboard.test.tsx`

- [ ] **Step 3: Implement frontend migration**

Expose:

```ts
export const DEEPSEEK_API_KEY_STORAGE_KEY = 'offer-adventure:deepseek-api-key'
export const DEEPSEEK_MODEL_STORAGE_KEY = 'offer-adventure:deepseek-model'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
export function aiRequestBody(payload: Record<string, unknown>): string
```

Rename visible settings, progress and errors to DeepSeek. Clearing the DeepSeek key must not alter user records; old Qwen storage keys remain ignored.

- [ ] **Step 4: Run frontend tests**

Expected: focused tests pass and no visible UI copy says 千问.

- [ ] **Step 5: Commit**

```bash
git add src tests/ai-client.test.ts tests/settings.test.tsx tests/dashboard.test.tsx
git commit -m "feat: replace browser AI settings with DeepSeek"
```

### Task 4: Non-network role analysis with short evidence

**Files:**
- Modify: `server/careerDirectionAnalysis.ts`
- Modify: `src/ai/careerDirectionPrompts.ts`
- Modify: `src/ai/careerDirectionParsers.ts`
- Modify: `src/domain/careerSchemas.ts`
- Modify: `src/pages/RoleDirectionsPage.tsx`
- Modify: `worker/index.js`
- Test: `tests/career-direction-api.test.ts`
- Test: `tests/career-direction-analysis.test.ts`
- Test: `tests/role-directions.test.tsx`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Add failing behavior tests**

Assert that role analysis performs exactly one DeepSeek completion and zero search requests; returns `knowledgeMode: "model-knowledge"`; renders no source list or “联网” copy; and displays 3–4 excerpts of at most 90 Chinese characters per requirement.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run tests/career-direction-api.test.ts tests/career-direction-analysis.test.ts tests/role-directions.test.tsx`

- [ ] **Step 3: Implement one-call analysis**

Remove search-provider construction and source normalization. Ask DeepSeek for common requirements, but map evidence only from supplied evidence IDs. Parser truncates excerpts to 90 characters and caps them at four; it never accepts model-authored evidence text that is not a substring of an input evidence unit.

- [ ] **Step 4: Update UI and verify**

Use “岗位要求与经历对照”, “生成岗位分析”, and “正在整理岗位要求并对照经历”. Remove source UI and long fallback evidence blocks. Focused tests and Worker tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/careerDirectionAnalysis.ts src/ai/careerDirection* src/domain/careerSchemas.ts src/pages/RoleDirectionsPage.tsx worker/index.js tests
git commit -m "feat: generate offline role evidence comparisons"
```

### Task 5: Model-knowledge enterprise research

**Files:**
- Modify: `server/interview.ts`
- Modify: `src/ai/interviewPrompts.ts`
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Modify: `src/components/interview/CompanyCultureSection.tsx`
- Modify: `worker/index.js`
- Test: `tests/interview-api.test.ts`
- Test: `tests/interview-research.test.tsx`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Add failing research tests**

Assert zero research-provider calls, empty sources, `knowledgeMode: "model-knowledge"`, visible “基于模型已有知识，非实时联网结果”, and explicit “现有知识不足” output when the model lacks support.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run tests/interview-api.test.ts tests/interview-research.test.tsx`

- [ ] **Step 3: Replace the research pipeline**

Generate company knowledge and role analysis directly from company identity, JD and confirmed profile evidence. Do not create URLs, official labels or publication dates. Accept only `model-knowledge` and `inference` insight labels; insufficient fields remain empty with a clear notice.

- [ ] **Step 4: Update research UI and verify**

Remove source drawer, web-loading states and “只重新进行企业研究”. Preserve existing JD analysis and old-record opening behavior. Focused and Worker tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/interview.ts src/ai/interviewPrompts.ts src/domain/interviewSchemas.ts src/components/interview worker/index.js tests
git commit -m "feat: use model knowledge for enterprise research"
```

### Task 6: Documentation, migration check and release validation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Test: all test suites

- [ ] **Step 1: Update documentation**

Document DeepSeek configuration, non-network role/company knowledge limits, browser key privacy, timeout settings and old-record compatibility. Remove instructions requiring Qwen or Tavily.

- [ ] **Step 2: Run secret and legacy scans**

Run: `rg "sk-[A-Za-z0-9]" . --glob '!node_modules/**' --glob '!dist/**'`

Expected: no real API key.

Run: `rg "dashscope|QWEN_API_KEY|TAVILY_API_KEY|正在联网分析" README.md .env.example server src worker`

Expected: no runtime or visible-copy matches; historical compatibility comments may be explicitly reviewed.

- [ ] **Step 3: Run complete verification**

Run: `node node_modules/vitest/vitest.mjs run`

Run: `node --test tests/sites-worker.test.mjs`

Run: `node node_modules/typescript/bin/tsc -b --pretty false`

Run: `node node_modules/vite/bin/vite.js build`

Expected: all tests and builds pass.

- [ ] **Step 4: Local Chrome acceptance**

Verify settings, experience extraction, role analysis, JD analysis, enterprise research, answer coaching and mock interview with a browser-local DeepSeek key. Confirm no long evidence blocks, no source links in model-knowledge research, and no console errors.

- [ ] **Step 5: Commit the validated release candidate**

```bash
git add README.md .env.example server src worker tests
git commit -m "docs: complete DeepSeek migration"
```

