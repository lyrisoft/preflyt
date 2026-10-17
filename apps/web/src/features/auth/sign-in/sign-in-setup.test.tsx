import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { SignIn } from './index'

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode
    to: string
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('../sign-in-layout', () => ({
  SignInLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
afterEach(() => vi.unstubAllGlobals())
it('offers setup when only the deployment admin sign-in is configured', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ superAdmin: true, github: false, oidc: false })
        )
      )
  )
  const screen = await render(<SignIn />)
  await expect
    .element(page.getByRole('heading', { name: 'Set up Preflyt' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Start setup' }))
    .toHaveAttribute('href', '/super-admin/login')
  await screen.unmount()
})
it('preserves normal GitHub sign-in when configured', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ superAdmin: true, github: true, oidc: false })
        )
      )
  )
  const screen = await render(<SignIn />)
  await expect
    .element(page.getByRole('button', { name: 'Continue with GitHub' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Start setup' }))
    .not.toBeInTheDocument()
  await screen.unmount()
})
it('does not mistake a failed configuration request for first-run setup', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const screen = await render(<SignIn />)
  await expect
    .element(page.getByRole('button', { name: 'Try again' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Start setup' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'Super Admin access' }))
    .toBeVisible()
  await screen.unmount()
})
