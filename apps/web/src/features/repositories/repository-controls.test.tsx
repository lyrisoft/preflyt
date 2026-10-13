import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RepositoryControls } from './repository-controls'
import type { Standards } from './repository-queries'

const state = vi.hoisted(() => ({ data: {} as Standards }))
vi.mock('./repository-queries', () => ({
  useStandards: () => ({ data: state.data, isPending: false, isError: false }),
}))
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.data = {
    selection: null,
    selectionIntegrity: true,
    catalogue: [],
    controls: [
      {
        id: 'tests.required',
        title: 'Test execution',
        required: true,
        configuration: 'HINT_DETECTED',
        capability: 'import_only',
        reason: 'Test file found',
        evidence: [{ path: 'tests/example.test.ts', blobSha: 'a'.repeat(40) }],
      },
    ],
    profileSnapshot: null,
  } as unknown as Standards
})
const mount = (filter: 'all' | 'review' | 'ci' = 'all') =>
  render(
    <RepositoryControls
      repositoryId='101'
      repositoryName='org/service'
      filter={filter}
      onFilter={vi.fn()}
      onOpenTab={vi.fn()}
    />
  )
it('shows preview checks as suggestions rather than saved requirements', async () => {
  const view = await mount()
  await expect
    .element(page.getByRole('heading', { name: 'Repository check setup' }))
    .toBeVisible()
  await expect
    .element(
      page.getByText('Suggested checks · choose standards to apply them')
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('cell', { name: 'Suggested', exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('cell', { name: 'Required', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Choose standards' }))
    .toBeVisible()
  await view.unmount()
})
it('keeps saved requirements neutral and found-file setup green', async () => {
  state.data.selection = {
    profile: 'RECOMMENDED',
    revision: 6,
  } as Standards['selection']
  const view = await mount()
  const required = page.getByRole('cell', { name: 'Required', exact: true })
  await expect.element(required).toBeVisible()
  expect(
    required.element().querySelector('[data-slot="badge"]')?.className
  ).toContain('bg-muted')
  const found = page.getByRole('cell', {
    name: 'Related files found',
    exact: true,
  })
  expect(
    found.element().querySelector('[data-slot="badge"]')?.className
  ).toContain('text-success-text')
  await expect
    .element(page.getByRole('button', { name: 'Choose standards' }))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('excludes build and type checks without detectors from setup gaps but retains them in CI checks', async () => {
  state.data.selection = {
    profile: 'RECOMMENDED',
    revision: 3,
  } as Standards['selection']
  state.data.controls = ['Build validation', 'Type checking'].map(
    (title, index) => ({
      id: index ? 'types.required' : 'build.required',
      title,
      required: true,
      configuration: 'NOT_INSPECTED',
      capability: 'import_only',
      evidence: [],
      reason: 'Repository inspection has no setup detector for this check.',
    })
  )
  let view = await mount('review')
  await expect
    .element(page.getByRole('button', { name: 'Setup gaps 0', exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByText('No checks match this filter.'))
    .toBeVisible()
  await view.unmount()
  view = await mount('ci')
  await expect
    .element(page.getByRole('button', { name: 'CI checks 2', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect
    .element(
      page.getByRole('button', { name: 'View Build validation details' })
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'View Type checking details' }))
    .toBeVisible()
  await expect
    .element(
      page
        .getByRole('cell', { name: 'CI evidence required', exact: true })
        .first()
    )
    .toBeVisible()
  await view.unmount()
})
it('still exposes genuine missing and undetermined setup in setup gaps', async () => {
  state.data.controls = ['MISSING', 'UNKNOWN'].map((configuration, index) => ({
    ...state.data.controls[0],
    id: String(index),
    configuration,
  }))
  const view = await mount('review')
  await expect
    .element(page.getByRole('button', { name: 'Setup gaps 2', exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('cell', { name: 'Not found', exact: true }))
    .toBeVisible()
  await expect
    .element(
      page.getByRole('cell', {
        name: 'Configuration not determined',
        exact: true,
      })
    )
    .toBeVisible()
  await view.unmount()
})
