# 本地数据、经历迁移、岗位灵感与 JD 交互修复设计

日期：2026-07-29

## 目标

在不引入账号或云端同步系统的前提下，统一首页、经历档案、岗位方向和 JD 实验室的数据读取方式，修复错误状态、跨版本迁移、岗位灵感无限加载与企业目标交互问题。所有修复必须通过自动化测试，并在真实 Chrome 中逐项操作验收后交付。

## 已确认根因

1. 首页直接组合 IndexedDB 计数与 localStorage 中的千问配置。任何一个数据库读取失败都会让整体进入失败状态；没有 empty、migration-required 和模块级降级。
2. 项目从第一版起主要使用 IndexedDB `offer-adventure`，但没有本地数据元信息、旧 localStorage/旧数据库探测器或正式迁移器。Dexie 升级只能保留同一 origin 下的同名数据库。
3. Chrome 历史中存在 `localhost:5173`、`127.0.0.1:5173` 和正式域名三个 origin。浏览器将三者的数据完全隔离。恢复前两个本地 origin 后，经历列表均为空；`localhost` 只残留未提交的测试表单文字。
4. 岗位灵感前端请求没有 AbortController、超时、单请求锁和独立保存阶段。网络 Promise 不结束时页面会永久 loading。
5. 企业目标组件代码存在点击处理，但数据加载错误未呈现、提交没有完整状态机、官网缺少明确校验，主要操作的即时反馈不足。生产问题需要在修复版中用真实浏览器复现与验收。

## 方案边界

- 保持 IndexedDB 为业务数据主存储。
- localStorage 仅保存非业务配置、迁移元信息或一次性提示状态，不作为经历主存储。
- 同一 origin 内自动检测并迁移旧数据。
- 不尝试绕过浏览器同源安全策略。不同网址的数据使用用户主动下载和导入的迁移包转移。
- 迁移不删除旧数据，不覆盖新数据，不上传用户经历。
- 不引入登录、云数据库或后台账户系统。

## 统一数据层

新增 `UserCareerRepository`，作为四个页面的唯一聚合读取入口：

```ts
interface UserCareerRepository {
  getSnapshot(): Promise<UserCareerSnapshot>
  getPreparationProgress(): Promise<PreparationProgress>
  migrateIfNeeded(): Promise<MigrationResult>
  exportMigrationPackage(): Promise<MigrationPackage>
  importMigrationPackage(value: unknown): Promise<MigrationResult>
}
```

`UserCareerSnapshot` 聚合：

- experiences、sourceArtifacts、evidenceSpans、claims；
- profileMaterials；
- careerDirections 和反馈；
- jdRecords；
- interviewResearch、mockInterviewSessions、answerOptimizations；
- companyTargets；
- localDataMeta；
- 各模块读取错误。

聚合读取使用分模块 `Promise.allSettled`。单模块失败只标记该模块失败，其他成功数据仍参与页面展示和进度计算。

## 数据版本与迁移

数据库增加：

- `localDataMeta`：schemaVersion、lastMigratedAt、migrationHistory；
- `migrationSnapshots`：迁移前的脱敏结构化快照；
- `migrationRecoveryItems`：无法解析的旧记录与错误原因。

迁移流程：

1. 读取元信息和现有新数据。
2. 检查已知同源旧 localStorage keys、旧数据库名、旧 store 和旧备份结构。
3. 对每条记录单独解析，损坏记录进入恢复列表。
4. 生成经历指纹：组织、角色、项目、日期与规范化原文摘要。
5. 确认相同的记录跳过；疑似相同但证据不足时保留两条并标记待确认。
6. 在一个 Dexie 事务中合并有效数据并写入迁移元信息。
7. 保留旧来源和迁移前快照，不自动删除。
8. 重复执行时根据迁移 ID 与指纹保持幂等。

跨 origin 迁移使用 JSON 迁移包：

- 旧网址导出完整业务数据；
- 正式网址导入、校验、合并和去重；
- Key、原始录音和浏览器隐私数据不进入迁移包；
- 导入失败不写入部分破坏性结果；
- 兼容现有 v1/v2 备份。

