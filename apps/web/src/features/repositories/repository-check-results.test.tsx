import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { GatePreview } from './engineering-queries'
import { RepositoryCheckResults } from './repository-check-results'
import type { Profile } from './repository-queries'

const mocks = vi.hoisted(() => ({
  standards: vi.fn(),
  history: vi.fn(),
  evaluation: vi.fn(),
}))
vi.mock('./repository-queries', () => ({
  useStandards: mocks.standards,
  useAssessmentList: mocks.history,
}))
vi.mock('./engineering-queries', () => ({ useGatePreview: mocks.evaluation }))

const sha = 'a'.repeat(40)
const controls = [
  { id: 'build.required', title: 'Build validation', required: true },
  { id: 'types.required', title: 'Type checking', required: true },
]
const selection = {
  id: 'policy-selection',
  revision: 3,
  policyId: 'policy-v3',
  branchRef: 'refs/heads/development',
}
const query = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
})
const evaluated = (statuses = ['PASS', 'PASS']) =>
  ({
    evaluatorVersion: 2,
    evaluationHash: 'e'.repeat(64),
    requiredRules: 2,
    requiredRulesSatisfied: statuses.filter((status) => status === 'PASS')
      .length,
    requiredRulesBlocked: statuses.filter((status) => status === 'BLOCK')
      .length,
    requiredRulesIncomplete: statuses.filter(
      (status) => status === 'INCOMPLETE'
    ).length,
    advisoryIncomplete: 0,
    advisoryFailed: 0,
    sourceSha: sha,
    status: 'PASS',
    reasons: [],
    rules: controls.map((control, index) => ({
      ruleId: control.id,
      title: control.title,
      required: control.required,
      status: statuses[index],
      deliveryId: statuses[index] === 'INCOMPLETE' ? null : 'delivery',
      reasons:
        statuses[index] === 'BLOCK'
          ? ['APPROVED_CI_SOURCE_FAILED']
          : statuses[index] === 'INCOMPLETE'
            ? ['CI_OBSERVATION_MISSING']
            : [],
    })),
  }) as GatePreview
beforeEach(() => {
  vi.clearAllMocks()
  mocks.standards.mockReturnValue(
    query({ selectionIntegrity: true, selection, controls })
  )
  mocks.history.mockReturnValue(
    query({
      assessments: [
        {
          id: 'assessment-v3',
          sourceSha: sha,
          createdAt: '2026-10-12T10:00:00Z',
        },
      ],
    })
  )
  mocks.evaluation.mockReturnValue(query(evaluated()))
})
const mount = (profile: Profile | null = null) =>
  render(
    <RepositoryCheckResults
      repositoryId='101'
      profile={profile}
      onOpenTab={vi.fn()}
    />
  )
