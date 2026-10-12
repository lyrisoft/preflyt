import { hydrateRoot } from 'react-dom/client'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createAppRouter } from './app'
import { publicPages } from './features/marketing/public-pages'

const generated = import.meta.glob('../dist/**/index.html', {
  query: '?raw',
  import: 'default',
})
afterEach(() => vi.unstubAllGlobals())

// Run after the production build: verifies real output, route boundaries and API independence.
it.skipIf(!generated['../dist/index.html']).each(publicPages)(
  'hydrates $path with its own metadata and no private queries',
  async (page) => {
    const key = `../dist${page.path === '/' ? '' : page.path}/index.html`
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
    await hydrate(router)
    const root = hydrateRoot(container, <RouterProvider router={router} />, {
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
