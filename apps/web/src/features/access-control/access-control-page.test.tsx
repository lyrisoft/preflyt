import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { AccessControlPage } from './access-control-page'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({ tab: 'people' }),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'admin',
      organizationId: 'org',
      role: 'ADMIN',
      permissions: ['organization.members.manage'],
    },
  }),
}))
afterEach(() => vi.unstubAllGlobals())
it('shows unavailable saved assignments and lets an admin explicitly remove one before saving', async () => {
  let saved: { repositoryIds: string[] } | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'PATCH') {
        saved = JSON.parse(String(init.body))
        return Response.json({ saved: true })
      }
      if (url.endsWith('/members'))
        return Response.json({
          audit: [],
          members: [
            {
              id: 'member',
              identity: {
                id: 'person',
                subject: 'person',
                displayName: 'Engineer',
              },
              role: 'DEVELOPER',
              active: true,
              repositoryIds: ['11', '12'],
            },
          ],
        })
      if (url.endsWith('/access'))
        return Response.json({
          organization: { name: 'Workspace' },
          role: 'ADMIN',
          permissions: ['organization.members.manage'],
          githubLinked: true,
          roles: [{ id: 'DEVELOPER', permissions: [] }],
          repositories: [{ id: '12', fullName: 'org/available' }],
        })
      throw new Error(`Unexpected request: ${url}`)
    })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = await render(
    <QueryClientProvider client={client}>
      <AccessControlPage />
    </QueryClientProvider>
  )
  await page.getByRole('button', { name: 'Edit access for Engineer' }).click()
  const unavailable = page.getByRole('checkbox', {
    name: 'Repository 11 (currently unavailable)',
  })
  await expect.element(unavailable).toBeChecked()
  await expect
    .element(page.getByRole('checkbox', { name: 'org/available' }))
    .toBeChecked()
  await unavailable.click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => saved?.repositoryIds).toEqual(['12'])
  await view.unmount()
  client.clear()
})
