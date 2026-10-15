import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { publicPages } from '../src/features/marketing/public-pages.ts'
import {
  assertPrivateRouteCoverage,
  buildPrivateShell,
  buildPublicDocument,
  canonicalUrl,
  privateRoutePattern,
  readPublicBuildConfig,
  renderRobots,
  renderSitemap,
  validatePublicPages,
} from './public-build.mjs'

const published = readPublicBuildConfig({
  PUBLIC_SITE_URL: 'https://preflyt.example/',
  PUBLIC_SITE_INDEXABLE: 'true',
})
const preview = readPublicBuildConfig({})
const template = await readFile(
  new URL('../index.html', import.meta.url),
  'utf8'
)
const html = '<div id="root" data-prerendered="true"><h1>Preflyt</h1></div>'
const page = publicPages[0]

test('self-hosted and preview builds default to no indexing', () => {
  assert.deepEqual(preview, { origin: '', indexable: false })
  assert.equal(renderSitemap(publicPages, preview), null)
  assert.equal(
    renderRobots(publicPages, preview),
    'User-agent: *\nDisallow: /\n'
  )
})

test('indexing requires explicit true and a public HTTPS origin', () => {
  assert.throws(
    () => readPublicBuildConfig({ PUBLIC_SITE_INDEXABLE: 'true' }),
    /require PUBLIC_SITE_URL/
  )
  for (const value of ['1', 'TRUE', 'yes', '', 'true ']) {
    assert.throws(
      () => readPublicBuildConfig({ PUBLIC_SITE_INDEXABLE: value }),
      /exactly true or false/
    )
  }
})

test('invalid origins cannot enter canonicals or share metadata', () => {
  for (const origin of [
    'http://preflyt.example',
    'https://user:pass@preflyt.example',
    'https://preflyt.example/product',
    'https://preflyt.example/foo/../',
    'https://preflyt.example?token=value',
    'https://preflyt.example?',
    'https://preflyt.example/#fragment',
    'https://preflyt.example#',
    'https://pre\nflyt.example',
    'javascript:alert(1)',
    ' https://preflyt.example ',
  ]) {
    assert.throws(
      () => readPublicBuildConfig({ PUBLIC_SITE_URL: origin }),
      /HTTPS origin/
    )
  }
})

test('canonicals normalize the origin and retain consistent route slash policy', () => {
  assert.equal(published.origin, 'https://preflyt.example')
  assert.equal(canonicalUrl(published.origin, '/'), 'https://preflyt.example/')
  assert.equal(
    canonicalUrl(published.origin, '/product'),
    'https://preflyt.example/product'
  )
  assert.equal(canonicalUrl('', '/product'), '')
})

test('sitemap contains exactly the approved public routes', () => {
  validatePublicPages(publicPages)
  const sitemap = renderSitemap(publicPages, published)
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1]
  )
  assert.deepEqual(
    urls,
    publicPages.map((item) => canonicalUrl(published.origin, item.path))
  )
  for (const privatePath of [
    '/overview',
    '/sign-in',
    '/repositories/42',
    '/setup',
    '/settings',
  ]) {
    assert.ok(!sitemap.includes(privatePath))
  }
})

test('robots advertises only public pages and their query variants', () => {
  const robots = renderRobots(publicPages, published)
  assert.ok(robots.includes('Disallow: /'))
  assert.ok(robots.includes('Allow: /product/repository-health$'))
  assert.ok(robots.includes('Allow: /product?'))
  assert.ok(robots.includes('Allow: /product/$'))
  assert.ok(robots.includes('Allow: /assets/'))
  assert.ok(robots.includes('Allow: /images/'))
  assert.ok(robots.includes('Sitemap: https://preflyt.example/sitemap.xml'))
  assert.ok(!robots.includes('Allow: /overview'))
})

test('public allowlist rejects duplicate, parameterized, external and slash-variant URLs', () => {
  assert.throws(
    () => validatePublicPages([page, page]),
    /duplicate public page/
  )
  for (const path of [
    '/product/',
    '//preflyt.example',
    '/repository/$id',
    '/product?x=1',
  ]) {
    assert.throws(
      () => validatePublicPages([page, { ...page, path }]),
      /Invalid/
    )
  }
})

