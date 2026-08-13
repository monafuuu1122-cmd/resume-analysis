# 千问企业研究状态修复设计

## 目标

面试准备中的企业研究直接复用浏览器已保存的千问 API Key，通过千问原生联网搜索查询企业官网、官方招聘、人才理念、年报 / ESG、项目报告和官方新闻，不要求用户再配置独立搜索服务。

## 根因

当前 Sites worker 已调用千问联网搜索，但将“搜索未返回可解析来源”错误映射为 `unavailable`。前端又把 `unavailable` 固定解释为“企业研究服务尚未配置”，导致已配置千问的用户看到错误提示。

## 数据流

1. 前端从 localStorage 读取千问 Key 和模型，仅在用户点击生成或重新生成时通过 `x-dashscope-key` 发给同源 API。
2. Sites worker 使用千问原生 DashScope 联网搜索，开启 `enable_search`、`enable_source` 和强制搜索。
3. 搜索提示明确要求优先官方来源：企业官网、官方招聘、企业文化与人才理念、年报 / ESG、业务或项目报告、官方新闻。
4. 搜索结果经过 URL、标题和来源类型规范化后，再交给千问生成企业画像、能力矩阵和面试重点。
5. 企业结论必须关联可点击来源；没有可靠来源时不生成企业事实。

## 状态语义

- 缺少千问 Key：请求直接返回“请先配置千问 API Key”，不保存研究记录。
- 搜索成功且企业身份唯一：`completed`。
- 找到多个可能的官方域名：`uncertain`。
- 已调用千问但没有可靠来源：`no-reliable-info`。
- 部分来源失败但仍有可用来源：`partial`。
- API 或生成异常：`failed`。
- 旧记录中的 `unavailable`：按兼容状态展示为“旧研究未完成”，允许直接重新生成，不再提示配置额外搜索服务。

## UI 与错误处理

- 生成按钮继续复用已保存的千问配置。
- 旧 `unavailable`、`failed`、`no-reliable-info` 均提供重试入口。
- 页面明确区分“千问未配置”“联网失败”“暂无可靠公开信息”。
- 联网失败不影响已有 JD 分析、简历匹配与旧记录查看。

## 测试

- Sites worker：有千问 Key但无来源时返回 `no-reliable-info`，不返回 `unavailable`。
- 前端：旧 `unavailable` 记录显示可重新生成，而非要求配置企业搜索服务。
- 搜索请求：验证官方来源优先提示、`enable_search`、`enable_source` 和强制搜索参数。
- 完整执行 Vitest、Sites worker tests、TypeScript 与生产构建。

