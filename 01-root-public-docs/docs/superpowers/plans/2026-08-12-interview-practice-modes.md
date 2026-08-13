# JD 面试练习与双模式模拟面试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-shot question practice and independent HR/business mock interviews while preserving existing research, session, voice fallback, local persistence, and old records.

**Architecture:** Extend the existing interview domain schemas, Express handlers, DeepSeek prompt/parser path, Zustand store, and React route. Add a focused question-practice result model and endpoint; add an interview type to sessions and route start/turn prompts by type. Reuse existing speech components and Dexie persistence instead of adding a second state system.

**Tech Stack:** React, TypeScript, React Router, Zustand, Dexie, Express, Zod, Vitest, Testing Library, unified DeepSeek/Qwen proxy.

---

### Task 1: Extend interview domain models with compatibility defaults

**Files:**
- Modify: `src/domain/interviewSchemas.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/localDataSchemas.ts`
- Modify: `src/db/database.ts` only if a new table is required; prefer the existing `answerOptimizations` table for practice records.
- Test: `tests/interview-schemas.test.ts`, `tests/interview-backup.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add cases asserting that a new session parses `interviewType: 'hr' | 'business'`, a turn accepts optional `questionType`, `focusDimension`, and `followUpReason`, and an old session without `interviewType` is normalized to a safe default through the existing compatibility parser rather than rejected.

- [ ] **Step 2: Run focused tests**

Run `npm test -- --run tests/interview-schemas.test.ts tests/interview-backup.test.ts`.
Expected: new assertions fail before the schema changes.

- [ ] **Step 3: Implement minimal schemas**

Add `interviewType` with a compatibility default of `'business'` for old stored sessions, add the three optional turn fields, and define `questionPracticeSchema` plus its type. Extend backup/local schemas with a defaulted `questionPractices` array only if the existing backup contract cannot store practice results in `answerOptimizations`.

- [ ] **Step 4: Run focused tests**

Run the same command; expected: PASS and existing backup cases remain green.

- [ ] **Step 5: Commit**

Run `git add src/domain src/db/database.ts tests/interview-schemas.test.ts tests/interview-backup.test.ts && git commit -m "feat: model interview types and question practice"`.

### Task 2: Add question-practice generation contract and handler

**Files:**
- Modify: `src/ai/interviewPrompts.ts`
- Modify: `src/ai/interviewParsers.ts`
- Modify: `server/interview.ts`
- Modify: `server/index.ts`
- Test: `tests/interview-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Test `POST /api/mock-interview/question-practice` with a confirmed claim and assert the handler sends the question, answer, JD, research, and profile context to the model and returns a validated result containing coverage, evidence assessment, role relevance, risks, improvements, follow-ups, and valid evidence claim IDs. Add a test that an unknown evidence ID returns a structured validation error.

- [ ] **Step 2: Run focused tests**

Run `npm test -- --run tests/interview-api.test.ts`; expected: the new endpoint tests fail because the route and schema do not exist.

- [ ] **Step 3: Implement prompt/parser/schema**

Add a concise prompt that requests final feedback only, forbids invented facts and hidden IDs in visible text, and keeps the result to one practice attempt. Add a Zod generation schema with the fields from the design and claim-ID refinement.

- [ ] **Step 4: Implement handler and route**

Add `questionPracticeInputSchema`, use `requestController`, `abortableFetch`, `callQwenForSchema`, and `resolveQwenTimeout('answerOptimization')` (or a dedicated short practice timeout if the centralized timeout map supports it). Return a generated record with ID/timestamps and register `POST /api/mock-interview/question-practice` before the session routes.

- [ ] **Step 5: Run focused tests**

Run `npm test -- --run tests/interview-api.test.ts`; expected: PASS.

- [ ] **Step 6: Commit**

Run `git add src/ai server tests/interview-api.test.ts && git commit -m "feat: add single question interview practice API"`.

### Task 3: Add local repository/store support for single-question practice

**Files:**
- Modify: `src/db/interviewRepository.ts`
- Modify: `src/stores/interviewStore.ts`
- Modify: `src/domain/interviewSchemas.ts` only if Task 1 did not include persistence shape.
- Test: `tests/interview-store.test.ts` (create if absent)

- [ ] **Step 1: Write failing store tests**

Assert `practiceQuestion(question, answer, inputMode)` posts the current context, saves the returned result locally, exposes it in state, and keeps the submitted answer/error available when the request fails.

- [ ] **Step 2: Run focused tests**

Run `npm test -- --run tests/interview-store.test.ts`; expected: FAIL because the action and repository method are missing.

- [ ] **Step 3: Implement repository and store action**

Add a repository save/list method using the chosen existing or new Dexie collection. Add `questionPractice` and `resetQuestionPractice` actions, guard duplicate submissions with `submitting`, reuse `contextPayload`, and map server errors through the existing `serviceError` path.

- [ ] **Step 4: Run focused tests**

Run the same command; expected: PASS.

- [ ] **Step 5: Commit**

Run `git add src/db src/stores tests/interview-store.test.ts && git commit -m "feat: persist question practice results"`.

### Task 4: Build single-question practice UI and entry link

