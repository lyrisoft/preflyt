import type { ComponentProps, ReactNode } from 'react'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { AppSidebar } from './layout/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from './ui/sidebar'

const state = vi.hoisted(() => ({
  href: '/policies',
  session: {
    role: 'ADMIN',
    platformAdmin: false,
    permissions: ['contributors.read'],
  },
}))
vi.mock('@/context/layout-provider', () => ({
  useLayout: () => ({ collapsible: 'icon', variant: 'sidebar' }),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({ data: state.session }),
}))
vi.mock('./layout/team-switcher', () => ({
  TeamSwitcher: () => <div>lyrisoft</div>,
}))
vi.mock('./layout/nav-user', () => ({
  NavUser: () => <div>Preflyt account</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { href: string }) => unknown
  }) => select({ href: state.href }),
  Link: ({
    to,
    children,
    onClick,
    ...props
  }: Omit<ComponentProps<'a'>, 'href'> & {
    to: string
    children: ReactNode
  }) => (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
    >
      {children}
    </a>
  ),
}))
const sidebar = () => (
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SidebarTrigger />
    </SidebarInset>
  </SidebarProvider>
)
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.href = '/policies'
  state.session = {
    role: 'ADMIN',
    platformAdmin: false,
    permissions: ['contributors.read'],
  }
})
it('shows familiar groups with direct links and no competing active entry', async () => {
  const view = await render(sidebar())
  for (const group of [
    'Workspace',
    'Governance',
    'Intelligence',
    'Administration',
  ])
    await expect.element(page.getByText(group, { exact: true })).toBeVisible()
  for (const [name, href] of [
    ['Assessments', '/assessments'],
    ['Policies', '/policies'],
    ['Merge Protection', '/quality-gates'],
    ['Standards', '/standards'],
    ['AI Intelligence', '/intelligence'],
    ['Skills', '/skills'],
    ['Integrations', '/integrations'],
    ['Teams', '/teams'],
  ]) {
    await expect
      .element(
        page.getByRole('link', {
          name,
          exact: !['AI Intelligence', 'Merge Protection'].includes(name),
        })
      )
      .toHaveAttribute('href', href)
  }
  expect(view.container.querySelectorAll('a[data-active=true]')).toHaveLength(1)
  await expect
    .element(page.getByRole('link', { name: 'Policies', exact: true }))
    .toHaveAttribute('data-active', 'true')
  await expect
    .element(page.getByRole('link', { name: 'Standards' }))
    .toHaveAttribute('data-active', 'false')
  await view.unmount()
})
it('keeps nested team and contributor routes under their own entries', async () => {
  for (const [href, entry] of [
    ['/teams/team-id', 'Teams'],
    ['/contributors/person', 'Contributors'],
    ['/repositories/123', 'Repositories'],
  ]) {
    state.href = href
    const view = await render(sidebar())
    await expect
      .element(page.getByRole('link', { name: entry, exact: true }))
      .toHaveAttribute('data-active', 'true')
    expect(view.container.querySelectorAll('a[data-active=true]')).toHaveLength(
      1
    )
    await view.unmount()
  }
})
it('preserves contributor and administration visibility without hiding personal settings', async () => {
  state.session = { role: 'VIEWER', platformAdmin: false, permissions: [] }
  const reader = await render(sidebar())
  await expect
    .element(page.getByRole('link', { name: 'Access Control' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'Contributors' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'Settings', exact: true }))
    .toBeVisible()
  await reader.unmount()
  state.session.platformAdmin = true
  const admin = await render(sidebar())
  await expect
    .element(page.getByRole('link', { name: 'Access Control' }))
    .toBeVisible()
  await admin.unmount()
})
it('keeps the restored mobile menu usable in both themes and closes it on navigation', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await render(sidebar())
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
    await expect
      .element(page.getByRole('link', { name: 'Skills', exact: true }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    const link = page.getByRole('link', { name: 'Skills', exact: true })
    link.element().focus()
    expect(document.activeElement).toBe(link.element())
    await link.click()
    await expect
      .element(page.getByRole('link', { name: 'Skills', exact: true }))
      .not.toBeInTheDocument()
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})
