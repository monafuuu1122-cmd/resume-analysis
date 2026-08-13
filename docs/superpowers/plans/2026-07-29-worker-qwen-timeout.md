# Production Worker Qwen Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every production Worker request to DashScope has a bounded, cancellable server-side timeout and a structured error response.

**Architecture:** Add one Worker-side Qwen gateway used by chat completions and Qwen web search. It owns task timeout configuration, environment overrides, caller-signal propagation, upstream error classification, and resource cleanup; business handlers only provide task names and payloads.

**Tech Stack:** Cloudflare Worker Web APIs, JavaScript, Node test runner, React/TypeScript frontend.

---

### Task 1: Lock the gateway contract with tests

**Files:**
- Modify: `tests/sites-worker.test.mjs`

- [x] Add HTTP-level tests proving chat and search requests receive an abort signal.
- [x] Add tests proving task timeouts return `504` with `AI_TIMEOUT`, task name, request ID, timeout, and retryability.
- [x] Add a test proving an aborted client request is classified as `AI_ABORTED`.
- [x] Run `npm run test:sites` and confirm the new tests fail for the missing behavior.

### Task 2: Add the unified production Qwen gateway

**Files:**
- Modify: `worker/index.js`

- [x] Define centralized safe defaults and validated environment overrides for every current Qwen task.
- [x] Define structured AI error codes and a single error factory.
- [x] Implement one gateway that combines the caller signal with its timeout controller, aborts upstream, clears timers/listeners in `finally`, and classifies auth, rate limit, upstream, invalid response, timeout, and cancellation errors.
- [x] Route both DashScope chat completion and Qwen web-search requests through the gateway.
- [x] Pass explicit task names from extraction, JD analysis, career inspiration, company research, answer optimization, interview start/turn, and interview report handlers.
- [x] Run `npm run test:sites` until all tests pass.

### Task 3: Preserve frontend state and expose actionable errors

**Files:**
- Modify: `src/ai/client.ts`
- Modify: `src/stores/interviewStore.ts`
- Modify: `src/components/interview/InterviewResearchPanel.tsx`
- Test: relevant existing frontend tests

- [x] Parse structured Worker errors without discarding their user-facing message.
- [x] Use the standard timeout message while preserving existing JD results, research, interview turns, answers, and report data.
- [x] Keep existing local retry controls and ensure cancellation remains distinguishable from server timeout.
- [x] Run focused frontend tests.

### Task 4: Configuration and full verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [x] Document timeout environment variables, safe fallback behavior, and current non-streaming Worker behavior.
- [x] Run `npm run test:sites`, `npm test`, and `npm run build`.
- [x] Inspect the diff for direct DashScope fetches outside the gateway and ensure no secrets were added.