## 首页准备进度

状态：

```ts
type PreparationDataStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'migration-required'
  | 'read-failed'
```

独立 selector 统计：

- 基础补充资料；
- 经历数量和完整度；
- 已确认的证据；
- 岗位方向数量和主方向；
- JD 分析；
- 面试研究；
- 已完成模拟面试；
- 待补充证据；
- 千问配置仅作为辅助项，不读取或展示 Key。

进度项包含完成状态、百分比、目标路由和缺失原因。页面回到首页或重新获得焦点时重新加载；无数据进入 empty，只有核心数据全部不可读时进入 read-failed。

## 经历档案迁移反馈

经历页首次检测到迁移时显示：

- 已迁移数量；
- 跳过的重复数量；
- 待恢复数量；
- 查看迁移内容；
- 查看待恢复内容；
- 重新检查旧数据；
- 导出/导入迁移包。

提示在用户关闭后不重复弹出，但设置页始终保留迁移与恢复入口。

## 岗位灵感请求生命周期

状态：

```ts
type CareerInspirationStatus =
  | 'idle'
  | 'preparing-profile'
  | 'requesting-model'
  | 'parsing'
  | 'saving'
  | 'completed'
  | 'partial'
  | 'insufficient-profile'
  | 'request-timeout'
  | 'model-failed'
  | 'parse-failed'
  | 'save-failed'
```

实现规则：

- 使用 AbortController 和前端 60 秒超时；后端千问调用设置独立超时。
- 同一页面只允许一个活动请求；重复点击聚焦当前请求，不创建并发。
- `finally` 必须释放活动请求和按钮状态。
- 请求传入完整经历、证据单元、已保存和已排除方向、反馈及 JSON Schema。
- 解析清理 Markdown 代码围栏；整体解析失败允许一次修复；单卡失败保留有效卡片。
- 空方向数组视为失败或证据不足，不能 completed。
- 保存失败时保留内存结果并显示“结果未保存”，允许再次保存。
- 开发环境只展示数量、模型、耗时、HTTP 状态、响应字符数、解析状态和保存状态。

## JD 企业目标交互

企业目标状态：

```ts
type CompanyTargetState =
  | 'editing'
  | 'validating'
  | 'confirmed'
  | 'ambiguous'
  | 'researching'
  | 'completed'
  | 'partial'
  | 'failed'
```

交互规则：

- 输入框始终在 editing、ambiguous 和 failed 状态可编辑。
- 企业名称为空时定位并提示“请输入企业名称”。
- 官网存在时必须是 `http` 或 `https` URL。
- 保存按钮提供 validating 和成功反馈。
- confirmed 后可以更换企业、补充官网、绑定 JD 或开始研究。
- researching 只禁用重复提交，保留取消和进度。
- failed 提供具体错误、重试和修改入口。
- 所有按钮显式 `type="button"` 或正确的 submit 语义。
- 组件数据加载错误必须显示，不能产生未处理 Promise。
- CSS 验收覆盖常规宽度和窄屏，确认没有遮挡层或错误 pointer-events。

## 测试与浏览器验收

采用测试驱动实现，每项先添加失败测试：

1. Repository：分模块降级、版本、同源迁移、幂等、合并、指纹去重、恢复列表、迁移包导入导出。
2. 首页：loading、empty、migration-required、read-failed、真实进度和刷新更新。
3. 岗位灵感：成功、超时、鉴权、非 JSON、空结果、保存失败、重复点击和 loading 结束。
4. 企业目标：编辑、URL 校验、状态变化、错误、重试和按钮恢复。
5. E2E：准备虚构旧数据和新数据，覆盖首页、迁移、岗位灵感成功/失败、企业目标及窄屏。

浏览器验收使用 Chrome 和虚构数据，保存需求指定的各阶段截图。岗位灵感真实调用使用用户浏览器已保存的千问配置，但验收日志不记录 Key、完整经历或完整模型上下文。

## 交付

先交付可运行的本地浏览器验收版本和验收记录。只有用户确认后才更新正式网站。现有正式网址、IndexedDB 名称和旧记录保持不变。
