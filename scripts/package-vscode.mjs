/**
 * Packs dist/vscode into release/markscope-<version>.vsix (+ SHA-256 line).
 * Fails above the size budget so a stray dependency can't quietly bloat installs.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MAX_VSIX_BYTES = 10 * 1024 * 1024

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const dir = path.join(root, 'dist', 'vscode')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const releaseDir = path.join(root, 'release')
await mkdir(releaseDir, { recursive: true })

try {
  await stat(path.join(dir, 'package.json'))
} catch {
  console.error('Run `npm run build:vscode` first.')
  process.exit(1)
}

const name = `markscope-${pkg.version}.vsix`
const file = path.join(releaseDir, name)
const vsce = path.join(root, 'node_modules/.bin/vsce')
const run = spawnSync(vsce, ['package', '--no-dependencies', '--out', file], {
  cwd: dir,
  stdio: 'inherit',
})
if (run.status !== 0) process.exit(run.status ?? 1)

const bytes = (await stat(file)).size
if (bytes > MAX_VSIX_BYTES) {
  console.error(
    `${name} is ${(bytes / 1048576).toFixed(1)} MB; the budget is ${MAX_VSIX_BYTES / 1048576} MB.`,
  )
  process.exit(1)
}
const sha = createHash('sha256')
  .update(await readFile(file))
  .digest('hex')
await appendFile(path.join(releaseDir, 'SHA256SUMS.txt'), `${sha}  ${name}\n`)
console.log(`${name}  ${(bytes / 1024).toFixed(0)} KB  sha256:${sha.slice(0, 16)}…`)
