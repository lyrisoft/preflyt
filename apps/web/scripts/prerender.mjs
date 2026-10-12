import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { renderPublicPage, publicPages } from '../.prerender/entry-server.js'

// Public builds never need credentials, private workspace data, or an API.
globalThis.fetch = () => { throw new Error('Network access is forbidden during public prerendering') }
const siteUrl = process.env.PUBLIC_SITE_URL || ''
const indexable = process.env.PUBLIC_SITE_INDEXABLE === 'true'
if (siteUrl) {
  const url = new URL(siteUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('PUBLIC_SITE_URL must be an HTTPS origin without credentials, path, query or fragment')
}
if (indexable && !siteUrl) throw new Error('Indexable builds require PUBLIC_SITE_URL')
const template = await readFile('dist/index.html', 'utf8')
const privateShell = template.replace('content="index, follow, max-image-preview:large"', 'content="noindex, nofollow"')
await writeFile('dist/app.html', privateShell)
// Include route-split CSS before first paint, including when JavaScript is disabled.
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
const css = new Set()
const seen = new Set()
function collect(key) {
  if (seen.has(key)) return
  seen.add(key)
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Missing build manifest entry: ${key}`)
  for (const file of chunk.css || []) css.add(file)
  for (const dependency of chunk.imports || []) collect(dependency)
}
for (const page of publicPages) {
  const html = await renderPublicPage(page.path)
  if (!html.includes('Get started') || !html.includes('data-prerendered')) throw new Error(`Public content missing: ${page.path}`)
  css.clear()
  seen.clear()
  collect(page.manifest)
  const styles = [...css].filter(file => !template.includes(`/${file}`)).map(file => `<link rel="stylesheet" href="/${file}">`).join('\n')
  const canonical = siteUrl ? `<link rel="canonical" href="${new URL(page.path, siteUrl).href}"><meta property="og:url" content="${new URL(page.path, siteUrl).href}">` : ''
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  let homepage = (indexable ? template : privateShell)
    .replace('<div id="root"></div>', html)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/(<meta\s+(?:name|property)="(?:title|og:title|twitter:title)"\s+content=")[^"]*("\s*\/>)/g, `$1${escape(page.title)}$2`)
    .replace(/(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")[^"]*("\s*\/>)/g, `$1${escape(page.description)}$2`)
    .replace('</head>', `${styles}\n${canonical}\n</head>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
  const directory = page.path === '/' ? 'dist' : `dist${page.path}`
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/index.html`, homepage)
}
const allows = publicPages.map(page => `Allow: ${page.path}$`).join('\n')
await writeFile('dist/robots.txt', indexable ? `User-agent: *\n${allows}\nDisallow: /\n` : 'User-agent: *\nDisallow: /\n')
await rm('.prerender', { recursive: true, force: true })
console.log(`Prerendered ${publicPages.length} public pages without network access; retained noindex private app.html shell`)
