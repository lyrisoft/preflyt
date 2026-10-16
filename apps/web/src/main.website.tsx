import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import './styles/index.css'
import { createAppRouter } from './website-router'

const router = createAppRouter()
const root = document.getElementById('root')!
const content = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
if (root.dataset.prerendered === 'true') {
  await hydrate(router)
  hydrateRoot(root, content)
} else {
  createRoot(root).render(content)
}
