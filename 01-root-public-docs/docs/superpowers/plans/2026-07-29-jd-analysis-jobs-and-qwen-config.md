# JD Analysis Jobs and Qwen Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every JD analysis independently archived and race-safe, version company research, and move all Qwen authentication into the production Worker.

**Architecture:** IndexedDB remains the source of truth for user data. A new analysis-job table records durable stage state, while immutable snapshots and hashes prevent stale writes. The Worker becomes the only Qwen credential owner and exposes one minimal health endpoint used before expensive generation retries.

**Tech Stack:** React 19, Zustand, Dexie, Zod, Cloudflare-style Worker Web APIs, Vitest, Node test runner, Playwright.

---

### Task 1: Server-only Qwen configuration and health

**Files:**
- Modify: `worker/index.js`
- Modify: `src/ai/client.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `.env.example`
- Test: `tests/sites-worker.test.mjs`
- Test: `tests/ai-client.test.ts`
- Test: `tests/settings.test.tsx`

- [ ] Add failing Worker tests proving requests use `env.QWEN_API_KEY`, ignore `x-dashscope-key`, return `QWEN_NOT_CONFIGURED` when absent, and expose a secret-free `/api/ai/health`.
- [ ] Run `node --test tests/sites-worker.test.mjs`; expect the new tests to fail because the Worker still reads the browser header.
- [ ] Add centralized configuration:

```js
function qwenConfig(env) {
  const apiKey = text(env.QWEN_API_KEY)
  const model = text(env.QWEN_MODEL, 'qwen-plus')
  return {
    apiKey,
    model,
    configured: Boolean(apiKey && MODEL_PATTERN.test(model)),
  }
}
```

- [ ] Make `callQwen` use the resolved server configuration and map upstream 401/403, 404, 429, timeout, network and invalid JSON to the agreed `QWEN_*` codes.
- [ ] Implement `GET /api/ai/health` with a minimal no-user-data model request and `{ provider, configured, reachable, authenticated, modelAvailable, latencyMs?, errorCode? }`.
- [ ] Remove API-key parameters, localStorage access and `x-dashscope-key` from frontend clients; keep only same-origin API calls and optional model-free payloads.
- [ ] Replace Settings Key form with service status, “重新检测” and deployment configuration guidance; remove the legacy localStorage key without reading or transmitting it.
- [ ] Run focused Worker and frontend tests; expect all to pass.
- [ ] Commit: `fix: move qwen authentication to worker`.

### Task 2: Immutable analysis records and durable jobs

**Files:**
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/db/database.ts`
- Create: `src/db/analysisJobRepository.ts`
- Create: `src/domain/analysisJobs.ts`
- Modify: `src/db/backup.ts`
- Test: `tests/jd-store.test.ts`
- Create: `tests/analysis-jobs.test.ts`
- Modify: `tests/interview-backup.test.ts`

- [ ] Add failing tests for two identical submissions producing different IDs, immutable snapshots, job binding, terminal timeout, and old backups importing without new fields.
- [ ] Run the focused tests; expect failures for missing schemas/table/repository.
- [ ] Add schemas equivalent to:

```ts
const analysisStageSchema = z.enum([
  'jd-analysis',
  'company-research',
  'resume-match',
  'interview-preparation',
])

const analysisJobSchema = z.object({
  id: z.string().min(1),
  analysisId: z.string().min(1),
  inputHash: z.string().min(1),
  status: z.enum([
    'queued', 'running', 'partial', 'completed',
    'failed', 'timeout', 'cancelled',
  ]),
  currentStage: analysisStageSchema,
  attempt: z.number().int().positive(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
})
```

- [ ] Extend `JdRecord` with optional compatibility fields for snapshot, hashes, created/completed timestamps, parent ID, active job and current research/preparation pointers.
- [ ] Add Dexie version 7 with `analysisJobs: 'id, analysisId, status, currentStage, updatedAt'`.
- [ ] Implement create/get/list/update functions that always address jobs by ID and validate analysis ownership before writes.
- [ ] Include jobs and extended records in backup/export/import while preserving version-1/2 imports.
- [ ] Run focused tests; expect all to pass.
- [ ] Commit: `feat: add durable JD analysis jobs`.

### Task 3: Always create a new archived analysis

**Files:**
- Modify: `src/stores/jdStore.ts`
- Modify: `src/db/jdRepository.ts`
- Modify: `src/pages/JdLabPage.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/jd-store.test.ts`
- Test: `tests/jd-lab.test.tsx`

- [ ] Add failing UI/store tests proving selected history is never overwritten, same input creates another record, old analysis remains openable, delete targets one ID, and reanalyze records `parentAnalysisId`.
- [ ] Run focused tests and confirm overwrite assertions fail with the current `draft.id` behavior.
- [ ] Remove `id` from editable draft identity. Add `createAnalysisFromDraft()` that always generates new analysisId/jobId before calling AI and persists:

```ts
{
  id: analysisId,
  activeJobId: jobId,
  inputSnapshot,
  inputHash,
  status: 'analyzing-jd',
  analysisStatus: 'analyzing',
  createdAt: now,
  updatedAt: now,
}
```

