import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { GitHubIdentityLink } from './github-identity-link'

const state = vi.hoisted(() => ({
  search: {} as { identityLink?: string },
  platformAdmin: false,
  status: { data: { canLink: true, linked: false } },
  preview: {} as Record<string, unknown>,
  confirm: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({ useSearch: () => state.search }))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'legacy', platformAdmin: state.platformAdmin },
  }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0].endsWith('status') ? state.status : state.preview,
  useMutation: ({ meta }: { meta?: unknown }) => ({
    mutate: meta ? state.confirm : state.cancel,
    isPending: false,
  }),
}))
beforeEach(() => {
  state.search = {}
  state.platformAdmin = false
  state.status = { data: { canLink: true, linked: false } }
  state.preview = {}
  state.confirm.mockReset()
  state.cancel.mockReset()
})
it('explains fresh proof without suggesting email matching', async () => {
  const view = await render(<GitHubIdentityLink />)
  await expect
    .element(view.getByRole('button', { name: 'Link GitHub account' }))
    .toBeVisible()
  await expect
    .element(view.getByText(/Matching names or email addresses never/))
    .toBeVisible()
})
it('requires an access preview before confirmation', async () => {
  state.search = { identityLink: 'confirm' }
  state.preview = { isPending: true }
  const view = await render(<GitHubIdentityLink />)
  await expect
    .element(view.getByRole('button', { name: 'Link account', exact: true }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('button', { name: 'Cancel' }))
    .toBeEnabled()
})
it('discloses disabled grants and confirms only the reviewed digest', async () => {
  state.search = { identityLink: 'confirm' }
  state.preview = {
    data: {
      login: 'developer',
      previousAccessCount: 2,
      retainedAccessCount: 1,
      previewHash: 'reviewed-digest',
    },
  }
  const view = await render(<GitHubIdentityLink />)
  await expect
    .element(view.getByText(/permissions are not combined/))
    .toBeVisible()
  await view.getByRole('button', { name: 'Link account', exact: true }).click()
  expect(state.confirm).toHaveBeenCalledWith('reviewed-digest')
})
it('keeps local Super Admin separate', async () => {
  state.platformAdmin = true
  const view = await render(<GitHubIdentityLink />)
  await expect
    .element(view.getByRole('button', { name: 'Link GitHub account' }))
    .not.toBeInTheDocument()
})
it('explains failed GitHub proof in its recovery screen', async () => {
  state.search = { identityLink: 'failed' }
  const view = await render(<GitHubIdentityLink />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('GitHub sign-in could not be verified')
})
