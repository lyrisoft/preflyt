import { hydrateRoot } from 'react-dom/client'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import { expect, it } from 'vitest'
import { createAppRouter } from './app'

const generated = import.meta.glob('../dist/index.html', {
  query: '?raw',
  import: 'default',
})

// Run after the production build: verifies the actual generated markup.
it.skipIf(!generated['../dist/index.html'])(
  'hydrates the generated public homepage without replacing its content',
  async () => {
    const html = (await generated['../dist/index.html']()) as string
    const markup = new DOMParser().parseFromString(html, 'text/html')
    const container = document.createElement('div')
    container.innerHTML = markup.querySelector('#root')!.innerHTML
    document.body.append(container)
    const heading = container.querySelector('h1')
    const errors: unknown[] = []
    const router = createAppRouter()
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
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
    } finally {
      root.unmount()
      container.remove()
    }
  }
)
