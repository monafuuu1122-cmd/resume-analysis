// @vitest-environment node

import { resolve } from 'node:path'
import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'

import packageJson from '../package.json'

describe('production server contract', () => {
  it('reports only whether enterprise research is configured', async () => {
    const serverModule = (await import('../server/index')) as Record<
      string,
      unknown
    >
    const createServiceStatusHandler =
      serverModule.createServiceStatusHandler as (
        env: Record<string, string | undefined>,
      ) => (request: Request, response: Response) => void
    const json = vi.fn()

    createServiceStatusHandler({
      TAVILY_API_KEY: 'private-research-key',
    })({} as Request, { json } as unknown as Response)

    expect(json).toHaveBeenCalledWith({ researchConfigured: true })
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      'private-research-key',
    )
  })

  it('exposes a local DeepSeek health check for browser-saved keys', async () => {
    const serverModule = (await import('../server/index')) as Record<string, unknown>
    const createAiHealthHandler = serverModule.createAiHealthHandler as (
      fetchImplementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
    ) => (request: Request, response: Response) => Promise<void>
    const request = {
      body: {
        clientDeepSeek: { apiKey: 'browser-key', model: 'deepseek-chat' },
      },
      header: () => undefined,
    } as unknown as Request
    const json = vi.fn()
    const response = { json } as unknown as Response
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await createAiHealthHandler(fetchImplementation)(request, response)

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek',
      configured: true,
      reachable: true,
      authenticated: true,
      modelAvailable: true,
    }))
    expect(fetchImplementation).toHaveBeenCalled()
  })

  it('distinguishes an unavailable model during the health check', async () => {
    const serverModule = (await import('../server/index')) as Record<string, unknown>
    const createAiHealthHandler = serverModule.createAiHealthHandler as (
      fetchImplementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
    ) => (request: Request, response: Response) => Promise<void>
    const request = {
      body: {
        clientDeepSeek: { apiKey: 'browser-key', model: 'missing-model' },
      },
      header: () => undefined,
    } as unknown as Request
    const json = vi.fn()
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response('{}', { status: 404 }),
    )

    await createAiHealthHandler(fetchImplementation)(request, { json } as unknown as Response)

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'DEEPSEEK_MODEL_NOT_FOUND',
      modelAvailable: false,
    }))
  })

  it('uses the Express server for start and preview', () => {
    expect(packageJson.scripts.start).toBe('tsx server/index.ts')
    expect(packageJson.scripts.preview).toBe('npm run start')
    expect(packageJson.scripts['local:html']).toBe(
      'npm run build:html && node scripts/start-local-html.mjs',
    )
  })

  it('accepts only safe PORT values', async () => {
    const serverModule = (await import('../server/index')) as Record<
      string,
      unknown
    >
    const resolveServerPort = serverModule.resolveServerPort

    expect(resolveServerPort).toBeTypeOf('function')
    if (typeof resolveServerPort !== 'function') return

    expect(resolveServerPort('3210')).toBe(3210)
    expect(resolveServerPort(undefined)).toBe(8787)
    expect(resolveServerPort('0')).toBe(8787)
    expect(resolveServerPort('70000')).toBe(8787)
    expect(resolveServerPort('not-a-port')).toBe(8787)
  })

  it('resolves dist from the app root and sends its index for SPA fallback', async () => {
    const serverModule = (await import('../server/index')) as Record<
      string,
      unknown
    >
    const productionDistDirectory = serverModule.productionDistDirectory
    const createSpaFallbackHandler = serverModule.createSpaFallbackHandler

    expect(productionDistDirectory).toBeTypeOf('string')
    expect(createSpaFallbackHandler).toBeTypeOf('function')
    if (
      typeof productionDistDirectory !== 'string' ||
      typeof createSpaFallbackHandler !== 'function'
    ) {
      return
    }

    expect(productionDistDirectory).toBe(resolve('dist/client'))

    const sendFile = vi.fn()
    const next = vi.fn()
    const handler = createSpaFallbackHandler(productionDistDirectory) as (
      request: Request,
      response: Response,
      nextMiddleware: () => void,
    ) => void
    handler(
      { method: 'GET' } as Request,
      { sendFile } as unknown as Response,
      next,
    )

    expect(sendFile).toHaveBeenCalledWith('index.html', {
      root: productionDistDirectory,
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('can serve the generated static HTML folder for local mode', async () => {
    const serverModule = (await import('../server/index')) as Record<string, unknown>
    const resolveServerDistDirectory = serverModule.resolveServerDistDirectory

    expect(resolveServerDistDirectory).toBeTypeOf('function')
    if (typeof resolveServerDistDirectory !== 'function') return

    expect(resolveServerDistDirectory(undefined)).toBe(resolve('dist/client'))
    expect(resolveServerDistDirectory('html-export')).toBe(resolve('html-export'))
    expect(resolveServerDistDirectory('')).toBe(resolve('dist/client'))
  })
})
