# 静态 HTML 前端与 DeepSeek 服务端调用设计

## 目标

将现有 Offer 探险日整理为可直接托管的静态 HTML/CSS/JS 前端，同时保留完整网页功能、本地 IndexedDB 数据和 DeepSeek 智能分析能力。API Key 只存在于服务端运行环境或用户本次请求上下文，不写入 HTML、构建产物或浏览器持久化存储。

## 方案选择

采用“Vite 静态前端 + 同域 Worker API”方案：

- Vite 输出 `index.html`、静态脚本和样式文件。
- Worker 继续承接 `/api/*` 请求，统一调用 `https://api.deepseek.com/chat/completions`。
- 前端通过相对路径调用 API，避免跨域和浏览器暴露密钥。
- 保留现有多页面 SPA 路由：经历档案、能力星图、岗位方向、面试准备、JD 实验室、本地设置。
- Sites 使用当前项目的 Worker 入口和 `dist/client` 静态资源部署，不改变现有网址和访问权限。

不采用单文件内嵌 API Key 的离线方案，因为会泄露密钥，也无法稳定支持长任务、超时取消和本地数据同步。

## 数据流

```text
浏览器 index.html
  ├─ IndexedDB：经历、证据、岗位方向、分析历史
  └─ /api/* → Worker
                ├─ 读取 DEEPSEEK_API_KEY / DEEPSEEK_MODEL
                ├─ 统一超时、取消、错误归一化
                └─ 返回结构化 JSON
```

手动输入的 DeepSeek Key 仅附加到当前 API 请求，用于本次分析；默认不写入 IndexedDB。部署环境变量优先用于生产 Worker。

## 前端要求

1. 构建结果必须包含可打开的 `dist/client/index.html`。
2. 刷新任意应用路由时由 Worker 回退到前端入口，不能出现 404。
3. 页面在 API 不可用时仍能打开、读取本地数据和查看历史记录。
4. 所有智能按钮保留 loading、超时、取消、重试和局部失败提示。
5. 不在前端 bundle、HTML 注释、日志或 localStorage 中输出 API Key。

## Worker 要求

- 继续复用统一 DeepSeek gateway 和任务级超时配置。
- 代理请求使用客户端取消信号与服务端 AbortController 合并。
- 返回错误码、任务名和可理解的中文提示；不要将所有错误统一成“生成失败”。
- 允许请求体中的临时 `clientDeepSeek` 配置覆盖默认环境变量，但不保存。
- API 运行环境无法访问 DeepSeek 时，前端显示服务端错误；浏览器代理不作为必要依赖。

## 部署与网络边界

静态 HTML 不会改变域名访问限制。若当前 Sites 域名可正常访问，浏览器端不需要代理；DeepSeek 连通性由 Worker 所在运行环境决定。未来部署到中国境内可访问的云服务和域名时，用户可在无代理情况下使用，但需单独验证云端到 DeepSeek 的出站连通性并配置服务端 Key。

## 验证

- 运行 Vitest、TypeScript 检查、Vite 生产构建和 Sites 打包脚本。
- 检查产物包含 `dist/client/index.html`、静态资源、Worker 入口和 hosting 元数据。
- 验证关键路由、IndexedDB 数据读取、DeepSeek API 错误/超时提示和手动 Key 临时调用。
- 不提交真实 API Key、简历内容或原始录音。
