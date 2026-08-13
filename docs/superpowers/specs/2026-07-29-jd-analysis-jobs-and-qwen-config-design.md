# JD 分析任务归档与千问服务配置设计

## 目标

在不改变现有视觉风格和本地优先数据原则的前提下，确保每次正式分析独立归档、长任务可追踪、企业研究不串记录，并将千问密钥彻底迁移到生产 Worker。

## 已确认根因

1. `selectRecord()` 将历史记录 ID 写入 `draft.id`，提交时使用 `draft.id ?? randomUUID()`；Dexie `put()` 因此覆盖原记录。
2. AI 返回前没有分析记录或任务记录，页面仅用组件 `submitting` 表示进度；刷新、切页或异常时没有可恢复状态和部分结果。
3. 企业研究按 `analysisId` 查询，但旧分析 ID 被重复使用；研究请求返回时没有校验当前 `analysisId + jobId`，模拟面试 store 也不会在研究更新后失效。
4. 生产 Sites 环境变量为空。Worker 从浏览器 `x-dashscope-key` 读取 localStorage Key，而 `/api/service-status` 固定报告已配置，无法反映真实鉴权状态。

## 数据设计

### JD 记录

扩展现有 `JdRecord`，保留旧字段兼容：

- `id`: 每次正式分析新生成的 analysisId。
- `parentAnalysisId?`: 重新分析或复制时指向来源记录。
- `inputSnapshot`: 企业、官网、行业、岗位、JD、简历证据快照和创建时间。
- `inputHash`: 输入快照的稳定哈希。
- `status`: queued、analyzing-jd、researching-company、matching-resume、generating-interview-prep、completed、partial、failed、cancelled。
- `activeJobId`: 当前任务 ID。
- `companyResearchId?`: 当前有效研究版本。
- `interviewPreparationId?`: 当前有效面试准备版本。
- `createdAt`、`updatedAt`、`completedAt?`。

旧记录读取时根据已有 `analysisStatus` 和 `updatedAt` 补充兼容视图，不原地篡改历史内容。

### 分析任务

新增 IndexedDB `analysisJobs` 表：

- `id`、`analysisId`、`inputHash`。
- `status`: queued、running、partial、completed、failed、timeout、cancelled。
- `currentStage`: jd-analysis、company-research、resume-match、interview-preparation。
- 各阶段独立状态、错误码和更新时间。
- `attempt`、`startedAt?`、`completedAt?`。

所有结果写入前同时校验 `analysisId`、`jobId` 和 `inputHash`。旧任务可以完成自己的历史记录，但不得写入其他记录或替换当前页面状态。

### 企业研究版本

扩展 `InterviewResearch`：

- 保留唯一 `id` 作为 companyResearchId。
- 增加 `jobId`、`companyName`、`companyIdentityHash`、`jdHash`、`researchContextHash`。
- 每次“更新研究”创建新记录，不覆盖旧版本。
- 当前 JD 记录仅在新版本成功或部分成功后更新 `companyResearchId`。

模拟面试上下文按 `analysisId + companyResearchId` 加载。研究版本更新后，旧面试准备和未完成模拟会话标记为 stale，不自动删除历史。

## 任务流程

1. 用户点击“开始新的分析”。
2. 立即创建 analysisId、jobId、输入快照和 queued 历史记录。
3. 将阶段切换为 jd-analysis 并调用统一千问网关。
4. JD 结果成功后立即保存和展示；后续阶段失败不删除该结果。
5. 企业研究由用户在面试准备区生成或局部重试，每次产生新研究版本和研究任务标识。
6. 页面切换记录时只订阅该 analysisId 的状态；异步返回前验证记录和任务身份。
7. “重新分析”和“复制为新分析”生成新记录；“删除”只删除明确选择的记录及其从属数据。

当前架构不引入后台队列。页面关闭会通过 AbortSignal 取消上游请求，任务持久化为 cancelled 或 timeout；已完成阶段仍可恢复。

## 千问配置

生产 Worker 统一读取：

- `QWEN_API_KEY`：Sites 加密 Secret。
- `QWEN_MODEL`：默认 `qwen-plus`。
- Base URL：DashScope compatible-mode 官方 HTTPS 地址。

前端不再保存、读取或发送 API Key，也不使用 `VITE_` 或其他公开构建变量。现有 localStorage Key 仅在迁移时删除，不读取或上传。

`GET /api/ai/health` 返回 provider、configured、reachable、authenticated、modelAvailable、latencyMs 和脱敏错误码，不返回密钥。健康请求使用最小无用户数据调用。生产页面仅显示“智能分析服务可用/暂不可用”；管理员错误保留在结构化响应与脱敏日志中。

所有千问任务继续经过统一 Worker 网关，共用鉴权、超时、错误映射和请求 ID。错误码统一为 QWEN_NOT_CONFIGURED、QWEN_AUTH_FAILED、QWEN_MODEL_NOT_FOUND、QWEN_RATE_LIMITED、QWEN_TIMEOUT、QWEN_NETWORK_ERROR、QWEN_INVALID_RESPONSE。

岗位灵感重试流程为 checking-ai-service → reading-profile → generating。健康检查未通过时不发送完整生成请求；并发点击复用同一个进行中 Promise。

## UI

- 主按钮固定为“开始新的分析”。
- 选择历史记录只打开快照，不把历史 ID 变成新提交 ID。
- 历史项展示企业、岗位、创建时间、状态、JD 摘要、研究更新时间，并提供打开、重新分析、复制为新分析、删除。
- 进度展示真实阶段及等待、进行中、完成、部分完成、失败、超时状态。
- 更新研究期间不把旧研究标成最新；可折叠显示“上一版本”。
- 超时或鉴权失败提供局部重试，不清空成功阶段。

## 测试与验收

- 数据层：重复输入仍创建不同 analysisId；快照不可变；指定删除；旧数据兼容。
- 任务层：job 绑定、阶段保存、超时终态、迟到结果隔离、部分成功重试。
- 企业研究：新版本、身份哈希、当前版本指针、模拟面试上下文失效。
- 千问：服务端 Secret、健康检查、鉴权/模型/限流/超时映射，浏览器请求无 Key。
- 浏览器：两家企业分别归档并刷新保留；同企业两岗位互不覆盖；研究更新不串企业；无效 Key 快速失败；有效 Secret 下岗位灵感真实生成。
- 通过 Worker 测试、Vitest、TypeScript、生产构建和关键 Playwright E2E 后才发布。
