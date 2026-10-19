import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  Sidebar,
  SidebarHeader,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TeamSwitcher } from './team-switcher'

vi.mock('@/features/access-control/organization-queries', () => ({
  useOrganizations: () => ({
    data: {
      activeOrganizationId: 'org',
      organizations: [{ id: 'org', name: 'lyrisoft', githubLogin: 'lyrisoft' }],
    },
    isPending: false,
    isError: false,
  }),
}))
for (const collapsed of [false, true]) {
  it(`shows a static organization identity with the sidebar ${collapsed ? 'collapsed' : 'expanded'}`, async () => {
    await page.viewport(1280, 900)
    await render(
      <SidebarProvider defaultOpen={!collapsed}>
        <Sidebar collapsible='icon'>
          <SidebarHeader>
            <TeamSwitcher />
          </SidebarHeader>
        </Sidebar>
      </SidebarProvider>
    )
    await expect
      .element(page.getByRole('group', { name: 'Current organization' }))
      .toBeVisible()
    expect(
      document.querySelector('[aria-label="Current organization"]')?.textContent
    ).toContain('lyrisoft')
    expect(
      document.querySelector('[aria-label="Current organization"]')?.textContent
    ).toContain('GitHub organization')
    expect(
      document.querySelector('[aria-label="Current organization"] button')
    ).toBeNull()
    expect(
      document.querySelector(
        '[aria-label="Current organization"] [aria-haspopup]'
      )
    ).toBeNull()
    expect(document.querySelector('.lucide-chevrons-up-down')).toBeNull()
  })
}
