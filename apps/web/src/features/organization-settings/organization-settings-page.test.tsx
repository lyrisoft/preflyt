import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { OrganizationSettingsPage } from './organization-settings-page'

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  session: {
    isSuccess: true,
    data: { organizationId: 'org', platformAdmin: false },
  },
  save: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: state.save }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => state.session,
}))
vi.mock('./configuration-panel', () => ({
  ConfigurationPanel: () => <section>System settings controls</section>,
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))
vi.mock('@/features/notifications/notification-preferences', () => ({
  NotificationPreferences: () => (
    <section>Existing notification preferences</section>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <a href='/apps' className={className}>
      {children}
    </a>
  ),
}))
beforeEach(() => {
  state.session = {
    isSuccess: true,
    data: { organizationId: 'org', platformAdmin: false },
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
