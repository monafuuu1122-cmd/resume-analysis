# Local Data Migration and Interaction Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify browser-local career data, recover compatible legacy records, calculate real preparation progress, guarantee career-inspiration termination, and restore complete company-target interactions.

**Architecture:** Add a focused `UserCareerRepository` over the existing Dexie tables and a versioned migration service for same-origin legacy data and cross-origin migration packages. Pages consume typed repository results rather than assembling storage reads. Career inspiration and company target interactions use explicit state machines with abort, retry, validation, and partial-success behavior.

**Tech Stack:** React 19, TypeScript, Dexie 4, Zustand 5, Zod 3, Express/Cloudflare Worker, Vitest, Testing Library, Playwright/Chrome browser control.

---

## File map

- Create `src/domain/localDataSchemas.ts`: migration metadata, recovery item, migration package and preparation types.
- Create `src/db/localDataMigration.ts`: fingerprinting, legacy parsing, idempotent same-origin migration, import/export.
- Create `src/db/userCareerRepository.ts`: all-settled aggregate reads and preparation selector input.
- Modify `src/db/database.ts`: add metadata, snapshots and recovery tables without rewriting existing stores.
- Replace `src/db/dashboardRepository.ts`: delegate to the unified repository.
- Modify `src/domain/dashboardProgress.ts`: produce detailed progress items and explicit source status.
- Modify `src/pages/DashboardPage.tsx`: render loading, empty, migration-required and read-failed distinctly.
- Modify `src/pages/ExperiencesPage.tsx`: run migration check and expose migration/recovery/import/export feedback.
- Create `src/hooks/useCareerInspiration.ts`: lifecycle, timeout, single-flight and temporary-result persistence handling.
- Modify `src/pages/RoleDirectionsPage.tsx`: use the hook and expose retry, partial and save-failed states.
- Modify `src/ai/client.ts`, `server/career.ts`, `worker/index.js`: abort-aware timeouts and parse/error codes.
- Modify `src/stores/jdStore.ts` and `src/pages/JdLabPage.tsx`: company-target state, URL validation, load errors and retry.
- Add focused unit, component and E2E tests under `tests/` and `e2e/`.

### Task 1: Versioned local data schemas and Dexie stores

**Files:**
- Create: `src/domain/localDataSchemas.ts`
- Modify: `src/db/database.ts`
- Test: `tests/local-data-schema.test.ts`

- [ ] **Step 1: Write the failing schema and upgrade tests**

Test parsing of `LocalDataMeta`, `MigrationRecoveryItem`, `MigrationPackage`, and verify a v5 database upgrades with existing experiences intact and new tables empty.

```ts
expect(localDataMetaSchema.parse({
  id: 'singleton',
  schemaVersion: 6,
  migrationHistory: [],
})).toMatchObject({ schemaVersion: 6 })
expect(await db.experiences.get('legacy-experience')).toBeDefined()
expect(await db.localDataMeta.toArray()).toEqual([])
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/local-data-schema.test.ts
```

Expected: FAIL because schemas and tables do not exist.

- [ ] **Step 3: Implement schemas and Dexie v6**

Define:

```ts
export const localDataMetaSchema = z.object({
  id: z.literal('singleton'),
  schemaVersion: z.number().int().nonnegative(),
  lastMigratedAt: z.string().datetime().optional(),
  migrationHistory: z.array(z.string()).default([]),
})
```

Add `migrationSnapshots` and `migrationRecoveryItems` schemas with stable IDs, source, payload, reason and timestamps. Add Dexie v6 stores without changing previous indices.