test('every public document has unique title, share image and canonical metadata', () => {
  for (const item of publicPages) {
    const document = buildPublicDocument({
      template,
      html,
      page: item,
      config: published,
    })
    assert.ok(document.includes(`<title>${item.title}</title>`))
    assert.ok(
      document.includes(
        `rel="canonical" href="${canonicalUrl(published.origin, item.path)}"`
      )
    )
    assert.ok(
      document.includes(
        'property="og:image" content="https://preflyt.example/images/social/preflyt.png"'
      )
    )
    assert.ok(
      document.includes('name="twitter:card" content="summary_large_image"')
    )
    assert.ok(document.includes('property="og:image:width" content="1200"'))
    assert.equal([...document.matchAll(/name="description"/g)].length, 1)
    assert.equal([...document.matchAll(/property="og:title"/g)].length, 1)
    assert.equal([...document.matchAll(/rel="canonical"/g)].length, 1)
    assert.ok(document.includes('"@type":"WebPage"'))
  }
})

test('preview pages do not invent a public canonical origin', () => {
  const document = buildPublicDocument({
    template,
    html,
    page,
    config: preview,
  })
  assert.ok(document.includes('content="noindex, nofollow"'))
  assert.ok(!document.includes('rel="canonical"'))
  assert.ok(!document.includes('property="og:url"'))
})

test('private app shell strips public discovery data and is always noindex', () => {
  const document = buildPrivateShell(template)
  assert.ok(document.includes('<title>Preflyt workspace</title>'))
  assert.ok(document.includes('content="noindex, nofollow"'))
  assert.ok(document.includes('<div id="root"></div>'))
  assert.ok(!document.includes('og:title'))
  assert.ok(!document.includes('application/ld+json'))
})

test('404 remains noindex and has no canonical or structured claims on indexable sites', () => {
  const document = buildPublicDocument({
    template,
    html,
    page,
    config: published,
    notFound: true,
  })
  assert.ok(document.includes('content="noindex, nofollow"'))
  assert.ok(!document.includes('rel="canonical"'))
  assert.ok(!document.includes('application/ld+json'))
})

test('metadata safely escapes attributes and prevents script termination', () => {
  const injected = {
    ...page,
    title: 'Preflyt " & <stuff>',
    description: '</script><script>alert(1)</script>',
  }
  const document = buildPublicDocument({
    template,
    html,
    page: injected,
    config: published,
  })
  assert.ok(document.includes('Preflyt &quot; &amp; &lt;stuff&gt;'))
  assert.ok(document.includes('\\u003c/script>'))
  // Negative assertion: the attacker-controlled script must never appear in generated HTML.
  assert.ok(!document.includes('</script><script>alert(1)</script>'))
})

test('generated private routing handles actual deep links but not unknown public paths', async () => {
  const routes = await readFile(
    new URL('../src/routeTree.gen.ts', import.meta.url),
    'utf8'
  )
  const nginx = await readFile(
    new URL('../../../deploy/nginx.conf', import.meta.url),
    'utf8'
  )
  assertPrivateRouteCoverage(nginx, routes, publicPages)
  const match = new RegExp(privateRoutePattern(routes, publicPages))
  for (const path of [
    '/overview',
    '/overview/',
    '/repositories',
    '/repositories/',
    '/apps',
    '/repositories/42',
    '/findings/example',
    '/contributors/example',
    '/super-admin/login',
    '/settings/appearance',
    '/setup',
    '/github-onboarding',
  ])
    assert.ok(match.test(path), path)
  for (const path of [
    '/',
    '/product',
    '/self-hosting',
    '/product/missing',
    '/random',
    '/images/missing.png',
    '/repositories/42/missing',
    '/settings/random',
  ])
    assert.ok(!match.test(path), path)
})

test('routing audit detects future private routes omitted from the deployment config', async () => {
  const routes = await readFile(
    new URL('../src/routeTree.gen.ts', import.meta.url),
    'utf8'
  )
  const nginx = await readFile(
    new URL('../../../deploy/nginx.conf', import.meta.url),
    'utf8'
  )
  assert.throws(
    () =>
      assertPrivateRouteCoverage(
        nginx,
        routes.replace(
          'export interface FileRoutesByTo {',
          "export interface FileRoutesByTo {\n  '/new-private-route': typeof IndexRoute"
        ),
        publicPages
      ),
    /out of date/
  )
})
