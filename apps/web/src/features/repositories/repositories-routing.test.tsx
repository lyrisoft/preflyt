import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { Route as legacyRoute } from '@/routes/_authenticated/apps/index'
import { expect, it } from 'vitest'
import { repositoriesSearchSchema } from './repositories-search'

it.each([
  ['/apps', {}, ''],
  [
    '/apps/?github=connected&account=lyrisoft#connection',
    { github: 'connected', account: 'lyrisoft' },
    'connection',
  ],
  ['/apps?github=error', { github: 'error' }, ''],
])(
  'redirects legacy URL %s to repositories with validated feedback intact',
  async (url, search, hash) => {
    const root = createRootRoute()
    const legacy = createRoute({
      getParentRoute: () => root,
      path: '/apps',
      validateSearch: repositoriesSearchSchema,
      beforeLoad: (context) =>
        legacyRoute.options.beforeLoad!(context as never),
    })
    const repositories = createRoute({
      getParentRoute: () => root,
      path: '/repositories',
      validateSearch: repositoriesSearchSchema,
    })
    const router = createRouter({
      routeTree: root.addChildren([legacy, repositories]),
      history: createMemoryHistory({ initialEntries: [url] }),
    })
    await router.load()
    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/repositories')
    expect(router.state.location.search).toEqual(search)
    expect(router.state.location.hash).toBe(hash)
    expect(router.history.location.href).not.toContain('/apps')
  }
)
