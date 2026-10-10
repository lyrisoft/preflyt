import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { SettingsLink } from './settings-link'

it('opens the Settings page instead of a layout drawer', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: SettingsLink,
  })
  const settings = createRoute({
    getParentRoute: () => root,
    path: '/organization-settings',
    component: () => <h1>Workspace settings</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, settings]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = await render(<RouterProvider router={router} />)
  await expect
    .element(view.getByRole('link', { name: 'Settings', exact: true }))
    .toHaveAttribute('href', '/organization-settings')
  await view.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect
    .element(view.getByRole('heading', { name: 'Workspace settings' }))
    .toBeVisible()
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
})
