# 能力星图与面试准备整合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Offer 探险视觉系统中，把能力星图改为“能量条 + 雷达总览 + 资产栏”，并新增独立的“面试准备”页面，保留现有证据与本地数据链路。

**Architecture:** 复用 `useConfirmedEvidence` 与 `buildCapabilitySummaries`，在页面层建立六类能力聚合与面试指引派生数据；不改 IndexedDB 数据结构。通过 `routeConfig` 增加 `/interview-prep`，继续使用现有 token 和全局响应式规则。

**Tech Stack:** React 19、TypeScript、React Router、Phosphor Icons、CSS variables、Vitest/Testing Library。

---

### Task 1: 扩展导航与面试准备页面

**Files:**
- Create: `src/pages/InterviewPreparationPage.tsx`
- Modify: `src/app/routeConfig.ts`
- Modify: `src/pages/CapabilitiesPage.tsx`
- Test: `tests/navigation.test.tsx`, `tests/interview-preparation.test.tsx`

- [x] 新增 `/interview-prep` 路由和“面试准备”导航项。
- [x] 页面读取已确认证据，按六类能力计算缺口状态，展示“缺什么—为什么—怎么补—面试自测”四段式指引。
- [x] 保留无数据、加载和存储错误状态。
- [x] 增加页面渲染与导航测试。

### Task 2: 替换能力星图呈现层

**Files:**
- Modify: `src/pages/CapabilitiesPage.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/capabilities.test.tsx`

- [x] 以六类能力为主视图，左侧展示能量条与证据/经历/强度，右侧展示带文字标签的 SVG 雷达图。
- [x] 将工具、语言、证书、AI 应用资料放到独立资产区，与经历能力区分开。
- [x] 保留每条能力“查看证据”展开功能和旧测试语义。
- [x] 使用现有暖纸色、珊瑚色、麦黄色、深棕描边和圆角 token，并补充移动端单列布局。

### Task 3: 验收与文档

**Files:**
- Modify: `README.md`（如需补充新增入口说明）

- [x] 运行能力星图、导航、面试准备相关测试。
- [x] 运行 typecheck/build 与现有全量测试。
- [x] 用本地浏览器分别检查桌面和移动布局，确认页面可达、左侧栏目显示、证据展开和空状态正常。
