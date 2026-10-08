/**
 * Build: esbuild bundles each extension context, then static assets and a
 * generated manifest are copied into dist/<target>/.
 *
 *   node scripts/build.mjs [--target=chrome|firefox] [--watch] [--dev]
 */
import * as esbuild from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createManifest } from './manifest.mjs'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const args = new Set(process.argv.slice(2))
const target = [...args].find(a => a.startsWith('--target='))?.split('=')[1] ?? 'chrome'
const watch = args.has('--watch')
const dev = args.has('--dev') || watch
const out = path.join(root, 'dist', target)
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))

const common = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: ['chrome116', 'firefox128'],
  alias: { '@': path.join(root, 'src') },
  define: {
    __MARKSCOPE_VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
}

const builds = [
  // Content script: classic script, no imports allowed.
  {
    ...common,
    entryPoints: { content: 'src/content/index.ts' },
    format: 'iife',
    outdir: path.join(out, 'js'),
  },
  {
    ...common,
    entryPoints: { background: 'src/background/index.ts' },
    format: 'esm',
    outdir: path.join(out, 'js'),
  },
  {
    ...common,
    entryPoints: { 'render-worker': 'src/engine/worker.ts' },
    format: 'esm',
    outdir: path.join(out, 'js'),
  },
  // Pages share chunks; Mermaid/Graphviz are split out and lazy-loaded.
  {
    ...common,
    entryPoints: {
      viewer: 'src/viewer/index.ts',
      popup: 'src/popup/index.ts',
      options: 'src/options/index.ts',
    },
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    outdir: path.join(out, 'js'),
  },
  {
    ...common,
    entryPoints: {
      viewer: 'src/styles/viewer.css',
      popup: 'src/styles/popup.css',
      options: 'src/styles/options.css',
      document: 'src/styles/document.css',
    },
    outdir: path.join(out, 'css'),
    loader: { '.css': 'css' },
  },
]

async function copyStatic() {
  await mkdir(out, { recursive: true })
  for (const page of ['viewer.html', 'popup.html', 'options.html']) {
    await cp(path.join(root, 'src/pages', page), path.join(out, page))
  }
  await cp(path.join(root, 'src/_locales'), path.join(out, '_locales'), {
    recursive: true,
  })
  await cp(path.join(root, 'src/icons'), path.join(out, 'icons'), { recursive: true })
  await cp(path.join(root, 'src/samples'), path.join(out, 'samples'), { recursive: true })
  await mkdir(path.join(out, 'vendor/katex'), { recursive: true })
  await cp(
    path.join(root, 'node_modules/katex/dist/katex.min.css'),
    path.join(out, 'vendor/katex/katex.min.css'),
  )
  await cp(
    path.join(root, 'node_modules/katex/dist/fonts'),
    path.join(out, 'vendor/katex/fonts'),
    {
      recursive: true,
      filter: src => !/\.(ttf|woff)$/.test(src), // woff2 is supported everywhere we run
    },
  )
  const manifest = createManifest({ version: pkg.version, target })
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

function report(results) {
  const sizes = {}
  for (const r of results) {
    for (const [file, info] of Object.entries(r.metafile?.outputs ?? {})) {
      sizes[path.relative(out, path.resolve(root, file))] = info.bytes
    }
  }
  const rows = Object.entries(sizes).sort((a, b) => b[1] - a[1])
  const kb = n => `${(n / 1024).toFixed(1).padStart(8)} KB`
  console.log(`\nMarkscope ${pkg.version} → dist/${target}`)
  for (const [file, bytes] of rows
    .filter(([f]) => !f.includes('chunks/'))
    .concat(rows.filter(([f]) => f.includes('chunks/')).slice(0, 6))) {
    console.log(`  ${kb(bytes)}  ${file}`)
  }
  const chunkCount = rows.filter(([f]) => f.includes('chunks/')).length
  console.log(
    `  (+ ${chunkCount} lazy chunks, total ${kb(rows.reduce((s, [, b]) => s + b, 0)).trim()})`,
  )
}

await rm(out, { recursive: true, force: true })
if (watch) {
  const contexts = await Promise.all(builds.map(b => esbuild.context(b)))
  await copyStatic()
  await Promise.all(contexts.map(c => c.watch()))
  console.log(`Watching… output in dist/${target}`)
} else {
  const results = await Promise.all(builds.map(b => esbuild.build(b)))
  await copyStatic()
  report(results)
}
