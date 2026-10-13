/** Pure helpers shared by the public build and its configuration tests. */
export const socialImagePath = '/images/social/preflyt.png'
export const publicRobots = 'index, follow, max-image-preview:large'
export const privateRobots = 'noindex, nofollow'

export function readPublicBuildConfig(env = process.env) {
  const setting = env.PUBLIC_SITE_INDEXABLE ?? 'false'
  if (setting !== 'true' && setting !== 'false') {
    throw new Error('PUBLIC_SITE_INDEXABLE must be exactly true or false')
  }
  const indexable = setting === 'true'
  const input = env.PUBLIC_SITE_URL ?? ''
  let origin = ''
  if (input) {
    let url
    try {
      url = new URL(input)
    } catch {
      throw new Error('PUBLIC_SITE_URL must be an HTTPS origin')
    }
    if (
      !/^https:\/\/[^/?#\s\\]+\/?$/i.test(input) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      input.trim() !== input
    ) {
      throw new Error(
        'PUBLIC_SITE_URL must be an HTTPS origin without credentials, path, query or fragment'
      )
    }
    origin = url.origin
  }
  if (indexable && !origin)
    throw new Error('Indexable builds require PUBLIC_SITE_URL')
  return { origin, indexable }
}

export function validatePublicPages(pages) {
  const paths = new Set()
  for (const page of pages) {
    if (
      !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page.path) ||
      !page.title ||
      !page.description ||
      !page.manifest ||
      paths.has(page.path)
    ) {
      throw new Error(`Invalid or duplicate public page: ${page.path}`)
    }
    paths.add(page.path)
  }
  if (!paths.has('/'))
    throw new Error('The public page allowlist must contain the homepage')
  return pages
}

export function privateRoutePattern(routeTree, pages) {
  const block = routeTree.match(
    /export interface FileRoutesByTo \{([\s\S]*?)\n\}/
  )?.[1]
  if (!block) throw new Error('Cannot read the generated route tree')
  const publicPaths = new Set(pages.map((page) => page.path))
  const privatePaths = [...block.matchAll(/^\s*'([^']+)':/gm)]
    .map((match) => match[1])
    .filter((path) => !publicPaths.has(path))
  if (!privatePaths.length)
    throw new Error('Cannot identify private application routes')
  const patterns = [...new Set(privatePaths)].sort().map((path) =>
    path
      .slice(1)
      .split('/')
      .map((segment) =>
        /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(segment)
          ? '[^/]+'
          : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('/')
  )
  return `^/(?:${patterns.join('|')})/?$`
}

export function assertPrivateRouteCoverage(nginx, routeTree, pages) {
  const pattern = privateRoutePattern(routeTree, pages)
  if (!nginx.includes(`location ~ ${pattern} {`)) {
    throw new Error(
      'Nginx private SPA route allowlist is out of date with routeTree.gen.ts'
    )
  }
}

export function canonicalUrl(origin, path) {
  return origin ? new URL(path, `${origin}/`).href : ''
}

export function escapeMarkup(value) {
  const entities = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }
  return value.replace(/[&"<>]/g, (character) => entities[character])
}

export function renderRobots(pages, config) {
  if (!config.indexable) return 'User-agent: *\nDisallow: /\n'
  // Permit canonical pages and their server redirects, without widening access
  // to unknown descendants or the private application.
  const allowed = pages
    .flatMap((page) =>
      page.path === '/'
        ? ['/', '/index.html']
        : [page.path, `${page.path}/`, `${page.path}/index.html`]
    )
    .flatMap((path) => [`Allow: ${path}$`, `Allow: ${path}?`])
    .join('\n')
  return `User-agent: *\n${allowed}\nAllow: /assets/\nAllow: /images/\nDisallow: /\n\nSitemap: ${config.origin}/sitemap.xml\n`
}

export function renderSitemap(pages, config) {
  if (!config.indexable) return null
  const urls = pages
    .map(
      (page) =>
        `  <url><loc>${escapeMarkup(canonicalUrl(config.origin, page.path))}</loc></url>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function stripDiscoveryMetadata(template) {
  return template
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(
      /<meta\b[^>]*(?:name|property)="(?:title|description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi,
      ''
    )
    .replace(/<link\b[^>]*rel="canonical"[^>]*>\s*/gi, '')
    .replace(
      /<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi,
      ''
    )
}

export function buildPrivateShell(template) {
  return stripDiscoveryMetadata(template).replace(
    '</head>',
    `<title>Preflyt workspace</title>\n<meta name="description" content="Sign in to your organization’s Preflyt workspace.">\n<meta name="robots" content="${privateRobots}">\n</head>`
  )
}

export function buildPublicDocument({
  template,
  html,
  page,
  styles = [],
  config,
  notFound = false,
}) {
  const canonical = notFound ? '' : canonicalUrl(config.origin, page.path)
  const image = canonicalUrl(config.origin, socialImagePath) || socialImagePath
  const title = escapeMarkup(page.title)
  const description = escapeMarkup(page.description)
  const robots = config.indexable && !notFound ? publicRobots : privateRobots
  const metadata = [
    `<title>${title}</title>`,
    `<meta name="title" content="${title}">`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Preflyt">',
    '<meta property="og:locale" content="en_US">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${escapeMarkup(image)}">`,
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Preflyt. Engineering confidence before production.">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${escapeMarkup(image)}">`,
    '<meta name="twitter:image:alt" content="Preflyt. Engineering confidence before production.">',
    ...styles
      .filter((file) => !template.includes(`/${file}`))
      .map((file) => `<link rel="stylesheet" href="/${escapeMarkup(file)}">`),
  ]
  if (canonical)
    metadata.push(
      `<link rel="canonical" href="${escapeMarkup(canonical)}">`,
      `<meta property="og:url" content="${escapeMarkup(canonical)}">`
    )
  if (!notFound) {
    const structured = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      ...(canonical
        ? {
            url: canonical,
            '@id': `${canonical}#webpage`,
            isPartOf: {
              '@type': 'WebSite',
              '@id': `${config.origin}/#website`,
              name: 'Preflyt',
              url: `${config.origin}/`,
            },
          }
        : {}),
    }
    metadata.push(
      `<script type="application/ld+json">${JSON.stringify(structured).replaceAll('<', '\\u003c')}</script>`
    )
  }
  const document = stripDiscoveryMetadata(template)
    .replace('<div id="root"></div>', html)
    .replace('</head>', `${metadata.join('\n')}\n</head>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
  if (!document.includes(html) || !document.includes('data-prerendered')) {
    throw new Error(`Prerendered root missing: ${page.path}`)
  }
  return document
}
