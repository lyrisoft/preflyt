import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { createAppRouter } from './app'
import { publicPages } from './features/marketing/public-pages'
import { renderApp } from './render-app'

const generated = import.meta.glob(
  ['../dist/**/index.html', '../dist/404.html'],
  {
    query: '?raw',
    import: 'default',
  }
)
afterEach(() => vi.unstubAllGlobals())

// Run after the production build: verifies real output, route boundaries and API independence.
it.skipIf(!generated['../dist/index.html']).each([
  ...publicPages.map((page) => ({ ...page, notFound: false })),
  {
    path: '/missing-public-page',
    title: 'Page not found | Preflyt',
    description:
      'This page could not be found. Explore Preflyt or return to the homepage.',
    notFound: true,
  },
])(
  'hydrates $path with its own metadata and no private queries',
  async (page) => {
    const key = page.notFound
      ? '../dist/404.html'
      : `../dist${page.path === '/' ? '' : page.path}/index.html`
    expect(
      generated[key],
      `Missing generated public page: ${page.path}`
    ).toBeDefined()
    const fetch = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify({ authenticated: false }), {
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetch)
    const html = (await generated[key]()) as string
    const markup = new DOMParser().parseFromString(html, 'text/html')
    expect(markup.title).toBe(page.title)
    expect(
      markup.querySelector('meta[name="description"]')?.getAttribute('content')
    ).toBe(page.description)
    const container = document.createElement('div')
    container.dataset.prerendered = 'true'
    container.innerHTML = markup.querySelector('#root')!.innerHTML
    document.body.append(container)
    const heading = container.querySelector('h1')
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    const errors: unknown[] = []
    const router = createAppRouter()
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [page.path] }),
    })
    Reflect.deleteProperty(window, '$_TSR')
    for (const source of markup.querySelectorAll(
      'script:not([src]):not([type="application/ld+json"])'
    )) {
      const script = document.createElement('script')
      script.textContent = source.textContent
      document.body.append(script)
      script.remove()
    }
    const root = await renderApp(router, container, {
      onRecoverableError: (error) => errors.push(error),
    })
    try {
      await expect
        .poll(() =>
          container.querySelector('.marketing-site')?.getAttribute('data-theme')
        )
        .toBeTruthy()
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(errors).toEqual([])
      expect(container.querySelector('h1')).toBe(heading)
      expect(router.state.location.pathname).toBe(page.path)
      if (page.notFound)
        expect(heading?.textContent).toBe('This path doesn’t lead anywhere.')
      expect(
        fetch.mock.calls.every(([url]) => String(url).endsWith('/auth/session'))
      ).toBe(true)
      expect(
        container.querySelector('a[href="/product/repository-health"]')
      ).not.toBeNull()
    } finally {
      root.unmount()
      container.remove()
    }
  }
)

it.skipIf(!generated['../dist/index.html'])(
  'migrates a prerendered legacy dashboard bookmark through sign-in with its filters',
  async () => {
    const html = (await generated['../dist/index.html']()) as string
    const markup = new DOMParser().parseFromString(html, 'text/html')
    const container = document.createElement('div')
    container.dataset.prerendered = 'true'
    container.innerHTML = markup.querySelector('#root')!.innerHTML
    document.body.append(container)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(url).endsWith('/auth/session')
                ? { authenticated: false }
                : { superAdmin: true, github: false, oidc: false }
            ),
            { headers: { 'Content-Type': 'application/json' } }
          )
      )
    )
    const router = createAppRouter()
    router.update({
      context: router.options.context,
      history: createMemoryHistory({
        initialEntries: ['/?tab=health&days=30&repository=1410129036'],
      }),
    })
    const root = await renderApp(router, container)
    try {
      await expect.poll(() => router.state.location.pathname).toBe('/sign-in')
      const target = new URL(
        String(router.state.location.search.redirect),
        'https://preflyt.test'
      )
      expect(target.pathname).toBe('/overview')
      expect(target.searchParams.get('tab')).toBe('health')
      expect(JSON.parse(target.searchParams.get('days')!)).toBe('30')
      expect(JSON.parse(target.searchParams.get('repository')!)).toBe(
        '1410129036'
      )
    } finally {
      root.unmount()
      container.remove()
    }
  }
)
