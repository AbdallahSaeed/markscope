/**
 * Builds the GitHub Pages site into _site/: landing page, privacy policy
 * (rendered from docs/PRIVACY.md — the single source of truth), logo and
 * store screenshots. Store links come from env vars once listings are live.
 *
 *   GITHUB_REPOSITORY=owner/markscope node scripts/build-site.mjs
 *   CHROME_STORE_URL=… FIREFOX_STORE_URL=…   (optional)
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import MarkdownIt from 'markdown-it'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const out = path.join(root, '_site')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const repo = process.env.GITHUB_REPOSITORY ?? 'OWNER/markscope'
const [owner, name] = repo.split('/')
const repoUrl = `https://github.com/${repo}`
const releaseUrl = `${repoUrl}/releases/latest`
const siteUrl = process.env.SITE_URL ?? `https://${owner.toLowerCase()}.github.io/${name}/`
const chromeUrl = process.env.CHROME_STORE_URL ?? ''
const firefoxUrl = process.env.FIREFOX_STORE_URL ?? ''

const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function storeCard(label, mark, detail, url) {
  const status = url
    ? '<span class="store-status is-live">Available</span>'
    : '<span class="store-status is-pending">In review</span>'
  const body = `<span class="store-mark" aria-hidden="true">${mark}</span><span class="store-text"><b>${label}</b><span>${detail}</span></span>${status}`
  return url ? `<a class="store" href="${escape(url)}">${body}</a>` : `<div class="store">${body}</div>`
}

const vars = {
  VERSION: pkg.version,
  REPO_URL: repoUrl,
  RELEASE_URL: releaseUrl,
  SITE_URL: siteUrl,
  HERO_CTA: chromeUrl
    ? `<a class="btn btn-primary" href="${escape(chromeUrl)}">Add to Chrome</a>`
    : `<a class="btn btn-primary" href="${releaseUrl}">Download v${pkg.version}</a>`,
  INSTALL_INTRO:
    chromeUrl || firefoxUrl
      ? 'Install from your browser’s store, or load a release build directly.'
      : 'Store listings are in review. Until they’re live, load the release build directly.',
  STORE_CARDS: [
    storeCard('Chrome Web Store', 'C', 'Chrome, Edge, Brave, Arc', chromeUrl),
    storeCard('Firefox Add-ons', 'F', 'Firefox 140+', firefoxUrl),
  ].join(''),
}
const fill = (html, extra = {}) =>
  html.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    const v = { ...vars, ...extra }[k]
    if (v === undefined) throw new Error(`Unknown template variable ${k}`)
    return v
  })

await rm(out, { recursive: true, force: true })
await mkdir(path.join(out, 'assets/screenshots'), { recursive: true })
for (const file of await readdir(path.join(root, 'site'))) {
  if (file.endsWith('.css')) await cp(path.join(root, 'site', file), path.join(out, file))
}
await cp(path.join(root, 'docs/store/screenshots'), path.join(out, 'assets/screenshots'), { recursive: true })
await cp(path.join(root, 'src/icons/logo.svg'), path.join(out, 'assets/logo.svg'))
await cp(path.join(root, 'src/icons/icon-128.png'), path.join(out, 'assets/icon-128.png'))
await writeFile(path.join(out, 'index.html'), fill(await readFile(path.join(root, 'site/index.html'), 'utf8')))

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
const page = await readFile(path.join(root, 'site/page.html'), 'utf8')
const privacy = md.render(await readFile(path.join(root, 'docs/PRIVACY.md'), 'utf8'))
await writeFile(path.join(out, 'privacy.html'), fill(page, { TITLE: 'Privacy policy', CONTENT: privacy }))
await writeFile(path.join(out, '.nojekyll'), '')
console.log(`site built → _site (${siteUrl})`)