- [ ] **Step 4: Run the focused test and typecheck**

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/localDataSchemas.ts src/db/database.ts tests/local-data-schema.test.ts
git commit -m "feat: add local data migration metadata"
```

### Task 2: Idempotent migration, fingerprinting and migration packages

**Files:**
- Create: `src/db/localDataMigration.ts`
- Test: `tests/local-data-migration.test.ts`
- Modify: `src/db/backup.ts`
- Modify: `src/domain/interviewSchemas.ts`

- [ ] **Step 1: Write failing migration tests**

Cover three valid legacy experiences, one existing new experience, one duplicate, one damaged item and a repeated migration.

```ts
const first = await migrateLegacyPayload(legacyPayload)
expect(first).toMatchObject({ migrated: 2, duplicates: 1, recovery: 1 })
const second = await migrateLegacyPayload(legacyPayload)
expect(second.migrated).toBe(0)
expect(await db.experiences.count()).toBe(3)
```

Test that the fingerprint normalizes case, spacing and punctuation while including organization, role, project, dates and source summary. Test export/import round-trip without API keys.

- [ ] **Step 2: Run tests and verify RED**

Expected: missing migration module.

- [ ] **Step 3: Implement minimal migration service**

Expose:

```ts
export function experienceFingerprint(input: ExperienceFingerprintInput): string
export async function migrateLegacyPayload(value: unknown): Promise<MigrationResult>
export async function exportMigrationPackage(): Promise<MigrationPackage>
export async function importMigrationPackage(value: unknown): Promise<MigrationResult>
export async function migrateIfNeeded(): Promise<MigrationResult>
```

Use Zod per record, a Dexie transaction for valid records, and recovery rows for invalid records. Keep old payloads and write a pre-migration snapshot. Detect known same-origin keys and database structures without deleting them.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all migration tests pass; repeated import adds no duplicates.

- [ ] **Step 5: Commit**

```bash
git add src/db/localDataMigration.ts src/db/backup.ts src/domain/interviewSchemas.ts tests/local-data-migration.test.ts
git commit -m "feat: add safe local career data migration"
```

### Task 3: Unified repository and real preparation selector

**Files:**
- Create: `src/db/userCareerRepository.ts`
- Modify: `src/db/dashboardRepository.ts`
- Modify: `src/domain/dashboardProgress.ts`
- Test: `tests/user-career-repository.test.ts`
- Test: `tests/dashboard-progress.test.ts`

- [ ] **Step 1: Write failing aggregate and progress tests**

Verify complete data, no data, primary direction, analyzed JD, interview research, completed mock interview and one failed module.

```ts
const snapshot = await repository.getSnapshot()
expect(snapshot.moduleStatus.experiences).toBe('ready')
expect(snapshot.moduleStatus.interviews).toBe('failed')
expect(snapshot.experiences).toHaveLength(1)
```

Assert detailed progress items have `targetRoute` and `missingReason`, and one module failure does not erase other progress.

- [ ] **Step 2: Run tests and verify RED**

Expected: repository and new progress fields missing.

- [ ] **Step 3: Implement all-settled repository and selector**

The repository reads table groups independently and returns `moduleStatus`. `getPreparationProgress()` runs migration first and returns:

```ts
{
  overallPercent,
  items,
  sourceStatus: 'ready' | 'empty' | 'failed',
  migrationRequired,
  updatedAt,
}
```

Only all core business groups failing produces `failed`.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/db/userCareerRepository.ts src/db/dashboardRepository.ts src/domain/dashboardProgress.ts tests/user-career-repository.test.ts tests/dashboard-progress.test.ts
git commit -m "feat: unify career data and preparation progress"
```

### Task 4: Dashboard and experience migration UI

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/ExperiencesPage.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/dashboard.test.tsx`
- Test: `tests/experiences.test.tsx`

- [ ] **Step 1: Write failing component tests**

Assert exact states:

```text
正在读取你的准备数据
还没有准备记录，可以从经历档案开始补充。
检测到旧版本数据，正在迁移。
本地数据读取失败，请重试或查看恢复选项。
```

Test experience migration success, partial recovery, dismissed notice, recheck, JSON import and export entry points.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement UI using repository results**

Remove direct dashboard storage assembly. Reload on `visibilitychange` when returning to the page. Add a compact migration panel to Experiences and a permanent migration section in Settings if existing layout supports it.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/ExperiencesPage.tsx src/styles/global.css tests/dashboard.test.tsx tests/experiences.test.tsx
git commit -m "fix: recover dashboard and legacy experiences"
```

### Task 5: Career inspiration lifecycle and client errors

**Files:**
- Create: `src/hooks/useCareerInspiration.ts`
- Modify: `src/ai/client.ts`
- Modify: `src/domain/careerSchemas.ts`
- Modify: `src/pages/RoleDirectionsPage.tsx`
- Test: `tests/career-inspiration-hook.test.tsx`
- Test: `tests/role-directions.test.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

Use fake timers and deferred promises to verify:

- success passes through preparing, requesting, parsing, saving, completed;
- 60-second request enters request-timeout;
- repeated clicks call fetch once;
- invalid JSON enters parse-failed;
- empty directions never enter completed;
- save failure keeps directions visible and enters save-failed;
- retry creates one fresh request;
- every settled path clears `busy`.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement the hook and request cancellation**

Expose:

```ts
const {
  status, busy, result, error, debug,
  generate, retry, cancel, saveDirection,
} = useCareerInspiration({ snapshot, directions })
```

Use one AbortController, a 60-second timer and `finally`. `requestCareerInspiration` accepts `signal`. Development diagnostics contain only counts, model, timestamps, elapsed time, HTTP status, response length, parse and save status.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCareerInspiration.ts src/ai/client.ts src/domain/careerSchemas.ts src/pages/RoleDirectionsPage.tsx tests/career-inspiration-hook.test.tsx tests/role-directions.test.tsx
git commit -m "fix: guarantee career inspiration completion"
```

