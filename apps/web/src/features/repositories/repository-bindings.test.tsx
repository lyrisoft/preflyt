import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { BindingResult, SourceIdentity } from './engineering-queries'
import { RepositoryBindings } from './repository-bindings'
import type { CiEvidence, Standards } from './repository-queries'

const state = vi.hoisted(() => ({
  saved: {} as BindingResult,
  standards: {} as Standards,
  evidence: {} as CiEvidence,
  failed: false,
  evidenceFailed: false,
  evidencePending: false,
  refresh: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('./engineering-queries', async (original) => ({
  ...(await original<typeof import('./engineering-queries')>()),
  useBindings: () => ({
    data: state.saved,
    isPending: false,
    isError: state.failed,
    isFetching: false,
    error: new Error('Access changed'),
    refetch: vi.fn(),
  }),
}))
vi.mock('./repository-queries', () => ({
  useStandards: () => ({
    data: state.standards,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useCiEvidence: () => ({
    data: state.evidence,
    isError: state.evidenceFailed,
    isPending: state.evidencePending,
    isFetching: false,
    refetch: state.refresh,
  }),
}))
const tests = 'Required test execution'
function observations(...sources: SourceIdentity[]): CiEvidence {
  return {
    enabled: true,
    observations: sources.map((sourceIdentity) => ({ sourceIdentity })),
  } as unknown as CiEvidence
}
function existing(active = true) {
  state.saved = {
    ...state.saved,
    active,
    binding: {
      id: 'saved-binding',
      revision: 2,
      selectionId: active ? 'selection-5' : 'selection-4',
      createdAt: '2026-10-10T00:00:00Z',
      bindings: [
        {
          ruleId: 'tests',
          kind: 'check_run',
          appId: '15368',
          checkName: 'Run tests',
        },
      ],
    },
  }
}
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.failed = state.evidenceFailed = state.evidencePending = false
  state.saved = {
    active: false,
    binding: null,
    supportedRuleIds: ['tests', 'sast'],
  }
  state.standards = {
    selectionIntegrity: true,
    catalogue: [],
    adoptionProfiles: [],
    recommendations: [],
    profileSnapshot: null,
    selection: {
      id: 'selection-5',
      revision: 5,
      profile: 'RECOMMENDED',
      packs: [],
      sourceSha: null,
      createdAt: '2026-10-10T00:00:00Z',
    },
    controls: [
      {
        id: 'tests',
        title: tests,
        capability: 'import_only',
        required: true,
        configuration: '',
        reason: '',
        evidence: [],
      },
      {
        id: 'sast',
        title: 'Static application security',
        capability: 'import_only',
        required: true,
        configuration: '',
        reason: '',
        evidence: [],
      },
    ],
  }
  state.evidence = observations(
    {
      kind: 'check_run',
      appId: '15368',
      checkName: 'Run tests',
      runAttempt: 3,
    },
    { kind: 'workflow_run', workflowId: '456' }
  )
  state.refresh.mockReset()
  state.fetch.mockReset().mockResolvedValue(
    new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', state.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})
async function mount(canManage = true) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <div className='p-6'>
        <RepositoryBindings repositoryId='1097527174' canManage={canManage} />
      </div>
    </QueryClientProvider>
  )
}
async function open() {
  await page.getByRole('button', { name: /^(Connect|Edit) CI jobs$/ }).click()
  await expect.element(page.getByRole('dialog')).toBeVisible()
  await expect
    .poll(
      () => getComputedStyle(document.querySelector('[role="dialog"]')!).opacity
    )
    .toBe('1')
}
async function choose(rule: string, option: string) {
  await page.getByRole('combobox', { name: rule, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect.element(page.getByRole('listbox')).not.toBeInTheDocument()
}
it('selects a received job by name and saves its exact identity with revision tokens', async () => {
  const view = await mount()
  await open()
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await choose(tests, 'Run tests')
  await page.screenshot({ path: '__screenshots__/ci-jobs-desktop.png' })
  await expect
    .element(page.getByRole('textbox', { name: /GitHub App ID/ }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Save connections' }).click()
  await expect.poll(() => state.fetch.mock.calls.length).toBe(1)
  const [url, request] = state.fetch.mock.calls[0]
  expect(url).toContain('/github/repositories/1097527174/ci-bindings')
  expect(JSON.parse(request.body)).toEqual({
    expectedSelectionId: 'selection-5',
    expectedBindingId: null,
    bindings: [
      {
        ruleId: 'tests',
        kind: 'check_run',
        appId: '15368',
        checkName: 'Run tests',
      },
    ],
  })
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await view.unmount()
})
it('offers concrete instructions and refresh when no jobs have arrived, without approving an empty setup', async () => {
  state.evidence = observations()
  const view = await mount()
  await open()
  await expect.element(page.getByText('No CI jobs received yet')).toBeVisible()
  await expect
    .element(page.getByText(/Run your tests or scans in GitHub/))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await page.getByRole('button', { name: 'Refresh jobs', exact: true }).click()
  expect(state.refresh).toHaveBeenCalledOnce()
  expect(state.fetch).not.toHaveBeenCalled()
  await view.unmount()
})
it('keeps manual entry explicit and rejects invalid IDs and blank check names', async () => {
  const view = await mount()
  await open()
  await choose(tests, 'Enter job details manually…')
  await page
    .getByRole('textbox', { name: `GitHub App ID for ${tests}` })
    .fill('0')
  await page
    .getByRole('textbox', { name: `Exact check name for ${tests}` })
    .fill('Run tests')
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await page
    .getByRole('textbox', { name: `GitHub App ID for ${tests}` })
    .fill('15368')
  await page
    .getByRole('textbox', { name: `Exact check name for ${tests}` })
    .fill('   ')
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await page
    .getByRole('textbox', { name: `Exact check name for ${tests}` })
    .fill('Run tests')
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeEnabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(state.fetch).not.toHaveBeenCalled()
  await view.unmount()
})
it('preserves saved identities when the observed job list is empty and warns before removing them', async () => {
  existing()
  state.evidence = observations()
  const view = await mount()
  await open()
  await expect
    .element(page.getByRole('combobox', { name: tests, exact: true }))
    .toHaveTextContent('Run tests · saved')
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await choose(tests, 'Not connected')
  await expect
    .element(page.getByText(/Saving will remove 1 existing connection/))
    .toBeVisible()
  await page.getByRole('button', { name: 'Save connections' }).click()
  await expect.poll(() => state.fetch.mock.calls.length).toBe(1)
  expect(JSON.parse(state.fetch.mock.calls[0][1].body)).toEqual({
    expectedSelectionId: 'selection-5',
    expectedBindingId: 'saved-binding',
    bindings: [],
  })
  await view.unmount()
})
it('requires an explicit resave after standards change and retains the conflict message', async () => {
  existing(false)
  state.fetch.mockResolvedValue(new Response('{}', { status: 409 }))
  const view = await mount()
  await expect.element(page.getByText('0 of 2 checks connected.')).toBeVisible()
  await expect
    .element(page.getByText(/Standards changed. Review and save/))
    .toBeVisible()
  await open()
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeEnabled()
  await page.getByRole('button', { name: 'Save connections' }).click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(
      'Standards or CI jobs changed. Close this editor, reload and review again.'
    )
  expect(JSON.parse(state.fetch.mock.calls[0][1].body).expectedBindingId).toBe(
    'saved-binding'
  )
  await view.unmount()
})
it('hides cached observations after a load failure and keeps saved connections readable', async () => {
  existing()
  state.evidenceFailed = true
  const view = await mount()
  await open()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('CI jobs could not load.')
  await page.getByRole('combobox', { name: tests, exact: true }).click()
  await expect
    .element(
      page.getByRole('option', { name: 'GitHub workflow #456', exact: true })
    )
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('option', { name: 'Run tests · saved' }))
    .toBeVisible()
  await page.getByRole('option', { name: 'Run tests · saved' }).click()
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await view.unmount()
})
it('shows clear read-only guidance and disables setup for invalid standards or missing selection', async () => {
  let view = await mount(false)
  await expect
    .element(page.getByRole('button', { name: 'Connect CI jobs' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText(/Ask an administrator to connect/))
    .toBeVisible()
  await view.unmount()
  state.standards.selectionIntegrity = false
  view = await mount()
  await expect
    .element(page.getByRole('button', { name: 'Connect CI jobs' }))
    .toBeDisabled()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Saved standards could not be verified.')
  await view.unmount()
  state.standards.selection = null
  view = await mount()
  await expect
    .element(page.getByRole('button', { name: 'Connect CI jobs' }))
    .toBeDisabled()
  await expect
    .element(page.getByText(/Choose standards above first/))
    .toBeVisible()
  await view.unmount()
})
it('hides saved connection data after repository access fails', async () => {
  existing()
  state.failed = true
  const view = await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Access changed')
  await expect
    .element(page.getByText('Run tests', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Connect CI jobs' }))
    .toBeDisabled()
  await view.unmount()
})
it('uses the server-supported checks, deduplicates job attempts and preserves workflow identities', async () => {
  state.saved.supportedRuleIds = ['tests']
  state.evidence = observations(
    { kind: 'workflow_run', workflowId: '456', runAttempt: 1 },
    { kind: 'workflow_run', workflowId: '456', runAttempt: 2 }
  )
  const view = await mount()
  await open()
  await expect
    .element(
      page.getByRole('combobox', { name: 'Static application security' })
    )
    .not.toBeInTheDocument()
  await choose(tests, 'GitHub workflow #456')
  await page.getByRole('button', { name: 'Save connections' }).click()
  await expect.poll(() => state.fetch.mock.calls.length).toBe(1)
  expect(JSON.parse(state.fetch.mock.calls[0][1].body).bindings).toEqual([
    { ruleId: 'tests', kind: 'workflow_run', workflowId: '456' },
  ])
  await view.unmount()
})
it.each(['light', 'dark'])(
  'keeps the dialog bounded and usable at 320px in %s mode',
  async (theme) => {
    await page.viewport(320, 740)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    state.evidence = observations()
    const view = await mount()
    await open()
    await expect
      .element(page.getByRole('button', { name: 'Cancel', exact: true }))
      .toBeVisible()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(
      740 * 0.85 + 1
    )
    expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth)
    await page.screenshot({
      path: `__screenshots__/ci-jobs-${theme}-mobile.png`,
    })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await view.unmount()
  }
)

it('explains disabled job collection before asking the user to rerun CI', async () => {
  state.evidence = { ...observations(), enabled: false }
  const view = await mount()
  await open()
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('CI job updates are off.')
  await expect
    .element(page.getByText('No CI jobs received yet'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Save connections' }))
    .toBeDisabled()
  await view.unmount()
})
it('distinguishes same-named checks from different GitHub Apps', async () => {
  state.evidence = observations(
    { kind: 'check_run', appId: '15368', checkName: 'Run tests' },
    { kind: 'check_run', appId: '456', checkName: 'Run tests' }
  )
  const view = await mount()
  await open()
  await choose(tests, 'Run tests · App 456')
  await page.getByRole('button', { name: 'Save connections' }).click()
  await expect.poll(() => state.fetch.mock.calls.length).toBe(1)
  expect(JSON.parse(state.fetch.mock.calls[0][1].body).bindings[0].appId).toBe(
    '456'
  )
  await view.unmount()
})
