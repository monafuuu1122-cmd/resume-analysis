import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    exclude: [
      ...configDefaults.exclude,
      'tests/sites-worker.test.mjs',
      'tests/html-export.test.mjs',
      'tests/local-html-launcher.test.mjs',
      // This contract suite uses Node's built-in test runner; keep it out of Vitest.
      'tests/vercel-function-layout.test.mjs',
    ],
  },
})
