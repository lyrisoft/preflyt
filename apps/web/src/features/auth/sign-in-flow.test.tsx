import type { ReactNode } from 'react'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { API_BASE_URL } from '@/lib/api'
import { SignIn } from './sign-in'
import { SuperAdminLogin } from './super-admin-login'

const state = vi.hoisted(() => ({
  search: {} as { error?: string; redirect?: string },
  methods: {} as Record<string, unknown>,
  fetch: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => state.search,
  useNavigate: () => state.navigate,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const methodsResponse = () => new Response(JSON.stringify(state.methods))
const username = 'fixture-admin'
const password = 'fixture-administrator-password-with-length'
beforeEach(() => {
  state.search = {}
  state.methods = { github: true, oidc: true, superAdmin: true }
  state.navigate.mockReset().mockResolvedValue(undefined)
  state.fetch.mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/auth/methods')) return methodsResponse()
    return new Response(null, { status: 401 })
  })
  vi.stubGlobal('fetch', state.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it('discovers configured sign-in methods with cookies and preserves provider login links', async () => {
  const view = await render(<SignIn />)
  await expect
    .element(view.getByRole('link', { name: 'Continue with GitHub' }))
    .toHaveAttribute('href', `${API_BASE_URL}/auth/github/login`)
  await expect
    .element(view.getByRole('link', { name: 'Continue with SSO' }))
    .toHaveAttribute('href', `${API_BASE_URL}/auth/login`)
  await expect
    .element(view.getByRole('link', { name: 'Super Admin access' }))
    .toHaveAttribute('href', '/super-admin/login')
  expect(state.fetch).toHaveBeenCalledWith(
    `${API_BASE_URL}/auth/methods`,
    expect.objectContaining({ credentials: 'include' })
  )
})

it.each([
  { github: false, oidc: false, superAdmin: false },
  { github: 'true', oidc: 1, superAdmin: 'true' },
])(
  'never exposes sign-in methods from disabled or truthy non-boolean flags: %j',
  async (methods) => {
    state.methods = methods
    const view = await render(<SignIn />)
    await expect
      .element(view.getByText(/sign-in.*not configured|no.*sign-in.*options/i))
      .toBeVisible()
    await expect
      .element(view.getByRole('link', { name: 'Continue with GitHub' }))
      .not.toBeInTheDocument()
    await expect
      .element(view.getByRole('link', { name: 'Continue with SSO' }))
      .not.toBeInTheDocument()
    await expect
      .element(view.getByRole('link', { name: 'Super Admin access' }))
      .not.toBeInTheDocument()
  }
)

it('keeps Super Admin recovery reachable when sign-in method discovery fails', async () => {
  state.fetch.mockRejectedValue(new TypeError('API unavailable'))
  const view = await render(<SignIn />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent(/could not be loaded/i)
  await expect
    .element(view.getByRole('link', { name: 'Super Admin access' }))
    .toHaveAttribute('href', '/super-admin/login')
  await expect
    .element(view.getByRole('link', { name: 'Continue with GitHub' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('link', { name: 'Continue with SSO' }))
    .not.toBeInTheDocument()
})

it.each(['github', 'oidc'])(
  'keeps a %s callback failure visible alongside working sign-in options',
  async (error) => {
    state.search = { error }
    const view = await render(<SignIn />)
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent(/sign-in could not be completed/i)
    await expect
      .element(view.getByRole('link', { name: 'Continue with GitHub' }))
      .toBeVisible()
    await expect
      .element(view.getByRole('link', { name: 'Continue with SSO' }))
      .toBeVisible()
  }
)

it('does not expose the local administrator form when Super Admin access is disabled', async () => {
  state.methods = { superAdmin: false }
  const view = await render(<SuperAdminLogin />)
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent(/not configured/i)
  await expect.element(view.getByLabelText('Username')).not.toBeInTheDocument()
  await expect.element(view.getByLabelText('Password')).not.toBeInTheDocument()
  expect(state.fetch).toHaveBeenCalledWith(
    `${API_BASE_URL}/auth/methods`,
    expect.objectContaining({ credentials: 'include' })
  )
})

it('retries administrator method discovery without exposing a form before confirmation', async () => {
  state.fetch.mockRejectedValueOnce(new TypeError('API unavailable'))
  const view = await render(<SuperAdminLogin />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent(/cannot reach the Preflyt API/i)
  await expect.element(view.getByLabelText('Password')).not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Try again' }).click()
  await expect.element(view.getByLabelText('Username')).toBeVisible()
  await expect.element(view.getByLabelText('Password')).toBeVisible()
  expect(state.fetch).toHaveBeenCalledTimes(2)
})

it('preserves administrator credential bounds, cookie-backed submission and password clearing after failure', async () => {
  const view = await render(<SuperAdminLogin />)
  await expect
    .element(view.getByLabelText('Password'))
    .toHaveAttribute('type', 'password')
  await expect
    .element(view.getByLabelText('Password'))
    .toHaveAttribute('minlength', '24')
  await expect
    .element(view.getByLabelText('Password'))
    .toHaveAttribute('maxlength', '128')
  await expect
    .element(view.getByLabelText('Password'))
    .toHaveAttribute('autocomplete', 'current-password')
  await view.getByLabelText('Username').fill(username)
  await view.getByLabelText('Password').fill(password)
  await view.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent(/sign-in failed/i)
  await expect.element(view.getByLabelText('Password')).toHaveValue('')
  await expect.element(view.getByLabelText('Username')).toHaveValue(username)
  expect(state.fetch).toHaveBeenLastCalledWith(
    `${API_BASE_URL}/auth/super-admin/login`,
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  )
  expect(state.navigate).not.toHaveBeenCalled()
})

it.each([
  ['/access-control?tab=github#members', '/access-control?tab=github#members'],
  ['https://untrusted.example/redirect', '/'],
])(
  'allows only same-origin administrator success destinations: %s',
  async (redirect, destination) => {
    state.search = { redirect }
    state.fetch.mockImplementation(async (url: string) =>
      url.endsWith('/auth/methods')
        ? methodsResponse()
        : new Response(JSON.stringify({ authenticated: true }))
    )
    const view = await render(<SuperAdminLogin />)
    await expect.element(view.getByLabelText('Username')).toBeVisible()
    await view.getByLabelText('Username').fill(username)
    await view.getByLabelText('Password').fill(password)
    await view.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect
      .poll(() => state.navigate.mock.calls)
      .toEqual([[{ to: destination, replace: true }]])
  }
)

it('disables administrator submission while a login request is pending', async () => {
  let finish: (response: Response) => void = () => undefined
  state.fetch.mockImplementation(async (url: string) =>
    url.endsWith('/auth/methods')
      ? methodsResponse()
      : new Promise<Response>((resolve) => {
          finish = resolve
        })
  )
  const view = await render(<SuperAdminLogin />)
  await expect.element(view.getByLabelText('Username')).toBeVisible()
  await view.getByLabelText('Username').fill(username)
  await view.getByLabelText('Password').fill(password)
  await view.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Signing in…' }))
    .toBeDisabled()
  expect(state.fetch).toHaveBeenCalledTimes(2)
  finish(new Response(null, { status: 429 }))
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent(/too many attempts/i)
  await expect.element(view.getByLabelText('Password')).toHaveValue('')
})