- [ ] On success, write only when the stored record still has the same `activeJobId` and `inputHash`; on timeout/failure save the exact terminal state without deleting the record.
- [ ] Keep history selection read-only; “复制为新分析” copies its snapshot into a clean draft, while “重新分析” creates a child record immediately.
- [ ] Add explicit delete with confirmation and repository cascade for only that analysis ID.
- [ ] Render creation time, status, JD excerpt, research time and actions in history.
- [ ] Run focused tests; expect all to pass.
- [ ] Commit: `fix: archive every JD analysis independently`.

### Task 4: Stage progress, timeout and partial delivery

**Files:**
- Create: `src/components/jd/AnalysisProgress.tsx`
- Create: `src/domain/analysisProgress.ts`
- Modify: `src/pages/JdLabPage.tsx`
- Modify: `src/stores/jdStore.ts`
- Test: `tests/jd-lab.test.tsx`
- Create: `tests/analysis-progress.test.ts`

- [ ] Add failing tests for queued/running/completed/failed/timeout display, JD partial-result retention and stale result rejection.
- [ ] Run focused tests; expect failures because no durable progress exists.
- [ ] Derive four visible stages from the stored job and record, using the labels “正在解析 JD / 正在研究企业公开资料 / 正在匹配你的简历经历 / 正在生成面试准备”.
- [ ] Persist every stage transition before its request; map Worker codes to stage-specific timeout/auth/format errors.
- [ ] Keep JD analysis and resume match data when later research/preparation fails; expose only the relevant retry action.
- [ ] Abort the current browser request on cancel and persist `cancelled`; never continue work through `waitUntil`.
- [ ] Run focused tests; expect all to pass.
- [ ] Commit: `feat: show durable JD analysis progress`.

### Task 5: Version and isolate company research

**Files:**
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `src/db/interviewRepository.ts`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Modify: `src/stores/interviewStore.ts`
- Modify: `worker/index.js`
- Test: `tests/interview-research.test.tsx`
- Test: `tests/interview-context.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] Add failing tests proving each update creates a new research ID, switching records clears the old visible research, delayed A cannot replace B, and mock interview loads the current research pointer.
- [ ] Run focused tests; expect failures from unguarded component state and newest-by-analysis lookup.
- [ ] Add `jobId`, `companyName`, `companyIdentityHash`, `jdHash` and `researchContextHash` to generated research.
- [ ] Make research lookup prefer `JdRecord.companyResearchId`; legacy records fall back to newest compatible analysis research.
- [ ] At request start create a new version ID and set updating state without marking the previous version current.
- [ ] Before saving or displaying, verify record ID, job ID and hashes. On success update the JD record pointer transactionally; on stale completion archive the version without selecting it.
- [ ] Reset panel state on `record.id + companyResearchId`; abort in-flight fetch on record switch.
- [ ] Make interview store context include `companyResearchId`; when the pointer changes, ignore incomplete sessions created from the older context.
- [ ] Run focused tests; expect all to pass.
- [ ] Commit: `fix: version and isolate company research`.

### Task 6: Health-gated career inspiration and common AI errors

**Files:**
- Modify: `src/hooks/useCareerInspiration.ts`
- Modify: `src/pages/RoleDirectionsPage.tsx`
- Modify: `src/ai/client.ts`
- Test: `tests/career-inspiration-hook.test.tsx`
- Test: `tests/role-directions.test.tsx`

- [ ] Add failing tests for `checking-ai-service`, auth-failed short circuit, no duplicate generation, timeout, successful retry after health and preserved prior result.
- [ ] Run focused tests; expect failures because retry currently calls the full request immediately.
- [ ] Add `requestAiHealth(signal)` and lifecycle states:

```ts
type CareerInspirationLifecycle =
  | 'idle' | 'checking-ai-service' | 'reading-profile' | 'generating'
  | 'completed' | 'auth-failed' | 'timeout'
  | 'model-failed' | 'parse-failed' | 'cancelled'
```

- [ ] Check health before the full generation; when health is not authenticated/model-available, surface the deployed-product message and do not call `/api/career-inspiration`.
- [ ] Keep a single active Promise and always clear busy state in `finally`.
- [ ] Render “重新检测” and “查看配置说明”; retain the previous successful inspiration result during a failed refresh.
- [ ] Run focused tests; expect all to pass.
- [ ] Commit: `fix: gate AI retries on service health`.

### Task 7: Production configuration, verification and deployment

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Test: full suite and browser E2E

- [ ] Document only `QWEN_API_KEY`, `QWEN_MODEL`, timeouts and health semantics; remove instructions telling users to save browser keys.
- [ ] Run Worker tests, all Vitest tests, TypeScript build, Vite production build and `git diff --check`.
- [ ] Configure Sites `QWEN_API_KEY` as secret and `QWEN_MODEL=qwen-plus`; deploy a saved version after environment revision.
- [ ] Call production `/api/ai/health` and require configured/authenticated/modelAvailable to all be true before feature E2E.
- [ ] In the authenticated browser, verify two independent JD histories, refresh persistence, same-company different-role records, company-research refresh isolation, career inspiration, answer optimization and mock-interview start.
- [ ] Capture browser screenshots to a temporary verification directory and report their paths without committing private data.
- [ ] Push the exact verified source state, save a Sites version and deploy it to the existing project URL.
- [ ] Report health latency, generated direction count, analysisId/jobId pairs, tests, build and any remaining limitations.
