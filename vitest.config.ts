import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      // UI shells (viewer/popup/options DOM wiring) are exercised by the
      // Playwright suite; unit coverage targets the logic layers.
      include: [
        'src/shared/**',
        'src/storage/**',
        'src/engine/**',
        'src/analysis/**',
        'src/ai/**',
        'src/background/**',
        'src/content/**',
        'src/viewer/search.ts',
        'src/viewer/fuzzy.ts',
        'src/viewer/source-loader.ts',
      ],
      exclude: ['src/engine/worker.ts', 'src/background/index.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
