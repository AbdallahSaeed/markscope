/**
 * Builds the GitHub Pages site into _site/: landing page, privacy policy
 * (rendered from docs/PRIVACY.md — the single source of truth), screenshots
 * and icon. Store links are filled from env vars once listings are live.
 *
 *   GITHUB_REPOSITORY=owner/markscope node scripts/build-site.mjs
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import MarkdownIt from 'markdown-it'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const out = path.join(root, '_site')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const repo = process.env.GITHUB_REPOSITORY ?? 'OWNER/markscope'
const repoUrl = `https://github.com/${repo}`
const releaseUrl = `${repoUrl}/releases/latest`
const chromeUrl = process.env.CHROME_STORE_URL ?? ''
const firefoxUrl = process.env.FIREFOX_STORE_URL ?? ''

const vars = {
  VERSION: pkg.version,
  REPO_URL: repoUrl,
  RELEASE_URL: releaseUrl,
  CHROME_URL: chromeUrl || releaseUrl,
  CHROME_NOTE: chromeUrl ? '' : '· store review pending',
  CHROME_INSTALL_TEXT: chromeUrl
    ? 'Install from the Chrome Web Store (works in Edge too).'
    : 'The Chrome Web Store listing is in review. Until then, install from the release zip.',
  FIREFOX_URL: firefoxUrl || releaseUrl,
  FIREFOX_NOTE: firefoxUrl ? '' : '· review pending',
  FIREFOX_INSTALL_TEXT: firefoxUrl
    ? 'Install from Firefox Add-ons.'
    : 'The Firefox Add-ons listing is in review. The Firefox zip is attached to each release.',
}
const fill = (html, extra = {}) =>
  html.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    const v = { ...vars, ...extra }[k]
    if (v === undefined) throw new Error(`Unknown template variable ${k}`)
    return v
  })

await rm(out, { recursive: true, force: true })
await mkdir(path.join(out, 'assets'), { recursive: true })
await cp(path.join(root, 'site/styles.css'), path.join(out, 'styles.css'))
await cp(path.join(root, 'docs/store/screenshots'), path.join(out, 'assets'), { recursive: true })
await cp(path.join(root, 'src/icons/icon-128.png'), path.join(out, 'assets/icon-128.png'))
await writeFile(path.join(out, 'index.html'), fill(await readFile(path.join(root, 'site/index.html'), 'utf8')))

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
const page = await readFile(path.join(root, 'site/page.html'), 'utf8')
const privacy = md.render(await readFile(path.join(root, 'docs/PRIVACY.md'), 'utf8'))
await writeFile(path.join(out, 'privacy.html'), fill(page, { TITLE: 'Privacy policy', CONTENT: privacy }))
await writeFile(path.join(out, '.nojekyll'), '')
console.log(`site built → _site (repo ${repo})`)
