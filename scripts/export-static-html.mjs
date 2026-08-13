import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exportReadme = `# Offer 探险日静态 HTML 前端

这里是由 Vite 生成的静态 HTML/CSS/JS 前端文件。

## 使用方式

请将此目录与同源的 Offer 探险日 Worker API 一起提供。页面通过相对路径访问 Worker API，才能继续使用 DeepSeek 分析、岗位匹配和面试功能。

DeepSeek 密钥只应配置在 Worker 的服务端环境中，或通过应用内的临时配置入口传递给当前请求；不要把密钥写入 HTML、前端环境变量、静态资源或源码仓库。

浏览器不需要直接连接 DeepSeek，也不需要在浏览器内配置代理。实际可用性取决于网站域名可访问性和 Worker 到 DeepSeek 的出站网络连通性。
`

async function ensureDifferentDirectories(sourceDir, outputDir) {
  const source = path.resolve(sourceDir)
  const output = path.resolve(outputDir)
  if (source === output) {
    throw new Error('Static HTML export destination must differ from the Vite client build directory')
  }
  return { source, output }
}

export async function exportStaticHtml({ sourceDir, outputDir }) {
  const { source, output } = await ensureDifferentDirectories(sourceDir, outputDir)
  const indexPath = path.join(source, 'index.html')
  await access(indexPath)
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(source, output, { recursive: true })
  await writeFile(path.join(output, 'README.md'), exportReadme, 'utf8')
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const projectRoot = path.resolve(path.dirname(scriptPath), '..')
  const sourceDir = path.join(projectRoot, 'dist', 'client')
  const outputDir = path.join(projectRoot, 'html-export')
  await exportStaticHtml({ sourceDir, outputDir })
  process.stdout.write(`${outputDir}\n`)
}
