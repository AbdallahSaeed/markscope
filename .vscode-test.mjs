import { defineConfig } from '@vscode/test-cli'

// Runs the built extension in a real VS Code. `npm run test:vscode` builds first.
// VSCODE_TEST_VERSION=1.90.0 checks the oldest supported engine.
export default defineConfig({
  label: 'integration',
  files: 'dist/vscode-tests/**/*.test.cjs',
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  extensionDevelopmentPath: 'dist/vscode',
  workspaceFolder: 'tests/vscode/fixtures',
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'bdd', timeout: 90_000 },
})
