# GitHub 上传说明

这个目录是当前工作区的代码增量包，共 53 个文件。

请将本目录中的内容上传到 GitHub 仓库根目录，并保持 `src/`、`server/`、`worker/`、`api/` 的目录结构。上传时选择覆盖同名文件即可。

本包包含：

- 简历版本归档与 PDF 文字解析
- JD 实验室选择简历版本并绑定分析记录
- 模拟面试、DeepSeek 服务和 Vercel API 适配的当前修改
- 依赖锁定、生产配置和相关测试

不要把本包外的 `.DS_Store`、`node_modules/`、`dist/`、`.env` 或个人简历 PDF 上传到 GitHub。

上传完成后，在 Vercel 重新部署 `main` 分支，并在 Vercel 环境变量中配置 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL`。
