import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { NotificationPreferences } from './notification-preferences'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'person', organizationId: 'workspace' },
  }),
}))
vi.mock('./weekly-health-preferences', () => ({
  WeeklyHealthPreferences: () => null,
}))
const preference = {
  assessments: true,
  email: true,
  emailEnabled: true,
  emailAddressAvailable: true,
  emailAddress: 'saved@example.test',
  personalEmail: 'saved@example.test',
  pendingEmail: null,
  verificationExpiresAt: null,
  verificationRequestedAt: null,
  verificationDeliveryState: null,
}
afterEach(() => vi.unstubAllGlobals())
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <NotificationPreferences />
    </QueryClientProvider>
  ).then((view) => ({ view, client }))
}
it('keeps the saved address compact and opens OTP verification as soon as queueing is acknowledged', async () => {
  let accept!: () => void
  const accepted = new Promise<void>((resolve) => {
    accept = resolve
  })
  let queued = false
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      await accepted
      queued = true
      return Response.json(
        {
          queued: true,
          pendingEmail: 'new@example.test',
          verificationRequestedAt: new Date().toISOString(),
          verificationExpiresAt: new Date(Date.now() + 900000).toISOString(),
        },
        { status: 202 }
      )
    }
    return Response.json(
      queued
        ? {
            ...preference,
            pendingEmail: 'new@example.test',
            verificationRequestedAt: new Date().toISOString(),
            verificationExpiresAt: new Date(Date.now() + 900000).toISOString(),
            verificationDeliveryState: 'PENDING',
          }
        : preference
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  const { view, client } = await mount()
  await expect
    .element(page.getByText('saved@example.test', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('textbox', { name: 'Email address', exact: true }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Change', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Email address', exact: true })
    .fill('new@example.test')
  await page.getByRole('button', { name: 'Send code', exact: true }).click()
  accept()
  await expect.element(page.getByRole('dialog')).toBeVisible()
  await expect
    .element(
      page.getByRole('textbox', { name: 'Verification code', exact: true })
    )
    .toBeVisible()
  await expect
    .element(
      page.getByText(
        'Your email is queued. Delivery retries automatically if needed.',
        { exact: true }
      )
    )
    .toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/notifications/email-address'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.test' }),
    })
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect
    .poll(
      () =>
        document.activeElement ===
        page.getByRole('button', { name: 'Change', exact: true }).element()
    )
    .toBe(true)
  await view.unmount()
  client.clear()
})
it('shows Removing with a spinner and disables email actions until removal completes', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  let removed = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        await pending
        removed = true
        return Response.json({ removed: true })
      }
      return Response.json(
        removed
          ? {
              ...preference,
              email: false,
              emailAddress: null,
              personalEmail: null,
              emailAddressAvailable: false,
            }
          : preference
      )
    })
  )
  const { view, client } = await mount()
  await expect
    .element(page.getByText('saved@example.test', { exact: true }))
    .toBeVisible()
  await page
    .getByRole('button', { name: 'Email address actions', exact: true })
    .click()
  await page.getByRole('menuitem', { name: /Remove email/ }).click()
  const button = page.getByRole('button', { name: 'Removing…', exact: true })
  await expect.element(button).toBeVisible()
  await expect.element(button).toBeDisabled()
  expect(button.element().querySelector('.animate-spin')).not.toBeNull()
  await expect
    .element(
      page.getByRole('switch', {
        name: 'Personal email notifications',
        exact: true,
      })
    )
    .toBeDisabled()
  finish()
  await expect
    .element(page.getByText('No email address added', { exact: true }))
    .toBeVisible()
  await view.unmount()
  client.clear()
})
it('shows delivery failure and allows a new code after the resend cooldown', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...preference,
        pendingEmail: 'new@example.test',
        verificationDeliveryState: 'FAILED',
        verificationRequestedAt: new Date(Date.now() - 61000).toISOString(),
        verificationExpiresAt: new Date(Date.now() + 900000).toISOString(),
      })
    )
  )
  const { view, client } = await mount()
  await page.getByRole('button', { name: 'Enter code', exact: true }).click()
  await expect
    .element(
      page.getByText(
        'Delivery could not be confirmed. Resend the code if it hasn’t arrived.',
        { exact: true }
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Resend code', exact: true }))
    .toBeEnabled()
  await view.unmount()
  client.clear()
})

it('keeps the OTP modal within a 320px viewport', async () => {
  await page.viewport(320, 844)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...preference,
        pendingEmail: 'new@example.test',
        verificationDeliveryState: 'PENDING',
        verificationRequestedAt: new Date().toISOString(),
        verificationExpiresAt: new Date(Date.now() + 900000).toISOString(),
      })
    )
  )
  const { view, client } = await mount()
  await page.getByRole('button', { name: 'Enter code', exact: true }).click()
  await expect
    .element(
      page.getByRole('textbox', { name: 'Verification code', exact: true })
    )
    .toBeVisible()
  const bounds = page.getByRole('dialog').element().getBoundingClientRect()
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await view.unmount()
  client.clear()
  await page.viewport(1280, 900)
})
