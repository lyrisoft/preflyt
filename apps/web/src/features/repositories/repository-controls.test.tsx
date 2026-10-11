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
const mount = () =>
  render(
    <RepositoryControls
      repositoryId='101'
      repositoryName='org/service'
      filter='all'
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
