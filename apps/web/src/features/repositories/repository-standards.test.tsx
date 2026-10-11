import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { Pack, Standards } from './repository-queries'
import { RepositoryStandards } from './repository-standards'

const state = vi.hoisted(() => ({
  data: {} as Standards,
  pending: false,
  failed: false,
  save: vi.fn(),
}))
vi.mock('./repository-queries', () => ({
  useStandards: () => ({
    data: state.data,
    isPending: state.pending,
    isError: state.failed,
    isFetching: false,
    error: new Error('Standards unavailable'),
    refetch: vi.fn(),
  }),
}))
vi.mock('./governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.save(...args),
}))
const pack = (id: string, version = '1.0.0'): Pack => ({
  id,
  title: `Standard ${id}`,
  version,
  digest: 'a'.repeat(64),
  description: 'Engineering requirements',
  stages: ['ci'],
  rules: [
    {
      id: 'tests',
      title: 'Required test execution',
      capability: 'import_only',
      requiredIn: ['RECOMMENDED', 'STRICT'],
      guidance: 'Run tests',
    },
  ],
})
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.failed = state.pending = false
  state.save.mockReset().mockResolvedValue({ id: 'next-selection' })
  state.data = {
    selection: null,
    selectionIntegrity: true,
    catalogue: [pack('baseline'), pack('backend')],
    adoptionProfiles: ['DEFAULT', 'RECOMMENDED', 'STRICT'],
    recommendations: [
      { id: 'baseline', version: '1.0.0', reason: 'Core checks' },
    ],
    controls: [],
    profileSnapshot: null,
    qualityGate: null,
  } as unknown as Standards
})
async function mount(canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <div className='p-6'>
        <RepositoryStandards
          repositoryId='101'
          repositoryName='org/service'
          canManage={canManage}
          sourceBindings={<h2>CI jobs</h2>}
          policyRevisions={<h2>Branch policies</h2>}
        />
      </div>
    </QueryClientProvider>
  )
}
it('requires a review before saving exact recommended versions', async () => {
  const view = await mount()
  await expect
    .element(page.getByRole('heading', { name: 'CI jobs' }))
    .not.toBeInTheDocument()
  await page
    .getByRole('button', { name: 'Choose standards', exact: true })
    .click()
  await expect
    .element(page.getByRole('checkbox', { name: 'Standard baseline' }))
    .toBeChecked()
  await page.getByRole('checkbox', { name: 'Standard backend' }).click()
  await page.getByRole('button', { name: 'Review changes' }).click()
  await expect
    .element(page.getByRole('heading', { name: 'Review changes' }))
    .toBeVisible()
  await expect
    .element(
      page.getByText(
        'Recommended requirements: 1 required check, 0 optional checks.'
      )
    )
    .toBeVisible()
  await page.screenshot({
    path: '__screenshots__/s3-repository-review-desktop.png',
  })
  expect(state.save).not.toHaveBeenCalled()
  await page.getByRole('button', { name: 'Save standards' }).click()
  await expect
    .poll(() => state.save.mock.calls[0])
    .toEqual([
      '/github/repositories/101/standards',
      {
        profile: 'RECOMMENDED',
        packs: [
          { id: 'baseline', version: '1.0.0' },
          { id: 'backend', version: '1.0.0' },
        ],
        expectedSelectionId: null,
      },
    ])
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await view.unmount()
})
it('preserves saved historical versions and sends the selection concurrency token', async () => {
  state.data.catalogue = [pack('baseline', '2.0.0'), pack('baseline')]
  state.data.selection = {
    id: 'existing-selection',
    revision: 3,
    profile: 'RECOMMENDED',
    packs: [{ id: 'baseline', version: '1.0.0' }],
    sourceSha: null,
    createdAt: '2026-10-10T00:00:00Z',
  }
  const view = await mount()
  await page.getByRole('button', { name: 'Edit standards' }).click()
  await expect
    .element(page.getByRole('combobox', { name: 'Standard baseline version' }))
    .toHaveTextContent('v1.0.0')
  await page.getByRole('button', { name: 'Review changes' }).click()
  await page.getByRole('button', { name: 'Save standards' }).click()
  await expect
    .poll(() => state.save.mock.calls[0]?.[1])
    .toMatchObject({
      expectedSelectionId: 'existing-selection',
      packs: [{ id: 'baseline', version: '1.0.0' }],
    })
  await view.unmount()
})
it('keeps rejected saves visible for recovery and prevents more than five standards', async () => {
  state.data.catalogue = Array.from({ length: 6 }, (_, i) => pack(String(i)))
  state.data.recommendations = []
  const view = await mount()
  await page.getByRole('button', { name: 'Choose standards' }).click()
  for (let i = 0; i < 6; i++)
    await page.getByRole('checkbox', { name: `Standard ${i}` }).click()
  await expect
    .element(page.getByRole('button', { name: 'Review changes' }))
    .toBeDisabled()
  await page.getByRole('checkbox', { name: 'Standard 5' }).click()
  state.save.mockRejectedValue(
    new Error('Selection changed. Reload before saving.')
  )
  await page.getByRole('button', { name: 'Review changes' }).click()
  await page.getByRole('button', { name: 'Save standards' }).click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Selection changed. Reload before saving.')
  await expect.element(page.getByRole('dialog')).toBeVisible()
  await view.unmount()
})
it('shows loading and access failures without exposing cached saved data or edit actions', async () => {
  state.failed = true
  const failed = await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Standards unavailable')
  await expect
    .element(page.getByRole('button', { name: 'Choose standards' }))
    .not.toBeInTheDocument()
  await failed.unmount()
  state.failed = false
  state.pending = true
  const loading = await mount(false)
  await expect
    .element(page.getByRole('status', { name: 'Loading standards' }))
    .toBeVisible()
  await loading.unmount()
  state.pending = false
  const reader = await mount(false)
  await expect
    .element(
      page.getByText('Ask a repository administrator to choose standards.')
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Choose standards' }))
    .not.toBeInTheDocument()
  await reader.unmount()
})
it('fits repository review at 320px in both themes with keyboard focus', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await mount()
    await page.getByRole('button', { name: 'Choose standards' }).click()
    await page.getByRole('button', { name: 'Review changes' }).click()
    await expect
      .element(page.getByRole('button', { name: 'Save standards' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/s3-repository-review-${dark ? 'dark' : 'light'}-mobile.png`,
    })
    const button = page.getByRole('button', { name: 'Back' }).element()
    button.focus()
    expect(document.activeElement).toBe(button)
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
})

it('shows CI jobs directly after saved standards and before branch policies', async () => {
  state.data.selection = {
    id: 'existing-selection',
    revision: 3,
    profile: 'RECOMMENDED',
    packs: [{ id: 'baseline', version: '1.0.0' }],
    sourceSha: null,
    createdAt: '2026-10-10T00:00:00Z',
  }
  const view = await mount()
  await expect
    .element(page.getByRole('heading', { name: 'CI jobs' }))
    .toBeVisible()
  const headings = Array.from(document.querySelectorAll('h2')).map(
    (node) => node.textContent
  )
  expect(headings).toEqual([
    'Repository standards',
    'CI jobs',
    'Branch policies',
  ])
  await expect
    .element(page.getByRole('button', { name: 'Configure check sources' }))
    .not.toBeInTheDocument()
  await view.unmount()
})
