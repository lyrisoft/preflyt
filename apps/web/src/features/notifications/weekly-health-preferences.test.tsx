import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  WeeklyHealthPreferences,
  type WeeklyHealthPreferencesData,
} from './weekly-health-preferences'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'member', organizationId: 'org' },
  }),
}))
const initial: WeeklyHealthPreferencesData = {
  enabled: false,
  repositoryIds: [],
  suggestedRepositoryIds: ['1234'],
  day: 1,
  hour: 9,
  timezone: 'UTC',
  emailAddress: 'member@example.com',
  deliveryAvailable: true,
  repositories: [
    { id: '1234', name: 'org/api' },
    { id: '5678', name: 'org/web' },
  ],
}
afterEach(() => vi.unstubAllGlobals())
async function mount(value = initial) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) =>
    Response.json(
      init?.method === 'POST'
        ? { ...value, ...JSON.parse(String(init.body)) }
        : value
    )
  )
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = await render(
    <QueryClientProvider client={client}>
      <WeeklyHealthPreferences />
    </QueryClientProvider>
  )
  return { view, client, fetchMock }
}
it('saves repository selection and timezone separately from individual email alerts', async () => {
  const { view, client, fetchMock } = await mount()
  await expect
    .element(page.getByRole('checkbox', { name: 'org/api' }))
    .toBeVisible()
  await page
    .getByRole('switch', { name: 'Send me a weekly health email' })
    .click()
  await expect
    .element(
      page.getByText(
        'Select at least one repository to receive the weekly email.'
      )
    )
    .toBeVisible()
  await expect
    .element(
      page.getByRole('button', { name: 'Save weekly email preferences' })
    )
    .toBeDisabled()
  await page.getByRole('button', { name: 'Use assigned repositories' }).click()
  await page
    .getByRole('combobox', { name: 'Timezone' })
    .selectOptions('Africa/Lagos')
  await page
    .getByRole('button', { name: 'Save weekly email preferences' })
    .click()
  await expect
    .poll(() =>
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')
    )
    .toBe(true)
  const [, init] = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'POST'
  )!
  expect(JSON.parse(String(init?.body))).toEqual({
    enabled: true,
    repositoryIds: ['1234'],
    day: 1,
    hour: 9,
    timezone: 'Africa/Lagos',
  })
  await view.unmount()
  client.clear()
})
it('supports repository search and clear selection', async () => {
  const { view, client } = await mount({ ...initial, repositoryIds: ['1234'] })
  await page.getByRole('textbox', { name: 'Find a repository' }).fill('missing')
  await expect
    .element(page.getByText('No repositories match your search.'))
    .toBeVisible()
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect
    .element(page.getByText('0 of 50 repositories selected'))
    .toBeVisible()
  await view.unmount()
  client.clear()
})
it('explains missing delivery email and allows an existing subscription to be disabled', async () => {
  const { view, client } = await mount({
    ...initial,
    enabled: true,
    repositoryIds: ['1234'],
    emailAddress: null,
  })
  await expect
    .element(
      page.getByText(
        'Add and verify a delivery email above to enable weekly emails.'
      )
    )
    .toBeVisible()
  await page
    .getByRole('switch', { name: 'Send me a weekly health email' })
    .click()
  await expect
    .element(
      page.getByRole('button', { name: 'Save weekly email preferences' })
    )
    .toBeEnabled()
  await view.unmount()
  client.clear()
})
it('shows a recoverable settings load failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ message: 'Unavailable' }, { status: 503 })
    )
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = await render(
    <QueryClientProvider client={client}>
      <WeeklyHealthPreferences />
    </QueryClientProvider>
  )
  await expect
    .element(page.getByText('Weekly email settings could not be loaded.'))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Try again' }))
    .toBeVisible()
  await view.unmount()
  client.clear()
})
it('keeps narrow layouts within the viewport', async () => {
  await page.viewport(320, 780)
  const { view, client } = await mount()
  await expect
    .element(page.getByRole('checkbox', { name: 'org/api' }))
    .toBeVisible()
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
    // Allow shared theme color transitions to finish before visual review.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await page.screenshot({
      path: `__screenshots__/weekly-health-${theme}-mobile.png`,
    })
  }
  document.documentElement.classList.remove('light', 'dark')
  await view.unmount()
  client.clear()
  await page.viewport(1280, 800)
})

it('hides cached repository names when a fresh settings read is denied', async () => {
  const { view, client } = await mount()
  await expect
    .element(page.getByRole('checkbox', { name: 'org/api' }))
    .toBeVisible()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ message: 'Access revoked' }, { status: 403 })
    )
  )
  await client.invalidateQueries({ queryKey: ['weekly-health-preferences'] })
  await expect
    .element(page.getByText('Weekly email settings could not be loaded.'))
    .toBeVisible()
  await expect
    .element(page.getByRole('checkbox', { name: 'org/api' }))
    .not.toBeInTheDocument()
  await view.unmount()
  client.clear()
})

it('groups repository selection and delivery schedule on desktop', async () => {
  await page.viewport(1280, 900)
  const { view, client } = await mount({
    ...initial,
    enabled: true,
    repositoryIds: ['1234'],
    timezone: 'Africa/Lagos',
  })
  await expect
    .element(page.getByRole('group', { name: 'Delivery schedule' }))
    .toBeVisible()
  const repositories = page
    .getByRole('group', { name: 'Repositories', exact: true })
    .element()
    .getBoundingClientRect()
  const schedule = page
    .getByRole('group', { name: 'Delivery schedule' })
    .element()
    .getBoundingClientRect()
  expect(Math.abs(schedule.top - repositories.top)).toBeLessThan(4)
  expect(schedule.left).toBeGreaterThan(repositories.right)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await page.screenshot({
      path: `__screenshots__/weekly-health-${theme}-desktop.png`,
    })
  }
  document.documentElement.classList.remove('light', 'dark')
  await view.unmount()
  client.clear()
})
it('keeps long addresses and repository names readable at 200 percent text size', async () => {
  await page.viewport(320, 900)
  const original = document.documentElement.style.fontSize
  document.documentElement.style.fontSize = '200%'
  const { view, client } = await mount({
    ...initial,
    emailAddress: `${'member'.repeat(20)}@example.com`,
    repositories: [
      { id: '1234', name: `organization/${'repository'.repeat(12)}` },
    ],
  })
  await expect
    .element(page.getByRole('combobox', { name: 'Timezone' }))
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  )
  await view.unmount()
  client.clear()
  document.documentElement.style.fontSize = original
  await page.viewport(1280, 800)
})
