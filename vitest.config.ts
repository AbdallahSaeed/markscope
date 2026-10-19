import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/vscode/unit/**/*.test.ts',
    ],
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      // UI shells (viewer/popup/options DOM wiring) are exercised by the
      // Playwright suite; unit coverage targets the logic layers.
      include: [
        'src/shared/**',
        'src/vscode/protocol.ts',
        'src/vscode/config-schema.ts',
        'src/vscode/extension/link-policy.ts',
        'src/vscode/extension/confine.ts',
        'src/vscode/extension/html.ts',
        'src/vscode/extension/diagnostic-map.ts',
        'src/vscode/extension/status-text.ts',
        'src/vscode/extension/ai-host.ts',
        'src/vscode/extension/secret-area.ts',
        'src/ai/service.ts',
        'src/vscode/webview/scroll-echo.ts',
        'src/storage/**',
        'src/engine/**',
        'src/analysis/**',
        'src/ai/**',
        'src/background/**',
        'src/content/**',
        'src/viewer/search.ts',
        'src/viewer/fuzzy.ts',
        'src/viewer/source-loader.ts',
        'src/viewer/editor/diff.ts',
        'src/viewer/editor/editor-controller.ts',
        'src/viewer/editor/markdown-commands.ts',
        'src/viewer/editor/keymap.ts',
        'src/viewer/status-bar.ts',
        'src/viewer/editor/scroll-map.ts',
        'src/viewer/split-divider.ts',
        'src/viewer/drafts.ts',
        'src/viewer/draft-restore.ts',
      ],
      exclude: ['src/engine/worker.ts', 'src/background/index.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
