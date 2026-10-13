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
const { renderPublicPage, renderNotFoundPage, publicPages } =
  await import('../.prerender/entry-server.js')
validatePublicPages(publicPages)
const template = await readFile('dist/index.html', 'utf8')
const routeTree = await readFile('src/routeTree.gen.ts', 'utf8')
const nginx = await readFile('../../deploy/nginx.conf', 'utf8')
assertPrivateRouteCoverage(nginx, routeTree, publicPages)
await stat(`dist${socialImagePath}`)
await writeFile('dist/app.html', buildPrivateShell(template))

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
  if (!html.includes('Get started') || !html.includes('data-prerendered'))
    throw new Error(`Public content missing: ${page.path}`)
  const document = buildPublicDocument({
    template,
    html,
    page,
    styles: [...collectStyles(page.manifest)],
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
    styles: [...collectStyles(publicPages[0].manifest)],
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
  `Prerendered ${publicPages.length} public pages and 404 without network access; indexing ${config.indexable ? 'enabled for public allowlist' : 'disabled'}; private app shell remains noindex`
)
