/** Bundles the integration tests (TypeScript) into plain CJS the VS Code test runner can load. */
import * as esbuild from 'esbuild'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const out = path.join(root, 'dist', 'vscode-tests')
await rm(out, { recursive: true, force: true })
await esbuild.build({
  entryPoints: [path.join(root, 'tests/vscode/integration/preview.test.ts')],
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outExtension: { '.js': '.cjs' },
  logLevel: 'warning',
})
