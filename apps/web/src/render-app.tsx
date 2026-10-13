import { StrictMode } from 'react'
import { createRoot, hydrateRoot, type RootOptions } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import type { createAppRouter } from './app'
import { legacyDashboardSearch } from './features/dashboard/search'

export async function renderApp(
  router: ReturnType<typeof createAppRouter>,
  container: HTMLElement,
  options: RootOptions = {}
) {
  const location = router.history.location
  // Static HTML has no request query. Legacy dashboard bookmarks must run
  // beforeLoad on the client so their filters reach the protected /overview.
  const legacyDashboard =
    location.pathname === '/' && legacyDashboardSearch(location.search)
  const content = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
  if (container.dataset.prerendered === 'true' && !legacyDashboard) {
    await hydrate(router)
    return hydrateRoot(container, content, options)
  }
  const root = createRoot(container, options)
  root.render(content)
  return root
}
