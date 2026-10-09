import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import {
  OrganizationStandardsLibrary,
  StandardLibraryCard,
} from './organization-standards-library'

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  allowed: true,
  save: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('./navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'reader',
      organizationId: 'org',
      organizationWide: true,
      permissions: state.allowed
        ? ['policy.read', 'standards.manage']
        : ['policy.read'],
    },
  }),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.save(...args),
}))
const pack = {
  id: 'baseline-engineering',
  title: 'Baseline Engineering',
  description: 'Core engineering checks.',
  version: '1.0.0',
  digest: 'a'.repeat(64),
  stages: ['ci'],
  rules: [
    {
      id: 'ci.configured',
      title: 'CI configuration',
      guidance: 'Configure CI.',
      capability: 'available',
      requiredIn: ['DEFAULT'],
    },
    {
      id: 'tests.required',
      title: 'Required tests',
      guidance: 'Collect test results.',
      capability: 'import_only',
      requiredIn: ['DEFAULT'],
    },
  ],
}
beforeEach(() => {
  state.allowed = true
  state.save.mockReset().mockResolvedValue({})
  state.query = {
    data: { builtIn: [pack], versions: [] },
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({}),
  }
})
it('uses compact capability summaries and check drill-down instead of a tall rule list', () => {
  const html = renderToStaticMarkup(
    <StandardLibraryCard
      pack={pack}
      organization={false}
      canEdit={true}
      onEdit={() => {}}
      onDetails={() => {}}
      onHistory={() => {}}
    />
  )
  expect(html).toContain('2 checks')
  expect(html).toContain('1 configuration')
  expect(html).toContain('1 CI report')
  expect(html).toContain('Customize')
  expect(html).not.toContain('Required tests')
  expect(html).not.toContain('Passed')
})
it('preselects baseline checks and saves through the real form contract', async () => {
  const view = await render(<OrganizationStandardsLibrary />)
  await userEvent.click(view.getByRole('button', { name: 'New standard' }))
  await userEvent.fill(
    view.getByRole('textbox', { name: 'Name' }),
    'Team standard'
  )
  await userEvent.click(view.getByRole('button', { name: 'Save standard' }))
  await expect
    .poll(() => state.save.mock.calls[0])
    .toEqual([
      '/standards/library',
      {
        title: 'Team standard',
        description: '',
        ruleIds: ['ci.configured', 'tests.required'],
        expectedVersionId: null,
      },
    ])
})
it('shows errors and prevents editing for a read-only user', () => {
  state.allowed = false
  let html = renderToStaticMarkup(<OrganizationStandardsLibrary />)
  expect(html).not.toContain('New standard')
  state.query = {
    ...state.query,
    isError: true,
    error: new Error('Access denied'),
  }
  html = renderToStaticMarkup(<OrganizationStandardsLibrary />)
  expect(html).toContain('Access denied')
  expect(html).not.toContain('No organization standards yet')
})
it('preserves the editor after a save conflict and presents a useful error', async () => {
  state.save.mockRejectedValue(
    new Error('Standard changed. Reload before saving.')
  )
  const view = await render(<OrganizationStandardsLibrary />)
  await userEvent.click(view.getByRole('button', { name: 'New standard' }))
  await userEvent.fill(
    view.getByRole('textbox', { name: 'Name' }),
    'Team standard'
  )
  await userEvent.click(view.getByRole('button', { name: 'Save standard' }))
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Standard changed. Reload before saving.')
  await expect
    .element(view.getByRole('textbox', { name: 'Name' }))
    .toHaveValue('Team standard')
})
