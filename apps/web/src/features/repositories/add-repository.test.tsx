import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { AddRepository } from './add-repository'

vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'lead', organizationId: 'org' },
  }),
}))
afterEach(() => vi.unstubAllGlobals())
it('fetches discovery metadata only after opening Add repository and explicitly adopts before returning to the main list', async () => {
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) =>
    init?.method === 'PATCH'
      ? Response.json({ repositoryId: '12', selected: true })
      : Response.json({
          repositories: [{ githubId: '12', fullName: 'org/new-repository' }],
        })
  )
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const added = vi.fn().mockResolvedValue(undefined)
  const view = await render(
    <QueryClientProvider client={client}>
      <AddRepository onAdded={added} />
    </QueryClientProvider>
  )
  expect(fetchMock).not.toHaveBeenCalled()
  await page
    .getByRole('button', { name: 'Add repository', exact: true })
    .click()
  await expect
    .element(page.getByText('org/new-repository', { exact: true }))
    .toBeVisible()
  expect(page.getByRole('dialog').element().querySelector('a')).toBeNull()
  expect(added).not.toHaveBeenCalled()
  await page
    .getByRole('button', { name: 'Add org/new-repository', exact: true })
    .click()
  await expect.poll(() => added.mock.calls.length).toBe(1)
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/12/selection'),
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ selected: true }),
    })
  )
  await view.unmount()
  client.clear()
})
