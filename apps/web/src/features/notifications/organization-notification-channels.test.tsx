import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { OrganizationNotificationChannels } from './organization-notification-channels'

const state = vi.hoisted(() => ({
  session: {
    isFetching: false,
    data: { organizationId: 'org-a', role: 'ADMIN' },
  },
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => state.session,
}))
vi.mock('sonner', () => ({
  toast: { success: state.success, error: state.error, info: vi.fn() },
}))

const channel = {
  id: 'channel-1',
  type: 'EMAIL',
  name: 'Engineering alerts',
  recipients: ['engineering@example.com', 'security@example.com'],
  enabled: true,
  revision: 3,
  createdAt: '2026-10-10T08:00:00Z',
  updatedAt: '2026-10-10T08:00:00Z',
  pendingDeliveries: 0,
  lastDelivery: null as null | {
    state: string
    attempts: number
    sentAt: string | null
    createdAt: string
    failureCode: string | null
    kind: string
  },
}
const initial = {
  organizationId: 'org-a',
  notificationsEnabled: true,
  emailEnabled: true,
  emailConfigured: true,
  canManage: true,
  items: [channel],
}
let response = structuredClone(initial)
let mutationResponse: { status: number; body: unknown } = {
  status: 200,
  body: { queued: 1 },
}
const request = vi.fn()
const clients: QueryClient[] = []
beforeEach(() => {
  state.session = {
    isFetching: false,
    data: { organizationId: 'org-a', role: 'ADMIN' },
  }
  state.success.mockReset()
  state.error.mockReset()
  response = structuredClone(initial)
  mutationResponse = { status: 200, body: { queued: 1 } }
  request
    .mockReset()
    .mockImplementation(async (_url: string, options: RequestInit = {}) => {
      if (options.method && options.method !== 'GET')
        return new Response(JSON.stringify(mutationResponse.body), {
          status: mutationResponse.status,
          headers: { 'Content-Type': 'application/json' },
        })
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      })
    })
  vi.stubGlobal('fetch', request)
})
afterEach(async () => {
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})
async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const element = () => (
    <QueryClientProvider client={client}>
      <div className='mx-auto max-w-4xl p-4'>
        <OrganizationNotificationChannels />
      </div>
    </QueryClientProvider>
  )
  return { view: await render(element()), element }
}
function mutationCalls() {
  return request.mock.calls.filter(
    ([, options]) => options?.method && options.method !== 'GET'
  )
}

async function settlePaint() {
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
}

