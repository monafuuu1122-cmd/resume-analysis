# Skill and Tool Profile Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class “技能和工具” profile material that is saved, migrated and displayed as a tool throughout the career dashboard.

**Architecture:** Extend the existing Zod profile-material discriminant instead of adding a new table or form. Reuse the current repository, backup and AI-context flow; only the capability projection needs an explicit `skill_tool → tool` mapping.

**Tech Stack:** React 19, TypeScript, Zod 3, Dexie 4, Vitest, Testing Library.

---

## File map

- Modify `src/domain/schemas.ts`: accept `skill_tool`.
- Modify `src/pages/ExperiencesPage.tsx`: add the selector option, explanatory copy and optional proficiency field.
- Modify `src/domain/scoring.ts`: map the new material to the tool capability group.
- Modify `tests/experiences.test.tsx`, `tests/scoring.test.ts`, `tests/schemas.test.ts`: cover persistence, projection and compatibility.

### Task 1: Schema and capability projection

**Files:**
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/scoring.ts`
- Test: `tests/schemas.test.ts`
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

Add a schema assertion for `{ type: 'skill_tool' }` and a scoring assertion that a saved “Figma” material produces:

```ts
expect(summary).toMatchObject({
  label: 'Figma',
  kind: 'tool',
  profileMaterialIds: ['tool-1'],
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/schemas.test.ts tests/scoring.test.ts
```

Expected: schema rejects `skill_tool` and no tool summary is produced.

- [ ] **Step 3: Implement the minimal mapping**

Extend the enum:

```ts
type: z.enum([
  'certificate',
  'ai_application',
  'language',
  'skill_tool',
])
```

Map materials explicitly:

```ts
material.type === 'skill_tool' ? 'tool' : 'certificate'
```

- [ ] **Step 4: Run focused tests and typecheck**

Expected: tests pass and TypeScript accepts the extended type.

### Task 2: Experience form and persistence

**Files:**
- Modify: `src/pages/ExperiencesPage.tsx`
- Test: `tests/experiences.test.tsx`

- [ ] **Step 1: Write the failing interaction test**

Select “技能和工具”, enter “Figma”, a concrete use description and “熟练”, save, then assert:

```ts
expect(await db.profileMaterials.get('...')).toMatchObject({
  type: 'skill_tool',
  title: 'Figma',
  proficiency: '熟练',
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Expected: the option is missing.

- [ ] **Step 3: Add the option and proficiency field**

Add:

```tsx
<option value="skill_tool">技能和工具</option>
```

Show “熟练度（可选）” for `language` and `skill_tool`. Update the section description to include skills and tools.

- [ ] **Step 4: Run focused and full checks**

Run all Vitest tests, Worker tests, `tsc --noEmit`, production build and `git diff --check`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schemas.ts src/domain/scoring.ts src/pages/ExperiencesPage.tsx tests
git commit -m "feat: add skill and tool profile materials"
```
