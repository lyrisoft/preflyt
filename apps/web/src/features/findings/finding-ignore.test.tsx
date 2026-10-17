import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { FindingIgnore } from './finding-ignore'

let decision: {
    state: string
    reason: string
    expiresAt: string | null
    revision: number
    canManage: boolean
    eligible: boolean
    expired?: boolean
    history: { event: string; at: string; reason: string }[]
  },
  fail = false
const fetchMock = vi.fn()
beforeEach(() => {
  decision = {
    state: 'OPEN',
    reason: '',
    expiresAt: null,
    revision: 0,
    canManage: true,
    eligible: true,
    history: [],
  }
  fail = false
  vi.stubGlobal(
    'fetch',
    fetchMock.mockReset().mockImplementation(async (_url, init) => {
      if (fail)
        return Response.json({ message: 'Access denied' }, { status: 403 })
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body)
        decision = { ...decision, ...body, revision: decision.revision + 1 }
      }
      return Response.json(decision)
    })
  )
})
async function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <div className='mx-auto w-full max-w-sm p-4'>
        <FindingIgnore
          scope='org:user'
          path='findings/id/ignore?origin=health&repository=11&assessment=saved'
        />
      </div>
    </QueryClientProvider>
  )
}
it('requires reasons, submits an optional expiry and reopens with optimistic revision', async () => {
  await mount()
  await expect
    .element(
      page.getByText('Saved assessments and merge rules are unchanged.', {
        exact: false,
      })
    )
    .toBeVisible()
  await expect
    .element(
      page.getByText('line range and message are unchanged', { exact: false })
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .toBeDisabled()
  await page
    .getByLabelText('Reason for ignoring')
    .fill('Intentional duplication')
  await page.getByRole('combobox', { name: 'Expiry', exact: true }).click()
  await page
    .getByRole('option', { name: 'Custom date and time', exact: true })
    .click()
  await page.getByLabelText('Date and time (local)').fill('2099-01-01T12:00')
  await page
    .getByRole('button', { name: 'Ignore finding', exact: true })
    .click()
  await expect.element(page.getByText('Ignored', { exact: true })).toBeVisible()
  let calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(JSON.parse(calls[0][1].body)).toMatchObject({
    state: 'IGNORED',
    reason: 'Intentional duplication',
    expectedRevision: 0,
    expiresAt: new Date('2099-01-01T12:00').toISOString(),
  })
  await expect
    .element(page.getByRole('button', { name: 'Reopen finding', exact: true }))
    .toBeDisabled()
  await page.getByLabelText('Reason for reopening').fill('Investigate again')
  await page
    .getByRole('button', { name: 'Reopen finding', exact: true })
    .click()
  await expect.element(page.getByText('Open', { exact: true })).toBeVisible()
  calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(JSON.parse(calls[1][1].body)).toMatchObject({
    state: 'OPEN',
    reason: 'Investigate again',
    expiresAt: null,
    expectedRevision: 1,
  })
})
it('shows expired decisions and safe read-only history without mutation controls', async () => {
  decision = {
    ...decision,
    canManage: false,
    expired: true,
    reason: 'Temporary exception',
    history: [
      {
        event: 'finding.ignored',
        at: '2026-01-01',
        reason: '<script>unsafe()</script>',
      },
    ],
  }
  await mount()
  await expect
    .element(
      page.getByText('The ignore expired. This finding is active again.')
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .not.toBeInTheDocument()
  await page.getByText('Recent review history').click()
  await expect
    .element(page.getByText('<script>unsafe()</script>'))
    .toBeVisible()
  expect(document.querySelector('script')?.textContent).not.toContain(
    'unsafe()'
  )
})
it('fails closed when repository access is denied', async () => {
  fail = true
  await mount()
  await expect.element(page.getByRole('alert')).toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .not.toBeInTheDocument()
})

it('offers a styled expiry dropdown with no expiry by default and a seven-day option', async () => {
  await mount()
  await expect
    .element(page.getByRole('combobox', { name: 'Expiry', exact: true }))
    .toHaveTextContent('Until manually reopened')
  await expect
    .element(page.getByLabelText('Date and time (local)'))
    .not.toBeInTheDocument()
  await page.getByRole('combobox', { name: 'Expiry', exact: true }).click()
  await page.getByRole('option', { name: 'After 7 days', exact: true }).click()
  await page.getByLabelText('Reason for ignoring').fill('Temporary exception')
  const start = Date.now()
  await page
    .getByRole('button', { name: 'Ignore finding', exact: true })
    .click()
  await expect.element(page.getByText('Ignored', { exact: true })).toBeVisible()
  const body = JSON.parse(
    fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body
  )
  expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(
    start + 7 * 24 * 60 * 60 * 1000
  )
  expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  )
})
it('validates a custom date without sending an invalid decision', async () => {
  await mount()
  await page.getByLabelText('Reason for ignoring').fill('Temporary exception')
  await page.getByRole('combobox', { name: 'Expiry', exact: true }).click()
  await page
    .getByRole('option', { name: 'Custom date and time', exact: true })
    .click()
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .toBeDisabled()
  await page.getByLabelText('Date and time (local)').fill('2020-01-01T12:00')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Choose a future date and time.')
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .toBeDisabled()
  await page.getByLabelText('Date and time (local)').fill('2099-01-01T12:00')
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  await expect.element(page.getByText(/Reopens.*2099/)).toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Ignore finding', exact: true }))
    .toBeEnabled()
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  ).toHaveLength(0)
})
it('preserves the reason and open state when saving is denied', async () => {
  await mount()
  await page
    .getByLabelText('Reason for ignoring')
    .fill('Intentional duplication')
  fetchMock.mockImplementationOnce(async () =>
    Response.json(
      { message: 'Review permission changed. Refresh and try again.' },
      { status: 403 }
    )
  )
  await page
    .getByRole('button', { name: 'Ignore finding', exact: true })
    .click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Review permission changed. Refresh and try again.')
  await expect
    .element(page.getByLabelText('Reason for ignoring'))
    .toHaveValue('Intentional duplication')
  await expect.element(page.getByText('Open', { exact: true })).toBeVisible()
})
it('keeps the card aligned at sidebar and mobile widths in both themes', async () => {
  for (const width of [320, 400]) {
    await page.viewport(width, 900)
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      const view = await mount()
      await expect
        .element(page.getByLabelText('Reason for ignoring'))
        .toBeVisible()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      const title = document.querySelector('h2')!.getBoundingClientRect()
      const header = document
        .querySelector('[data-slot="card-header"]')!
        .getBoundingClientRect()
      expect(title.top).toBeGreaterThanOrEqual(header.top)
      expect(title.bottom).toBeLessThanOrEqual(header.bottom)
      await page.screenshot({
        element: document.querySelector('[data-slot="card"]')!,
        path: `__screenshots__/finding-review-${width}-${dark ? 'dark' : 'light'}.png`,
      })
      await view.unmount()
    }
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