it('shows server-evaluated results at the assessed commit and removes configuration charts', async () => {
  await mount()
  await expect
    .element(page.getByLabelText('Passed: 2', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Failed: 0', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Missing evidence: 0', { exact: true }))
    .toBeVisible()
  const results = page.getByLabelText('Repository check results')
  await expect
    .element(results.getByText('Assessed commit', { exact: false }))
    .toBeVisible()
  await expect
    .element(results.getByText(sha.slice(0, 12), { exact: true }))
    .toBeVisible()
  await expect
    .element(results.getByRole('link', { name: 'View assessment' }))
    .toHaveAttribute(
      'href',
      '/assessments?repository=101&assessment=assessment-v3'
    )
  await expect
    .element(
      results.getByRole('link', { name: 'View evidence for Build validation' })
    )
    .toHaveAttribute(
      'href',
      '/assessments?repository=101&assessment=assessment-v3'
    )
  await expect
    .element(page.getByText('Check configuration', { exact: true }))
    .not.toBeInTheDocument()
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  expect(mocks.history).toHaveBeenCalledWith('101', {
    selectionId: 'policy-selection',
    selectionRevision: 3,
    enabled: true,
  })
})
it('separates failed checks from missing evidence and explains each incomplete requirement', async () => {
  mocks.evaluation.mockReturnValue(query(evaluated(['BLOCK', 'INCOMPLETE'])))
  await mount()
  await expect
    .element(page.getByLabelText('Passed: 0', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Failed: 1', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Missing evidence: 1', { exact: true }))
    .toBeVisible()
  const results = page.getByLabelText('Repository check results')
  await expect
    .element(results.getByText('Failed', { exact: true }))
    .toHaveClass('text-danger-text')
  await expect
    .element(results.getByText('Incomplete', { exact: true }))
    .toHaveClass('text-warning-text')
  await expect
    .element(results.getByText('No CI result was collected for this check.'))
    .toBeVisible()
})
it('shows an honest unassessed state without borrowing a provider success or displaying zero missing results', async () => {
  mocks.history.mockReturnValue(query({ assessments: [] }))
  mocks.evaluation.mockReturnValue({ ...query(undefined), isPending: true })
  await mount()
  await expect
    .element(
      page.getByText(/No saved assessment for this selection and revision/)
    )
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Passed: Unavailable', { exact: true }))
    .toBeVisible()
  await expect
    .element(
      page.getByLabelText('Missing evidence: Unavailable', { exact: true })
    )
    .toBeVisible()
  expect(mocks.evaluation).toHaveBeenCalledWith('101', undefined, true)
  await expect
    .element(
      page
        .getByLabelText('Repository check results')
        .getByText('Not evaluated', { exact: true })
        .first()
    )
    .toBeVisible()
})
it('rejects mismatched commit results instead of showing a cached passing count', async () => {
  mocks.evaluation.mockReturnValue(
    query({ ...evaluated(), sourceSha: 'b'.repeat(40) })
  )
  await mount()
  await expect.element(page.getByRole('alert')).toBeVisible()
  await expect
    .element(page.getByLabelText('Passed: Unavailable', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('cell', { name: 'Passed', exact: true }))
    .not.toBeInTheDocument()
})
it('clears a cached success when evidence or repository access fails', async () => {
  mocks.evaluation.mockReturnValue({
    ...query(evaluated()),
    isError: true,
    error: new Error('Repository access changed.'),
  })
  await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access changed.')
  await expect
    .element(page.getByLabelText('Passed: Unavailable', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Retry', exact: true }))
    .toBeVisible()
})
it('does not evaluate invalid standards or use an older assessment', async () => {
  mocks.standards.mockReturnValue(
    query({ selectionIntegrity: false, selection, controls })
  )
  await mount()
  expect(mocks.history).toHaveBeenCalledWith('101', {
    selectionId: undefined,
    selectionRevision: undefined,
    enabled: false,
  })
  expect(mocks.evaluation).toHaveBeenCalledWith('101', undefined, false)
  await expect.element(page.getByRole('alert')).toBeVisible()
})
it('keeps a loading result unavailable until its server evaluation completes', async () => {
  mocks.evaluation.mockReturnValue({ ...query(undefined), isPending: true })
  await mount()
  await expect
    .element(page.getByRole('status', { name: 'Loading check results' }))
    .toBeVisible()
  await expect
    .element(page.getByLabelText('Passed: Unavailable', { exact: true }))
    .toBeVisible()
})
it('distinguishes assessed and inspected commits instead of presenting an older profile as the evaluated source', async () => {
  await mount({ sourceSha: 'b'.repeat(40) } as Profile)
  await expect
    .element(page.getByText(/differs from the inspected commit bbbbbbb/))
    .toBeVisible()
  await expect
    .element(
      page
        .getByLabelText('Repository check results')
        .getByText(sha.slice(0, 12), { exact: true })
    )
    .toBeVisible()
})
it('remains usable at 320px in light and dark themes', async () => {
  await page.viewport(320, 900)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await mount()
    await expect
      .element(page.getByText('Check results', { exact: true }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await expect
      .element(page.getByRole('button', { name: 'Reload check results' }))
      .toBeVisible()
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
