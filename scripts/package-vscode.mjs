/**
 * Packs dist/vscode into release/markscope-<version>.vsix (+ SHA-256 line).
 * Fails above the size budget so a stray dependency can't quietly bloat installs.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
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
const run = spawnSync(
  'npx',
  ['--no-install', 'vsce', 'package', '--no-dependencies', '--out', file],
  {
    cwd: dir, // npx finds vsce in the repo's node_modules from here
    stdio: 'inherit',
    shell: process.platform === 'win32', // npx is a .cmd shim there
  },
)
if (run.status !== 0) process.exit(run.status ?? 1)

// Nothing but the built extension may ship: no sources, maps or tests.
const listing = spawnSync('npx', ['--no-install', 'vsce', 'ls'], {
  cwd: dir,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
const files = (listing.stdout ?? '')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
const stray = files.filter(f =>
  /\.map$|\.tsx?$|(^|\/)(tests?|src|node_modules)\//.test(f),
)
if (listing.status !== 0 || files.length === 0 || stray.length > 0) {
  console.error(
    `vsce ls found files that must not ship:\n${stray.join('\n') || '(listing failed)'}`,
  )
  process.exit(1)
}

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
const sums = path.join(releaseDir, 'SHA256SUMS.txt')
const kept = (await readFile(sums, 'utf8').catch(() => ''))
  .split('\n')
  .filter(line => line && !line.endsWith(`  ${name}`))
await writeFile(sums, [...kept, `${sha}  ${name}`].join('\n') + '\n')
console.log(`${name}  ${(bytes / 1024).toFixed(0)} KB  sha256:${sha.slice(0, 16)}…`)
