import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')

export function parseDotEnv(content) {
  const values = {}
  for (const rawLine of String(content).split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u)
    if (!match) continue
    let value = match[2].trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

export function buildLocalServerEnv(processEnv = process.env, dotEnvValues = {}) {
  return {
    ...dotEnvValues,
    ...processEnv,
    HTML_DIST_DIR: 'html-export',
  }
}

async function readLocalDotEnv() {
  const path = resolve(projectRoot, '.env')
  if (!existsSync(path)) return {}
  try {
    return parseDotEnv(await readFile(path, 'utf8'))
  } catch {
    return {}
  }
}

export async function startLocalHtmlServer() {
  const dotEnvValues = await readLocalDotEnv()
  const env = buildLocalServerEnv(process.env, dotEnvValues)
  if (!env.PORT) env.PORT = '4173'
  const tsxCli = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs')
  const child = spawn(process.execPath, [tsxCli, resolve(projectRoot, 'server/index.ts')], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal)
  }
  process.once('SIGINT', () => forwardSignal('SIGINT'))
  process.once('SIGTERM', () => forwardSignal('SIGTERM'))

  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0))
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalHtmlServer()
    .then((code) => { process.exitCode = code })
    .catch((error) => {
      console.error('无法启动本地 HTML 服务：', error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
