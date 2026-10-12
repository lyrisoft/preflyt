import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import { createAppRouter } from './app'
import './styles/index.css'

const router = createAppRouter()
const root = document.getElementById('root')!
if (root.dataset.prerendered === 'true') {
  // Restore the route boundary state before hydrating the static homepage.
  void hydrate(router).then(() =>
    hydrateRoot(
      root,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )
  )
} else {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