**Files:**
- Create: `src/components/interview/QuestionPracticePanel.tsx`
- Modify: `src/components/interview/PredictedQuestionList.tsx`
- Modify: `src/pages/MockInterviewPage.tsx`
- Modify: `src/styles/mock-interview.css`
- Test: `tests/mock-interview.test.tsx` (create if absent)

- [ ] **Step 1: Write failing component tests**

Assert each predicted question renders `练习这道题` with `mode=practice`, the practice panel renders the selected question and text/voice input, submit shows the returned feedback, and “重新练习” clears only the current draft/result.

- [ ] **Step 2: Run focused tests**

Run `npm test -- --run tests/mock-interview.test.tsx`; expected: FAIL until the component and route state are added.

- [ ] **Step 3: Implement the panel and routing**

Use `CandidateAnswerInput` and `BrowserSpeechProvider`; read `questionId`/`question` from search params; resolve the selected question from loaded research; call the store action once; render structured feedback, risks, improvements, and follow-ups; keep a back link to the research page. Map legacy `mode=coach` to the same practice view.

- [ ] **Step 4: Implement focused styles**

Add a warm, doodle-compatible practice card, visible question context, feedback sections, retry state, and responsive layout without changing global tokens.

- [ ] **Step 5: Run focused tests**

Run the same command; expected: PASS.

- [ ] **Step 6: Commit**

Run `git add src/components/interview src/pages/MockInterviewPage.tsx src/styles/mock-interview.css tests/mock-interview.test.tsx && git commit -m "feat: add one-question interview practice flow"`.

### Task 5: Split complete mock interviews into HR and business modes

**Files:**
- Modify: `src/domain/interviewSchemas.ts`, `src/domain/types.ts`
- Modify: `src/ai/interviewPrompts.ts`, `src/ai/interviewParsers.ts`
- Modify: `server/interview.ts`
- Modify: `src/stores/interviewStore.ts`
- Modify: `src/components/interview/MockInterviewLanding.tsx`
- Modify: `src/components/interview/InterviewSession.tsx`
- Modify: `src/pages/MockInterviewPage.tsx`
- Modify: `src/styles/mock-interview.css`
- Test: `tests/interview-api.test.ts`, `tests/mock-interview.test.tsx`

- [ ] **Step 1: Write failing HR/business tests**

Assert session creation accepts `interviewType`, the model prompt context contains HR or business direction, the returned session preserves that type, each turn stores question classification/focus, and the landing page exposes exactly two independent start buttons.

- [ ] **Step 2: Run focused tests**

Run `npm test -- --run tests/interview-api.test.ts tests/mock-interview.test.tsx`; expected: new cases fail.

- [ ] **Step 3: Implement type-aware API path**

Extend session input with `interviewType`, include it in the prompt context, parse and persist generated question metadata, pass session type into turn and complete prompts, and default missing old session types to `'business'`.

- [ ] **Step 4: Implement landing/session UI**

Replace the answer-coach card with HR and business cards, pass the selected type to `start`, show type and focus in progress/session UI, and keep pause/resume/end behavior unchanged.

- [ ] **Step 5: Run focused tests**

Run the same command; expected: PASS with existing session tests still green.

- [ ] **Step 6: Commit**

Run `git add src server tests && git commit -m "feat: split mock interviews into HR and business modes"`.

### Task 6: Improve type-aware report and regression coverage

**Files:**
- Modify: `src/components/interview/InterviewReport.tsx`
- Modify: `src/stores/interviewStore.ts` only if report data needs type-specific fields.
- Modify: `src/domain/interviewSchemas.ts` / `src/ai/interviewParsers.ts` only for additive report fields.
- Test: `tests/mock-interview.test.tsx`, `tests/interview-api.test.ts`

- [ ] **Step 1: Write failing report tests**

Assert HR reports label motivation/credibility/fit guidance, business reports label judgment/contribution/execution/evidence guidance, and both retain per-turn feedback, weak-area practice, and export actions.

- [ ] **Step 2: Implement minimal type-aware report rendering**

Use the session `interviewType` to select section labels and preparation prompts; do not alter existing report API fields unless tests demonstrate a missing requirement.

- [ ] **Step 3: Run focused tests**

Run `npm test -- --run tests/mock-interview.test.tsx tests/interview-api.test.ts`; expected: PASS.

- [ ] **Step 4: Commit**

Run `git add src/components/interview/InterviewReport.tsx tests && git commit -m "feat: tailor interview reports by mode"`.

### Task 7: Full verification and documentation

**Files:**
- Modify: `README.md` or the existing feature documentation with the two interview modes, single-question practice, voice fallback, and required DeepSeek configuration.
- Test: all existing test/typecheck/build commands.

- [ ] **Step 1: Run regression checks**

Run `npm test -- --run`, the project typecheck command from `package.json`, and the static HTML build command. Expected: all existing and new tests pass; no type errors; build succeeds.

- [ ] **Step 2: Check diff and privacy constraints**

Run `git diff --check`, verify no API keys, raw recordings, or personal test data are added, and confirm old backup/session parsing still succeeds.

- [ ] **Step 3: Update documentation**

Document routes, `interviewType`, single-question endpoint, text fallback, and that AI feedback is practice guidance rather than a hiring decision.

- [ ] **Step 4: Commit**

Run `git add README.md docs && git commit -m "docs: document interview practice and modes"`.

