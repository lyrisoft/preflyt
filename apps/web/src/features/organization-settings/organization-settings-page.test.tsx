import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { OrganizationSettingsPage } from './organization-settings-page'

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  save: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: state.save }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { organizationId: 'org' },
  }),
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
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/apps'>{children}</a>
  ),
}))
vi.mock('@/components/layout/main', () => ({
  Main: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
beforeEach(() => {
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
