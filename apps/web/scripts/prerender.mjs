import { readFile, writeFile, rm } from 'node:fs/promises'
import { renderHomepage } from '../.prerender/entry-server.js'

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
const html = await renderHomepage()
if (!html.includes('Engineering') || !html.includes('Get started') || !html.includes('data-prerendered')) throw new Error('Public content missing from rendered HTML')
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
collect('src/routes/index.tsx?tsr-split=component')
const styles = [...css].filter(file => !template.includes(`/${file}`)).map(file => `<link rel="stylesheet" href="/${file}">`).join('\n')
const canonical = siteUrl ? `<link rel="canonical" href="${new URL('/', siteUrl).href}"><meta property="og:url" content="${new URL('/', siteUrl).href}">` : ''
let homepage = (indexable ? template : privateShell)
  .replace('<div id="root"></div>', html)
  .replace('</head>', `${styles}\n${canonical}\n</head>`)
// The rendered page already provides useful content without JavaScript.
homepage = homepage.replace(/<noscript>[\s\S]*?<\/noscript>/, '')
await writeFile('dist/index.html', homepage)
await writeFile('dist/robots.txt', indexable ? 'User-agent: *\nAllow: /$\nDisallow: /\n' : 'User-agent: *\nDisallow: /\n')
await rm('.prerender', { recursive: true, force: true })
console.log('Prerendered / without network access; retained noindex private app.html shell')
