/**
 * VS Code target: dist/vscode/ is a complete extension folder (package.json,
 * extension.js, webview assets, README, icon) that `vsce package` zips.
 *
 *   node scripts/build.mjs --target=vscode [--watch] [--dev]
 */
import * as esbuild from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createVscodeManifest } from './vscode-manifest.mjs'

/** Placeholder until the publisher id is chosen; override with VSCODE_PUBLISHER. */
const DEFAULT_PUBLISHER = 'AbdallahSaeed'

export async function buildVscode({ root, pkg, watch, dev }) {
  const out = path.join(root, 'dist', 'vscode')
  const webview = path.join(out, 'webview')
  const common = {
    bundle: true,
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    alias: { '@': path.join(root, 'src') },
    define: {
      __MARKSCOPE_VERSION__: JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    },
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  }
  // VS Code 1.90 ships Electron 29 (Chromium 122) and Node 20.
  const browser = { ...common, target: ['chrome120'] }

  const builds = [
    {
      ...common,
      target: ['node20'],
      platform: 'node',
      format: 'cjs',
      external: ['vscode'],
      entryPoints: { extension: 'src/vscode/extension/extension.ts' },
      outdir: out,
    },
    {
      // Lazy chunks (Mermaid, Graphviz) land next to preview.js and import relative to it.
      ...browser,
      format: 'esm',
      splitting: true,
      chunkNames: 'chunks/[name]-[hash]',
      entryPoints: { preview: 'src/vscode/webview/index.ts' },
      outdir: path.join(webview, 'js'),
    },
    {
      // One self-contained file: the webview runs it from a blob.
      ...browser,
      format: 'esm',
      entryPoints: { 'render-worker': 'src/engine/worker.ts' },
      outdir: path.join(webview, 'js'),
    },
    {
      ...browser,
      entryPoints: {
        viewer: 'src/styles/viewer.css',
        document: 'src/styles/document.css',
        vscode: 'src/styles/vscode.css',
      },
      outdir: path.join(webview, 'css'),
      loader: { '.css': 'css' },
    },
  ]

  async function copyStatic() {
    await mkdir(out, { recursive: true })
    await cp(path.join(root, 'src/icons/icon-256.png'), path.join(out, 'icon.png'))
    await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
    await cp(path.join(root, 'src/vscode/README.md'), path.join(out, 'README.md'))
    await cp(path.join(root, 'CHANGELOG.md'), path.join(out, 'CHANGELOG.md'))
    const katex = path.join(webview, 'vendor/katex')
    await mkdir(katex, { recursive: true })
    await cp(
      path.join(root, 'node_modules/katex/dist/katex.min.css'),
      path.join(katex, 'katex.min.css'),
    )
    await cp(
      path.join(root, 'node_modules/katex/dist/fonts'),
      path.join(katex, 'fonts'),
      {
        recursive: true,
        filter: src => !/\.(ttf|woff)$/.test(src),
      },
    )
    const manifest = createVscodeManifest({
      version: pkg.version,
      publisher: process.env.VSCODE_PUBLISHER || DEFAULT_PUBLISHER,
    })
    await writeFile(path.join(out, 'package.json'), JSON.stringify(manifest, null, 2))
  }

  await rm(out, { recursive: true, force: true })
  if (watch) {
    const contexts = await Promise.all(builds.map(b => esbuild.context(b)))
    await copyStatic()
    await Promise.all(contexts.map(c => c.watch()))
    console.log('Watching… output in dist/vscode')
    return
  }
  const results = await Promise.all(builds.map(b => esbuild.build(b)))
  await copyStatic()
  const bytes = Object.values(
    Object.assign({}, ...results.map(r => r.metafile?.outputs ?? {})),
  ).reduce((sum, o) => sum + o.bytes, 0)
  console.log(
    `\nMarkscope ${pkg.version} → dist/vscode (${(bytes / 1024 / 1024).toFixed(1)} MB of bundles)`,
  )
}
