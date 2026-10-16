import { readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import {
  assertPrivateRouteCoverage,
  buildPrivateShell,
  buildPublicDocument,
  readPublicBuildConfig,
  renderRobots,
  renderSitemap,
  socialImagePath,
  validatePublicPages,
} from './public-build.mjs'

// No credentials, private workspace data or network requests enter public HTML.
globalThis.fetch = () => {
  throw new Error('Network access is forbidden during public prerendering')
}
const config = readPublicBuildConfig()
const { renderPublicPage, renderNotFoundPage, publicPages, websiteMode } =
  await import('../.prerender/entry-server.js')
validatePublicPages(publicPages)
const template = await readFile('dist/index.html', 'utf8')
const routeTree = await readFile('src/routeTree.gen.ts', 'utf8')
const nginx = await readFile('../../deploy/nginx.conf', 'utf8')
if (!websiteMode) assertPrivateRouteCoverage(nginx, routeTree, publicPages)
await stat(`dist${socialImagePath}`)
if (!websiteMode) await writeFile('dist/app.html', buildPrivateShell(template))

// Route-split styles must be available before JavaScript or hydration begins.
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
function collectStyles(key, css = new Set(), seen = new Set()) {
  if (seen.has(key)) return css
  seen.add(key)
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Missing build manifest entry: ${key}`)
  for (const file of chunk.css || []) css.add(file)
  for (const dependency of chunk.imports || [])
    collectStyles(dependency, css, seen)
  return css
}
for (const page of publicPages) {
  const html = await renderPublicPage(page.path)
  if (
    !/<h1(?:\s[^>]*)?>[\s\S]*?\S[\s\S]*?<\/h1>/.test(html) ||
    !html.includes('<main id="main"') ||
    !html.includes('data-prerendered')
  )
    throw new Error(`Public content missing: ${page.path}`)
  const document = buildPublicDocument({
    template,
    html,
    page,
    styles: [...collectStyles(websiteMode ? 'index.html' : page.manifest)],
    config,
  })
  const directory = page.path === '/' ? 'dist' : `dist${page.path}`
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/index.html`, document)
}

const missing = await renderNotFoundPage()
await writeFile(
  'dist/404.html',
  buildPublicDocument({
    template,
    html: missing,
    page: {
      path: '/page-not-found',
      title: 'Page not found | Preflyt',
      description:
        'This page could not be found. Explore Preflyt or return to the homepage.',
    },
    styles: [...collectStyles(websiteMode ? 'index.html' : publicPages[0].manifest)],
    config,
    notFound: true,
  })
)
await writeFile('dist/robots.txt', renderRobots(publicPages, config))
const sitemap = renderSitemap(publicPages, config)
if (sitemap) await writeFile('dist/sitemap.xml', sitemap)
else await rm('dist/sitemap.xml', { force: true })
await rm('.prerender', { recursive: true, force: true })
console.log(
  `Prerendered ${publicPages.length} public pages and 404 without network access; indexing ${config.indexable ? 'enabled for public allowlist' : 'disabled'}; ${websiteMode ? 'website only, no private app shell' : 'private app shell remains noindex'}`
)

if (websiteMode) {
  const { existsSync } = await import('node:fs')
  if (existsSync('dist/app.html')) throw new Error('Website build must not contain an application shell')
  for (const chunk of Object.values(manifest)) {
    if (!chunk.file?.endsWith('.js')) continue
    const js = await readFile(`dist/${chunk.file}`, 'utf8')
    if (['/auth/session', '/super-admin/login', '/sign-in'].some(path => js.includes(path)))
      throw new Error('Authentication code leaked into website build')
  }
  for (const page of publicPages) {
    const file = page.path === '/' ? 'dist/index.html' : `dist${page.path}/index.html`
    const html = await readFile(file, 'utf8')
    if (/href=["']\/(?:sign-in|overview|setup|super-admin\/login)(?:["'?#/])/.test(html))
      throw new Error(`Application link leaked into website HTML: ${page.path}`)
  }
  console.log('Verified website artifact: no application shell, auth code or workspace links')
}
