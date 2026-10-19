import { defineConfig } from '@playwright/test'

// The VS Code webview against a fake host. Build first: npm run build:vscode
export default defineConfig({
  testDir: 'tests/vscode/harness',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { channel: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
