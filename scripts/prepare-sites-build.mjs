#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const required = [
  path.join(dist, 'client', 'index.html'),
  path.join(root, 'worker', 'index.js'),
  path.join(root, '.openai', 'hosting.json'),
]

for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing Sites build input: ${file}`)
}

mkdirSync(path.join(dist, 'server'), { recursive: true })
mkdirSync(path.join(dist, '.openai'), { recursive: true })
copyFileSync(
  path.join(root, 'worker', 'index.js'),
  path.join(dist, 'server', 'index.js'),
)
copyFileSync(
  path.join(root, '.openai', 'hosting.json'),
  path.join(dist, '.openai', 'hosting.json'),
)
