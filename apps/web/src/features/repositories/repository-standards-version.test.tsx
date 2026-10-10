import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RepositoryStandards } from './repository-standards'

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))
vi.mock('./repository-queries', () => ({
  useStandards: () => ({
    data: state.data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
const pack = (version: string, capability: string) => ({
  id: 'backend-service',
  title: 'Backend Services',
  version,
  description: 'Backend checks',
  digest: 'a'.repeat(64),
  stages: ['ci'],
  rules: [
    {
      id: 'types.required',
      title: 'Type checking',
      capability,
      requiredIn: ['RECOMMENDED'],
      guidance: 'Run the approved checker.',
    },
  ],
})
it('offers an explicit upgrade without counting historical versions as extra packs', async () => {
  state.data = {
    catalogue: [pack('1.1.0', 'import_only'), pack('1.0.0', 'planned')],
    recommendations: [],
    selectionIntegrity: true,
    selection: {
      id: 'selection',
      profile: 'RECOMMENDED',
      packs: [{ id: 'backend-service', version: '1.0.0' }],
      createdAt: '2026-10-10T00:00:00Z',
      revision: 1,
    },
  }
  await render(<RepositoryStandards repositoryId='1' canManage={false} />)
  await expect
    .element(
      page.getByText('New standard versions are available.', { exact: false })
    )
    .toBeVisible()
  await expect
    .element(page.getByText('Ask a workspace administrator', { exact: false }))
    .toBeVisible()
  await expect
    .element(page.getByRole('img', { name: '1 of 1 catalogue packs saved' }))
    .toBeVisible()
  expect(state.data.selection).toMatchObject({ packs: [{ version: '1.0.0' }] })
})