### Task 6: Server and Worker timeout/parse guarantees

**Files:**
- Modify: `server/career.ts`
- Modify: `worker/index.js`
- Modify: `src/ai/careerParsers.ts`
- Test: `tests/career-api.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Write failing API tests**

Cover upstream timeout, authentication rejection, Markdown JSON, first parse failure plus one repair, partial valid cards and empty output.

```ts
expect(response.status).toBe(504)
expect(response.body.code).toBe('request_timeout')
```

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement bounded calls**

Combine request abort with a server timeout. Normalize upstream errors into `request_timeout`, `model_failed`, `parse_failed` and `insufficient_profile`. Preserve valid cards when another card fails schema validation. Never return fabricated fallback cards.

- [ ] **Step 4: Run API and Worker tests**

- [ ] **Step 5: Commit**

```bash
git add server/career.ts worker/index.js src/ai/careerParsers.ts tests/career-api.test.ts tests/sites-worker.test.mjs
git commit -m "fix: bound career model requests"
```

### Task 7: Company target interaction state machine

**Files:**
- Modify: `src/stores/jdStore.ts`
- Modify: `src/pages/JdLabPage.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/jd-store.test.ts`
- Test: `tests/jd-lab.test.tsx`

- [ ] **Step 1: Write failing state and interaction tests**

Test editable inputs, empty name, invalid website, validating, confirmed, load failure, retry, selection, change company, bind JD and post-research states. Verify only the active operation is disabled and every button has explicit type.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement state machine**

Add `companyTargetState`, `companyTargetError`, `loadCompanyTargets`, `retryCompanyTargets`, `cancelCompanyResearch` and guarded actions. Validate URL before saving. Catch the initial load Promise in the page and show actionable errors.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/stores/jdStore.ts src/pages/JdLabPage.tsx src/styles/global.css tests/jd-store.test.ts tests/jd-lab.test.tsx
git commit -m "fix: restore company target interactions"
```

### Task 8: E2E fixtures, full verification and Chrome acceptance

**Files:**
- Create: `e2e/local-data-repair.spec.ts`
- Create: `e2e/fixtures/legacy-career-data.json`
- Modify: `README.md`

- [ ] **Step 1: Add a synthetic browser fixture**

The fixture contains three legacy experiences, one new experience, one duplicate, two directions, one JD analysis, one company target and enough confirmed evidence for career inspiration. It contains no user data or API key.

- [ ] **Step 2: Add E2E flows**

Automate:

- dashboard ready/empty/refresh;
- migration, deduplication, persistence and recovery;
- inspiration success and failure/retry with intercepted API;
- company target input, confirmation, retry, keyboard operation and narrow viewport.

- [ ] **Step 3: Run full checks**

```bash
node node_modules/vitest/vitest.mjs run
node --test tests/sites-worker.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test e2e/local-data-repair.spec.ts
git diff --check
```

Expected: all tests pass, build completes, no diff whitespace errors.

- [ ] **Step 4: Perform real Chrome acceptance**

Start the local app and complete the requirement checklist with synthetic data. Capture screenshots for dashboard full/detail/refresh, migration prompt/list/result, inspiration loading/result/detail/error-retry and company target initial/editing/confirmed/research/error states. Check console errors, failed network loops, desktop and narrow viewport.

- [ ] **Step 5: Document measured results**

Record actual Qwen model, success, duration, valid direction count, schema result, and any external configuration needed. Do not record the Key or full profile.

- [ ] **Step 6: Commit**

```bash
git add e2e README.md
git commit -m "test: verify local data recovery flows"
```

## Completion gate

Do not deploy automatically. Deliver the local browser URL, test totals, Chrome acceptance evidence and any unrecoverable-data finding. Deploy to the existing production URL only after the user reviews the local version.
