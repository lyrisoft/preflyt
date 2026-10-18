import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RetentionSettings } from './retention-settings'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({ data: { organizationId: 'org' } }),
}))
let policy: Record<string, unknown>,
  calls: {
    path: string
    method: string
    body: Record<string, unknown> | undefined
  }[]
beforeEach(() => {
  policy = {
    organizationId: 'org',
    revision: 1,
    enabled: false,
    assessmentDays: 90,
    sourceDays: 90,
    notificationDays: 90,
    activityDays: 90,
    auditDays: 365,
    lastRunAt: null,
    lastResult: null,
    lastError: false,
    nextRunAt: null,
    running: false,
    workerEnabled: true,
  }
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit = {}) => {
      const method = options.method ?? 'GET',
        body = options.body ? JSON.parse(String(options.body)) : undefined
      calls.push({ path: String(url), method, body })
      if (String(url).endsWith('/preview'))
        return Response.json({
          asOf: new Date().toISOString(),
          items: [
            {
              kind: 'assessmentDays',
              eligible: 3,
              cutoff: '2026-01-01T00:00:00Z',
            },
          ],
        })
      if (method === 'PATCH') {
        policy = { ...policy, ...body, revision: 2 }
        return Response.json(policy)
      }
      if (String(url).endsWith('/cleanup'))
        return Response.json({ queued: true })
      return Response.json(policy)
    })
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})
async function show() {
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
      <RetentionSettings />
    </QueryClientProvider>
  )
}
it('previews unsaved periods without deleting or saving and requires confirmation to enable cleanup', async () => {
  const view = await show()
  await expect
    .element(view.getByLabelText('Automatic cleanup'))
    .not.toBeChecked()
  await view.getByLabelText('Finding source excerpts').fill('60')
  await view.getByRole('button', { name: 'Preview cleanup' }).click()
  await expect
    .element(view.getByText('Cleanup preview', { exact: true }))
    .toBeVisible()
  expect(calls.find((x) => x.path.endsWith('/preview'))?.body?.sourceDays).toBe(
    60
  )
  expect(
    calls.every((x) => x.method !== 'PATCH' && !x.path.endsWith('/cleanup'))
  ).toBe(true)
  await view.getByLabelText('Automatic cleanup').click()
  await view.getByRole('button', { name: 'Save retention settings' }).click()
  await expect
    .element(view.getByRole('alertdialog'))
    .toHaveTextContent('permanently delete')
  expect(calls.some((x) => x.method === 'PATCH')).toBe(false)
  await view.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect
    .poll(() => calls.find((x) => x.method === 'PATCH')?.body)
    .toMatchObject({ enabled: true, sourceDays: 60, revision: 1 })
})
it('validates day ranges and requires saved enabled settings to queue cleanup', async () => {
  const view = await show()
  await expect
    .element(view.getByRole('button', { name: 'Queue cleanup' }))
    .toBeDisabled()
  await view.getByLabelText('Routine audit history').fill('5')
  await expect
    .element(view.getByRole('button', { name: 'Preview cleanup' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('button', { name: 'Save retention settings' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('at least 90 days')
})
it('shows cleanup errors, preserves periods, and fits a mobile viewport', async () => {
  policy = { ...policy, enabled: true, lastError: true }
  await page.viewport(375, 812)
  try {
    const view = await show()
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('last cleanup did not finish')
    await expect
      .element(view.getByLabelText('Saved CI assessments'))
      .toHaveValue(90)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    await view.getByRole('button', { name: 'Queue cleanup' }).click()
    await expect
      .poll(() => calls.some((x) => x.path.endsWith('/cleanup')))
      .toBe(true)
  } finally {
    await page.viewport(1280, 800)
  }
})

it('shows a deployment pause without calling it a stalled worker', async () => {
  policy = {
    ...policy,
    enabled: true,
    workerEnabled: false,
    nextRunAt: '2020-01-01T00:00:00Z',
  }
  const view = await show()
  await expect
    .element(
      view.getByText('Cleanup is paused by the deployment administrator.')
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Queue cleanup' }))
    .toBeDisabled()
  expect(view.container.textContent).not.toContain('check that it is running')
})
