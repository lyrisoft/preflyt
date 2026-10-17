import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { OrganizationSettingsPage } from './organization-settings-page'

vi.mock('@/features/installation-reporting/installation-reporting', () => ({
  InstallationReportingSettings: () => (
    <section>Installation reporting settings</section>
  ),
}))

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  session: {
    isSuccess: true,
    data: {
      organizationId: 'org',
      platformAdmin: false,
      permissions: ['organization.members.manage'],
    },
  },
  save: vi.fn(),
  initialTab: undefined as string | undefined,
  identityLink: undefined as string | undefined,
  changeTab: (_tab: string | undefined) => {},
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: state.save }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => state.session,
}))
vi.mock('./github-identity-link', () => ({
  GitHubIdentityLink: () => <section>GitHub account linking</section>,
}))
vi.mock('./configuration-panel', () => ({
  ConfigurationPanel: () => <section>System settings controls</section>,
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))
vi.mock('@/features/notifications/organization-notification-channels', () => ({
  OrganizationNotificationChannels: () => (
    <section>Organization notification channels</section>
  ),
}))
vi.mock('@/features/notifications/notification-preferences', () => ({
  NotificationPreferences: () => (
    <section>Existing notification preferences</section>
  ),
}))
vi.mock('@tanstack/react-router', async () => {
  const { useState } = await import('react')
  return {
    getRouteApi: () => ({
      useSearch: () => {
        const [tab, setTab] = useState(state.initialTab)
        state.changeTab = setTab
        return { tab, identityLink: state.identityLink }
      },
    }),
    useNavigate:
      () =>
      ({ search }: { search: (previous: object) => { tab: string } }) =>
        state.changeTab(search({}).tab),
    Link: ({
      children,
      className,
    }: {
      children: React.ReactNode
      className?: string
    }) => (
      <a href='/repositories' className={className}>
        {children}
      </a>
    ),
  }
})
beforeEach(() => {
  state.identityLink = undefined
  state.initialTab = 'workspace'
  state.session = {
    isSuccess: true,
    data: {
      organizationId: 'org',
      platformAdmin: false,
      permissions: ['organization.members.manage'],
    },
  }
  state.query = {
    data: {
      id: 'org',
      name: 'Workspace',
      githubOrganization: 'lyrisoft',
      role: 'OWNER',
      canUpdate: true,
      createdAt: '2026-10-10T00:00:00Z',
    },
    refetch: vi.fn(),
  }
  state.save.mockReset()
})
it('requires a changed nonblank workspace name before saving', async () => {
  const view = await render(<OrganizationSettingsPage />)
  await expect
    .element(view.getByRole('button', { name: 'Save changes' }))
    .toBeDisabled()
  await view.getByLabelText('Workspace name').fill('Updated workspace')
  await view.getByRole('button', { name: 'Save changes' }).click()
  expect(state.save).toHaveBeenCalledOnce()
})
it('keeps administrator workspace settings read-only according to backend permissions', async () => {
  state.query = {
    data: {
      id: 'org',
      name: 'Workspace',
      githubOrganization: 'lyrisoft',
      role: 'ADMIN',
      canUpdate: false,
      createdAt: '2026-10-10T00:00:00Z',
    },
    refetch: vi.fn(),
  }
  const view = await render(<OrganizationSettingsPage />)
  await expect.element(view.getByLabelText('Workspace name')).toBeDisabled()
  await expect
    .element(view.getByRole('button', { name: 'Save changes' }))
    .not.toBeInTheDocument()
  await view.getByRole('tab', { name: 'Notifications' }).click()
  await expect
    .element(view.getByText('Existing notification preferences'))
    .toBeVisible()
  await expect
    .element(view.getByText('Organization notification channels'))
    .toBeVisible()
})

it('keeps deployment configuration available to Super Admin when workspace settings are unavailable', async () => {
  state.session.data.platformAdmin = true
  state.query = {
    isError: true,
    error: new Error('No workspace selected'),
    refetch: vi.fn(),
  }
  const view = await render(<OrganizationSettingsPage />)
  await view.getByRole('tab', { name: 'Configuration' }).click()
  await expect.element(view.getByText('System settings controls')).toBeVisible()
})
it('hides deployment configuration from organization administrators', async () => {
  const view = await render(<OrganizationSettingsPage />)
  await expect
    .element(view.getByRole('tab', { name: 'Configuration' }))
    .not.toBeInTheDocument()
})

it('keeps workspace settings readable across themes and viewport sizes', async () => {
  state.session.data.platformAdmin = true
  await page.viewport(1440, 1000)
  const view = await render(<OrganizationSettingsPage />)
  await expect
    .element(view.getByRole('heading', { name: 'Workspace identity' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('heading', { name: 'Workspace details' }))
    .toBeVisible()
  await expect
    .poll(() => {
      const headings = [...document.querySelectorAll('h2')]
      const identity = headings
        .find((h) => h.textContent === 'Workspace identity')
        ?.closest('form')
        ?.getBoundingClientRect()
      const details = headings
        .find((h) => h.textContent === 'Workspace details')
        ?.closest('section')
        ?.getBoundingClientRect()
      return (
        !!identity &&
        !!details &&
        Math.abs(identity.top - details.top) < 1 &&
        Math.abs(identity.height - details.height) < 1
      )
    })
    .toBe(true)
  try {
    for (const mobile of [false, true]) {
      await page.viewport(mobile ? 390 : 1440, mobile ? 844 : 1000)
      for (const dark of [false, true]) {
        if (mobile) await page.viewport(390, 844)
        document.documentElement.classList.toggle('dark', dark)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            )
            .map((animation) => animation.finished.catch(() => undefined))
        )
        await expect
          .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
          .toBe(true)
        if (mobile) {
          // Extend the fixture frame after checking the phone viewport so Playwright
          // captures the complete narrow layout without iframe clipping.
          await page.viewport(
            390,
            Math.max(844, document.documentElement.scrollHeight)
          )
        }
        await page.screenshot({
          path: `__screenshots__/settings-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}.png`,
        })
      }
    }
  } finally {
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})

it('opens a configuration deep link only for the deployment admin', async () => {
  state.initialTab = 'configuration'
  const ordinary = await render(<OrganizationSettingsPage />)
  await expect
    .element(ordinary.getByText('System settings controls'))
    .not.toBeInTheDocument()
  await ordinary.unmount()
  state.session.data.platformAdmin = true
  const admin = await render(<OrganizationSettingsPage />)
  await expect
    .element(admin.getByText('System settings controls'))
    .toBeVisible()
})

it('opens personal notifications for readers and keeps settings focused on their contents', async () => {
  state.initialTab = undefined
  state.session.data.permissions = []
  const view = await render(<OrganizationSettingsPage />)
  await expect
    .element(view.getByRole('tab', { name: 'Notifications', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await expect
    .element(view.getByRole('tab', { name: 'Workspace', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('tab', { name: 'Appearance' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Notifications' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Configuration' }))
    .not.toBeInTheDocument()
})

it('keeps identity-link confirmation reachable without a management directory', async () => {
  state.identityLink = 'confirm'
  state.session.data.permissions = []
  const view = await render(<OrganizationSettingsPage />)
  await expect.element(view.getByText('GitHub account linking')).toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Notifications', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
})

it('opens workspace settings for managers and resolves old directory deep links', async () => {
  for (const initial of [undefined, 'manage']) {
    state.initialTab = initial
    const view = await render(<OrganizationSettingsPage />)
    await expect
      .element(view.getByRole('tab', { name: 'Workspace', exact: true }))
      .toHaveAttribute('aria-selected', 'true')
    await expect
      .element(view.getByRole('tab', { name: 'Manage', exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(view.getByText('Connections and administration'))
      .not.toBeInTheDocument()
    await view.unmount()
  }
})
