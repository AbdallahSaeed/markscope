/** Zips dist/<target> into release/markscope-<version>-<target>.zip (+ SHA-256). */
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { zipSync } from 'fflate'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const releaseDir = path.join(root, 'release')
await mkdir(releaseDir, { recursive: true })

async function collect(dir, base = dir, files = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collect(full, base, files)
    else if (!entry.name.startsWith('.'))
      files[path.relative(base, full).split(path.sep).join('/')] = new Uint8Array(
        await readFile(full),
      )
  }
  return files
}

const checksums = []
for (const target of ['chrome', 'firefox']) {
  const dir = path.join(root, 'dist', target)
  try {
    await stat(path.join(dir, 'manifest.json'))
  } catch {
    console.warn(`skip ${target}: run the build first`)
    continue
  }
  const zip = zipSync(await collect(dir), {
    level: 9,
    mtime: new Date('2026-01-01T00:00:00Z'),
  })
  const name = `markscope-${pkg.version}-${target}.zip`
  await writeFile(path.join(releaseDir, name), zip)
  const sha = createHash('sha256').update(zip).digest('hex')
  checksums.push(`${sha}  ${name}`)
  console.log(
    `${name}  ${(zip.length / 1024).toFixed(0)} KB  sha256:${sha.slice(0, 16)}…`,
  )
}
await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), checksums.join('\n') + '\n')