it.each(['OWNER', 'ADMIN'])(
  'shows organization channels to %s with cookie-backed and organization-bound reads',
  async (role) => {
    state.session.data.role = role
    const { view } = await mount()
    await expect
      .element(view.getByRole('heading', { name: 'Engineering alerts' }))
      .toBeVisible()
    expect(request.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
      headers: { 'X-Preflyt-Organization': 'org-a' },
    })
    await expect
      .element(view.getByText('Active', { exact: true }))
      .toHaveClass('text-success-text')
    await expect
      .element(view.getByText('engineering@example.com', { exact: true }))
      .toBeVisible()
  }
)
it.each(['MEMBER', 'VIEWER', 'REPOSITORY_ADMIN'])(
  'does not read channel recipients for %s',
  async (role) => {
    state.session.data.role = role
    const { view } = await mount()
    await expect
      .element(view.getByRole('heading', { name: 'Notification channels' }))
      .not.toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  }
)
it('adds a named channel with normalized recipients and explicit enablement', async () => {
  const { view } = await mount()
  await view.getByRole('button', { name: 'Add email channel' }).click()
  await view.getByLabelText('Channel name').fill('  Delivery alerts  ')
  await view
    .getByLabelText('Email recipients')
    .fill(
      'engineering@example.com,security@example.com\nengineering@example.com'
    )
  await view.getByRole('button', { name: 'Save channel' }).click()
  await expect.poll(() => mutationCalls().length).toBe(1)
  const [url, options] = mutationCalls()[0]
  expect(url).toContain('/notifications/channels')
  expect(options.method).toBe('POST')
  expect(options.headers).toMatchObject({ 'X-Preflyt-Organization': 'org-a' })
  expect(JSON.parse(options.body as string)).toEqual({
    type: 'EMAIL',
    name: 'Delivery alerts',
    recipients: ['engineering@example.com', 'security@example.com'],
    enabled: true,
  })
  expect(state.success).toHaveBeenCalledExactlyOnceWith('Channel saved')
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
})
it('validates recipients before saving', async () => {
  const { view } = await mount()
  await view.getByRole('button', { name: 'Add email channel' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Save channel' }))
    .toBeDisabled()
  await view.getByLabelText('Channel name').fill('Alerts')
  await view.getByLabelText('Email recipients').fill('not-an-email')
  await expect
    .element(view.getByRole('button', { name: 'Save channel' }))
    .toBeDisabled()
  await expect
    .element(view.getByText('Enter 1 to 20 valid email addresses.'))
    .toBeVisible()
  await view
    .getByLabelText('Email recipients')
    .fill(
      Array.from({ length: 21 }, (_, i) => `person${i}@example.com`).join('\n')
    )
  await expect
    .element(view.getByRole('button', { name: 'Save channel' }))
    .toBeDisabled()
  expect(mutationCalls()).toHaveLength(0)
})
it('updates a channel with its saved revision and preserves enabled state', async () => {
  const { view } = await mount()
  await view.getByRole('button', { name: 'Edit Engineering alerts' }).click()
  await view.getByLabelText('Channel name').fill('Security alerts')
  await view.getByRole('button', { name: 'Save channel' }).click()
  await expect.poll(() => mutationCalls().length).toBe(1)
  const [url, options] = mutationCalls()[0]
  expect(url).toContain('/channels/channel-1')
  expect(options.method).toBe('PATCH')
  expect(JSON.parse(options.body as string)).toEqual({
    expectedRevision: 3,
    name: 'Security alerts',
    recipients: channel.recipients,
  })
})
it('queues a test and never reports it as delivered', async () => {
  const { view } = await mount()
  await view
    .getByRole('button', { name: 'Send test to Engineering alerts' })
    .click()
  await expect.poll(() => mutationCalls().length).toBe(1)
  const [url, options] = mutationCalls()[0]
  expect(url).toContain('/channels/channel-1/test')
  expect(options.method).toBe('POST')
  expect(JSON.parse(options.body as string)).toEqual({ expectedRevision: 3 })
  expect(state.success).toHaveBeenCalledExactlyOnceWith('Test email queued')
  expect(state.success).not.toHaveBeenCalledWith('Email sent')
})
it('pauses an enabled channel and provides a neutral disabled state', async () => {
  const { view } = await mount()
  await view.getByRole('button', { name: 'Pause Engineering alerts' }).click()
  await expect.poll(() => mutationCalls().length).toBe(1)
  expect(JSON.parse(mutationCalls()[0][1].body as string)).toEqual({
    expectedRevision: 3,
    enabled: false,
  })
  response.items[0].enabled = false
  await view
    .getByRole('button', { name: 'Refresh notification channels' })
    .click()
  await expect
    .element(view.getByText('Disabled', { exact: true }))
    .toHaveClass('text-foreground')
  await expect
    .element(
      view.getByRole('button', { name: 'Send test to Engineering alerts' })
    )
    .toBeDisabled()
  await view.getByRole('button', { name: 'Enable Engineering alerts' }).click()
  await expect.poll(() => mutationCalls().length).toBe(2)
  expect(JSON.parse(mutationCalls()[1][1].body as string)).toEqual({
    expectedRevision: 3,
    enabled: true,
  })
})
it('requires removal confirmation and carries the current revision', async () => {
  const { view } = await mount()
  await view.getByRole('button', { name: 'Remove Engineering alerts' }).click()
  await expect
    .element(view.getByRole('dialog', { name: 'Remove email channel?' }))
    .toBeVisible()
  expect(mutationCalls()).toHaveLength(0)
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(mutationCalls()).toHaveLength(0)
  await view.getByRole('button', { name: 'Remove Engineering alerts' }).click()
  await view
    .getByRole('button', { name: 'Remove channel', exact: true })
    .click()
  await expect.poll(() => mutationCalls().length).toBe(1)
  expect(mutationCalls()[0][1].method).toBe('DELETE')
  expect(JSON.parse(mutationCalls()[0][1].body as string)).toEqual({
    expectedRevision: 3,
  })
  expect(state.success).toHaveBeenCalledExactlyOnceWith('Channel removed')
})
it('allows saving channels when SMTP is unavailable and disables tests', async () => {
  response.emailConfigured = false
  const { view } = await mount()
  await expect
    .element(view.getByText('Email delivery is not ready'))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Add email channel' }))
    .toBeEnabled()
  await expect
    .element(
      view.getByRole('button', { name: 'Send test to Engineering alerts' })
    )
    .toBeDisabled()
})
it('keeps authorization and stale revision failures in the form and toast without dismissing it', async () => {
  mutationResponse = {
    status: 409,
    body: { message: 'This channel changed. Refresh and try again.' },
  }
  const { view } = await mount()
  await view.getByRole('button', { name: 'Edit Engineering alerts' }).click()
  await view.getByRole('button', { name: 'Save channel' }).click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('This channel changed. Refresh and try again.')
  await expect.element(view.getByRole('dialog')).toBeVisible()
  expect(state.error).toHaveBeenCalledExactlyOnceWith(
    'This channel changed. Refresh and try again.'
  )
  expect(state.success).not.toHaveBeenCalled()
})
it('closes drafts and does not reuse channel recipients when organizations change', async () => {
  const { view, element } = await mount()
  await view.getByRole('button', { name: 'Edit Engineering alerts' }).click()
  await view.getByLabelText('Channel name').fill('Unsubmitted draft')
  state.session.data.organizationId = 'org-b'
  response = { ...response, organizationId: 'org-b', items: [] }
  await view.rerender(element())
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
  await expect
    .element(view.getByText('engineering@example.com', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByText('Keep your team in the loop'))
    .toBeVisible()
  expect(mutationCalls()).toHaveLength(0)
  expect(
    request.mock.calls[request.mock.calls.length - 1]?.[1].headers
  ).toMatchObject({
    'X-Preflyt-Organization': 'org-b',
  })
})
it('hides channel contents and blocks mutations during organization session refresh', async () => {
  const { view, element } = await mount()
  await expect
    .element(view.getByRole('heading', { name: 'Engineering alerts' }))
    .toBeVisible()
  state.session.isFetching = true
  await view.rerender(element())
  await expect
    .element(view.getByText('Loading notification channels…'))
    .toBeVisible()
  await expect
    .element(view.getByRole('heading', { name: 'Engineering alerts' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: 'Add email channel' }))
    .toBeDisabled()
})
it.each([
  ['SENT', 'Email sent', 'text-success-text'],
  ['PENDING', 'Email queued', 'text-warning-text'],
  ['FAILED', 'Email failed', 'text-danger-text'],
  ['SKIPPED', 'Email skipped', 'text-foreground'],
])(
  'shows semantic %s delivery state and actual attempts',
  async (deliveryState, label, color) => {
    response.items[0].lastDelivery = {
      state: deliveryState,
      attempts: 2,
      sentAt: deliveryState === 'SENT' ? '2026-10-10T08:05:00Z' : null,
      createdAt: '2026-10-10T08:04:00Z',
      failureCode: null,
      kind: 'TEST',
    }
    const { view } = await mount()
    await expect
      .element(view.getByText(label, { exact: true }))
      .toHaveClass(color)
    await expect
      .element(view.getByText('2 attempts', { exact: true }))
      .toBeVisible()
    await expect
      .element(view.getByText('Latest test delivery', { exact: true }))
      .toBeVisible()
  }
)
it('has a retry state for failed initial reads', async () => {
  request.mockResolvedValue(
    new Response(
      JSON.stringify({ message: 'Organization access is required.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  )
  const { view } = await mount()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Organization access is required.')
  await expect
    .element(view.getByRole('button', { name: 'Try again' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Add email channel' }))
    .toBeDisabled()
})
it('keeps channel cards and the keyboard-accessible form within 320px in both themes', async () => {
  const { view } = await mount()
  await expect
    .element(view.getByRole('heading', { name: 'Engineering alerts' }))
    .toBeVisible()
  await page.viewport(320, 844)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await settlePaint()
    await expect
      .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
      .toBe(true)
    await page.screenshot({
      path: `__screenshots__/organization-notification-channels-${dark ? 'dark' : 'light'}-mobile.png`,
    })
    await view.getByRole('button', { name: 'Add email channel' }).click()
    await expect.element(view.getByRole('dialog')).toBeVisible()
    await expect
      .poll(() => document.activeElement?.id)
      .toBe('notification-channel-name')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.id).toBe('notification-channel-recipients')
    await expect
      .poll(() => {
        const box = document
          .querySelector('[role="dialog"]')
          ?.getBoundingClientRect()
        return !!box && box.left >= 0 && box.right <= window.innerWidth
      })
      .toBe(true)
    await settlePaint()
    await page.screenshot({
      path: `__screenshots__/organization-notification-channel-form-${dark ? 'dark' : 'light'}-mobile.png`,
    })
    await userEvent.keyboard('{Escape}')
    await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
  }
})

it('limits channel creation to ten saved channels', async () => {
  response.items = Array.from({ length: 10 }, (_, index) => ({
    ...channel,
    id: `channel-${index}`,
    name: `Alerts ${index}`,
  }))
  const { view } = await mount()
  await expect
    .element(view.getByText('10 of 10 channels.', { exact: false }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Add email channel' }))
    .toBeDisabled()
})
it('keeps stale data disabled when a background refresh fails', async () => {
  const { view } = await mount()
  await expect
    .element(view.getByRole('heading', { name: 'Engineering alerts' }))
    .toBeVisible()
  request.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          message: 'Email settings are temporarily unavailable.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
  )
  await view
    .getByRole('button', { name: 'Refresh notification channels' })
    .click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Email settings are temporarily unavailable.')
  await expect
    .element(
      view.getByText(
        'Channel details may be out of date. Retry before making changes.'
      )
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Add email channel' }))
    .toBeDisabled()
})
it('renders multiple distinct organization channels in both desktop themes', async () => {
  response.items.push({
    ...channel,
    id: 'channel-2',
    name: 'Security alerts',
    recipients: ['security@example.com'],
    enabled: false,
  })
  const { view } = await mount()
  await expect
    .element(view.getByRole('heading', { name: 'Security alerts' }))
    .toBeVisible()
  await page.viewport(1280, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await settlePaint()
    await expect
      .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
      .toBe(true)
    await page.screenshot({
      path: `__screenshots__/organization-notification-channels-${dark ? 'dark' : 'light'}-desktop.png`,
    })
  }
})

it('keeps polling and tests disabled while another recipient remains queued after one email was sent', async () => {
  response.items[0].pendingDeliveries = 1
  response.items[0].lastDelivery = {
    state: 'SENT',
    attempts: 1,
    sentAt: '2026-10-10T08:05:00Z',
    createdAt: '2026-10-10T08:04:00Z',
    failureCode: null,
    kind: 'NOTIFICATION',
  }
  const { view } = await mount()
  await expect
    .element(view.getByText('1 email queued', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Latest recipient delivery', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Email sent', { exact: true }))
    .toHaveClass('text-success-text')
  await expect
    .element(
      view.getByRole('button', { name: 'Send test to Engineering alerts' })
    )
    .toBeDisabled()
  await expect
    .poll(() => request.mock.calls.length, { timeout: 6500 })
    .toBeGreaterThan(1)
  response.items[0].pendingDeliveries = 0
  await view
    .getByRole('button', { name: 'Refresh notification channels' })
    .click()
  await expect
    .element(view.getByText('1 email queued', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(
      view.getByRole('button', { name: 'Send test to Engineering alerts' })
    )
    .toBeEnabled()
}, 10000)
