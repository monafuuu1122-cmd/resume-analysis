# Research, Career Analysis and Output Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interview research resilient, add sourced market-requirement mapping to each career direction, and prevent internal evidence identifiers or validation details from appearing in user-visible text.

**Architecture:** Add pure normalization functions at AI boundaries, then validate normalized data with the existing strict schemas. Add one direction-analysis API that reuses the existing Qwen search provider and unified Qwen client, store its versioned result inside the existing career-direction record, and render compact requirement-by-requirement mappings. Apply a final display sanitizer only to legacy/generated prose while retaining internal IDs in structured fields.

**Tech Stack:** React 19, TypeScript, Zod, Dexie, Express, Cloudflare Sites Worker, Qwen/DashScope search, Vitest, Testing Library.

---

### Task 1: Normalize interview research before strict validation

**Files:**
- Create: `src/domain/interviewResearchNormalization.ts`
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `server/interview.ts`
- Modify: `worker/index.js`
- Test: `tests/interview-research-normalization.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Write failing normalization tests**

Cover an `official` insight that references only `industry_media`, unknown source and claim IDs, and a `match` competency without candidate evidence. Expect a public downgrade, filtered IDs and `unknown` assessment with `partial: true`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/interview-research-normalization.test.ts tests/sites-worker.test.mjs`

Expected: FAIL because `normalizeInterviewResearchGeneration` does not exist and the Worker still allows unsafe boundary data.

- [ ] **Step 3: Implement the pure normalizer**

Define:

```ts
normalizeInterviewResearchGeneration(input, sources, claimIds): {
  value: InterviewResearchGeneration
  partial: boolean
}
```

Filter unknown references, downgrade unsupported official labels, and change unsupported `match` assessments to `unknown`. Do not synthesize facts or IDs.

- [ ] **Step 4: Use normalization in Express and Worker paths**

Normalize immediately after Qwen returns and before `interviewResearchSchema.parse`. If normalization changes any item, preserve the result and set `researchStatus: 'partial'`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/interview-research-normalization.test.ts && npm run test:sites`

Expected: PASS.

### Task 2: Return safe user-facing AI errors

**Files:**
- Create: `src/ai/safeOutput.ts`
- Modify: `src/ai/client.ts`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Test: `tests/safe-output.test.ts`
- Test: `tests/interview-research.test.tsx`

- [ ] **Step 1: Write failing error and prose sanitization tests**

Expect a Zod issue array to become `面试研究返回内容不完整，请重新生成。` and visible prose containing `(claim-4)` or `(profile-material-abc)` to omit those identifiers while retaining normal text such as `AI（人工智能）`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/safe-output.test.ts tests/interview-research.test.tsx`

Expected: FAIL because technical details are currently passed through.

- [ ] **Step 3: Implement safe boundary helpers**

Add:

```ts
safeAIErrorMessage(body, fallback)
sanitizeVisibleAIText(text)
```

Map known AI codes to Chinese actions, suppress arrays/objects/stack-like messages, and remove only recognized internal ID patterns.

- [ ] **Step 4: Apply helpers at client and interview UI boundaries**

Ensure `serviceError` never exposes raw objects or schema issues. Sanitize generated prose at render time so old saved records also display cleanly.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/safe-output.test.ts tests/interview-research.test.tsx`

Expected: PASS.

### Task 3: Add sourced market-role analysis

**Files:**
- Modify: `src/domain/careerSchemas.ts`
- Modify: `src/domain/schemas.ts`
- Create: `src/ai/careerDirectionPrompts.ts`
- Create: `server/careerDirectionAnalysis.ts`
- Modify: `server/index.ts`
- Modify: `worker/index.js`
- Modify: `src/ai/client.ts`
- Test: `tests/career-direction-analysis.test.ts`
- Test: `tests/sites-worker.test.mjs`

- [ ] **Step 1: Write failing schema and API tests**

Define a response with 6 market requirements, source links, evidence excerpts, match reasons, status, preparation advice, capability gaps and mindset gaps. Verify every evidence ID belongs to the supplied profile and every source URL comes from search results.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/career-direction-analysis.test.ts && npm run test:sites`

Expected: FAIL because the schema and `/api/career-direction-analysis` route do not exist.

- [ ] **Step 3: Implement schemas and prompt**

Add `careerDirectionMarketAnalysisSchema` with `requirements`, `capabilityGaps`, `mindsetGaps`, `sources`, `status`, `generatedAt` and a context hash. Prompt rules require short evidence excerpts, explicit reasons, no analysis process, and no visible internal IDs.

- [ ] **Step 4: Implement Express and Worker handlers**

Search several mainstream recruitment queries using Qwen search, deduplicate sources, call the unified Qwen schema client once, filter unknown evidence/source IDs, and return partial results when some sources fail. Reuse the existing timeout and cancellation paths.

- [ ] **Step 5: Add the browser API client**

Implement `requestCareerDirectionAnalysis(payload, signal)` using `qwenRequestBody`, safe error mapping and request cancellation.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- tests/career-direction-analysis.test.ts && npm run test:sites`

Expected: PASS.

### Task 4: Store and render requirement-by-requirement analysis

**Files:**
- Modify: `src/db/careerDirectionRepository.ts`
- Modify: `src/pages/RoleDirectionsPage.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/role-directions.test.tsx`
- Test: `tests/career-direction-repository.test.ts`

- [ ] **Step 1: Write failing repository and UI tests**

Verify old directions remain readable without market analysis, a successful new result is saved, failed regeneration preserves the old result, and expanded UI shows requirement, excerpt, reason, status, capability gaps, mindset gaps and source links without large raw experience blocks.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/role-directions.test.tsx tests/career-direction-repository.test.ts`

Expected: FAIL because the generation action and structured UI do not exist.

- [ ] **Step 3: Implement repository update**

Add an atomic `saveCareerDirectionMarketAnalysis(directionId, analysis)` update that changes only the market analysis and `updatedAt` after a successful parse.

- [ ] **Step 4: Implement focused responsive UI**

Add `生成新版岗位分析`/`重新生成` with loading, cancel, error and retry states. Render compact cards for each requirement and separate capability/mindset gap lists plus a source disclosure area.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/role-directions.test.tsx tests/career-direction-repository.test.ts`

Expected: PASS.

### Task 5: Complete prompt cleanup, compatibility and local acceptance build

**Files:**
- Modify: `src/ai/careerPrompts.ts`
- Modify: `src/ai/interviewPrompts.ts`
- Modify: `worker/index.js`
- Modify: `README.md`
- Test: relevant existing suites

- [ ] **Step 1: Add prompt regression assertions**

Assert prompts prohibit internal IDs in prose, hidden reasoning, evidence dumps and unsupported market claims while still requiring structured ID arrays.

- [ ] **Step 2: Run regression assertions and verify RED**

Run the prompt and Worker focused suites; expect the new wording assertions to fail.

- [ ] **Step 3: Update prompts and documentation**

Keep IDs only in structured JSON fields. Require final-result prose, concise excerpts and sourced market requirements. Document local acceptance and the fact that production remains unchanged until approval.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm run test:sites
npm run build
```

Expected: all tests and TypeScript/build checks pass.

- [ ] **Step 5: Start the local full-fidelity acceptance server**

Run `npm run dev` with the existing local browser-stored Qwen configuration, open the local URL in Chrome, and verify interview research, role analysis, clean prose, persistence and retry behavior. Do not invoke Sites deployment tools.
