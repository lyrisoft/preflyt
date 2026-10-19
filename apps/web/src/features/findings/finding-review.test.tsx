import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { FindingReview } from './finding-review'

let decision: {
    classification: string | null
    reason: string
    revision: number
    canManage: boolean
    eligible: boolean
    updatedAt: string | null
    history: { at: string; classification: string; reason: string }[]
  },
  fail = false
const fetchMock = vi.fn()
beforeEach(() => {
  decision = {
    classification: null,
    reason: '',
    revision: 0,
    canManage: true,
    eligible: true,
    updatedAt: null,
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
        decision = {
          ...decision,
          ...body,
          revision: decision.revision + 1,
          history: [{ at: new Date().toISOString(), ...body }],
        }
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
      <div style={{ width: 288 }}>
        <FindingReview
          path='findings/id/review?origin=health&repository=11&assessment=saved'
          scope='org:user'
        />
      </div>
    </QueryClientProvider>
  )
}
it('requires reasoning and saves evidence-backed classification without suppression', async () => {
  const view = await mount()
  await expect.element(view.getByText('Needs review')).toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Save classification' }))
    .toBeDisabled()
  await view.getByRole('combobox', { name: 'Classification' }).click()
  await page.getByRole('option', { name: 'Confirmed', exact: true }).click()
  await view
    .getByRole('textbox', { name: 'Evidence and reasoning' })
    .fill('Source guard and regression test independently verify this issue.')
  await view.getByRole('button', { name: 'Save classification' }).click()
  await expect.element(view.getByText('Latest review evidence')).toBeVisible()
  expect(
    fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body
  ).toContain('CONFIRMED')
  expect(
    fetchMock.mock.calls.every(([url]) => !String(url).includes('/ignore'))
  ).toBe(true)
  await expect.element(view.getByText('Review history (1)')).toBeVisible()
})
it('hides management controls from read-only users and never retains data after access failure', async () => {
  decision.canManage = false
  const view = await mount()
  await expect.element(view.getByText('Needs review')).toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Save classification' }))
    .not.toBeInTheDocument()
})
it('provides an actionable permission failure', async () => {
  fail = true
  const view = await mount()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent(
      'Repository access is unavailable or you do not have permission.'
    )
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeVisible()
})
