import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PipelineWorkflowSetup } from './pipeline-workflow-setup'

const state = vi.hoisted(() => ({
  request: vi.fn(),
  available: true,
  canManage: true,
}))
vi.mock('./governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.request(...args),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'owner',
      organizationId: 'org',
      permissions: ['ai.review.run'],
      organizationWide: true,
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('./yaml-workflow-editor', () => ({
  YamlWorkflowEditor: ({
    value,
    label,
    onChange,
    readOnly,
  }: {
    value: string
    label: string
    onChange?: (value: string) => void
    readOnly?: boolean
  }) =>
    onChange && !readOnly ? (
      <textarea
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <pre aria-label={label}>{value}</pre>
    ),
}))
vi.mock('./workflow-snippet', () => ({
  WorkflowSnippet: () => <p>Workflow preview</p>,
}))
beforeEach(() => {
  state.available = true
  state.request.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith('/standalone/generate'))
      return {
        workflow: '# AI source-backed draft',
        summary: 'Reuses the API CI setup.',
        model: 'Local model',
        skill: { name: 'Preflyt CI setup', version: 1 },
        notes: ['Review the database secret.'],
        setupSources: ['.github/workflows/ci.yml → api'],
      }
    if (path.includes('/standalone?'))
      return {
        workflow: '# Original draft',
        original: '',
        path: '.github/workflows/preflyt.yml',
        baseSha: 'a'.repeat(40),
        branch: 'development',
        exists: false,
        notes: [],
        setupSources: [],
      }
    return {
      apiUrl: 'https://preflyt.example',
      branch: 'refs/heads/development',
      available: true,
      enabled: false,
      checks: [],
      submissions: [],
      setupPr: null,
      write: { available: true, reason: null },
      ai: {
        available: state.available,
        model: 'Local model',
        reason: state.available ? null : 'Source sharing is disabled.',
      },
    }
  })
})
async function show(canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PipelineWorkflowSetup
        repositoryId='51'
        policyId='policy'
        canManage={canManage}
      />
    </QueryClientProvider>
  )
}
it('generates without mandatory instructions, shows a reviewable proposal, and writes nothing until explicitly requested', async () => {
  const view = await show()
  await view.getByRole('button', { name: 'Generate workflow with AI' }).click()
  await expect.element(view.getByText('Reuses the API CI setup.')).toBeVisible()
  await expect
    .element(view.getByText('Preflyt CI setup · version 1'))
    .toBeVisible()
  await expect
    .element(view.getByText('Review the database secret.'))
    .toBeVisible()
  expect(
    state.request.mock.calls.find(([path]) =>
      path.endsWith('/standalone/generate')
    )?.[1]
  ).toMatchObject({
    policyId: 'policy',
    baseSha: 'a'.repeat(40),
    instructions: '',
  })
  await expect
    .element(view.getByRole('button', { name: 'Create setup PR' }))
    .toBeDisabled()
  expect(
    state.request.mock.calls.some(([path]) => path.includes('/pull-request'))
  ).toBe(false)
  await view.getByRole('button', { name: 'Use this draft' }).click()
  await expect
    .element(view.getByLabelText('Proposed standalone workflow'))
    .toHaveTextContent('# AI source-backed draft')
})
it('explains unavailable AI and retains manual setup without a generation request', async () => {
  state.available = false
  const view = await show()
  await expect
    .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Source sharing is disabled.')
  await expect
    .element(view.getByRole('button', { name: 'Edit YAML' }))
    .toBeEnabled()
  expect(
    state.request.mock.calls.some(([path]) => path.endsWith('/generate'))
  ).toBe(false)
})
it('hides generation from read-only users and fits a narrow viewport', async () => {
  await page.viewport(375, 812)
  try {
    const view = await show(false)
    await expect.element(view.getByText('Workflow preview')).toBeVisible()
    await expect
      .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
      .not.toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  } finally {
    await page.viewport(1280, 800)
  }
})

function detectContainers(paths: string[], installed?: string) {
  const original = state.request.getMockImplementation()!
  state.request.mockImplementation(async (path: string, ...args: unknown[]) => {
    if (path.includes('/standalone?')) {
      const chosen =
        new URL(path, 'https://preflyt.example').searchParams.get(
          'dockerfile'
        ) ??
        installed ??
        (paths.length === 1 ? paths[0] : null)
      return {
        ...(await original(path, ...args)),
        workflow: chosen
          ? `# Generated container build\nPREFLYT_DOCKERFILE: ${chosen}\nCONTAINER_IMAGE: preflyt-pr`
          : '# Choose a Dockerfile',
        containerScan: {
          dockerfiles: paths,
          dockerfile: chosen,
          buildContext:
            chosen?.split('/').slice(0, -1).join('/') || (chosen ? '.' : null),
          needsSelection: paths.length > 1 && !chosen,
        },
      }
    }
    if (path.endsWith('/standalone/pull-request'))
      return {
        url: 'https://github.com/fixture/app/pull/8',
        number: 8,
        branch: 'development',
        path: '.github/workflows/preflyt.yml',
      }
    if (path.endsWith('/standalone/package'))
      return { archive: btoa('fixture-archive'), filename: 'workflow.tar.gz' }
    return original(path, ...args)
  })
}
it('uses a single detected Dockerfile automatically and carries it into AI generation', async () => {
  detectContainers(['api/Dockerfile.production'])
  const view = await show()
  await expect.element(view.getByText('Detected Dockerfile:')).toBeVisible()
  await expect.element(view.getByRole('combobox')).not.toBeInTheDocument()
  await expect
    .element(view.getByLabelText('Standalone PR workflow YAML'))
    .toHaveValue(
      expect.stringContaining('PREFLYT_DOCKERFILE: api/Dockerfile.production')
    )
  await view.getByRole('button', { name: 'Generate workflow with AI' }).click()
  expect(
    state.request.mock.calls.find(([path]) =>
      path.endsWith('/standalone/generate')
    )?.[1]
  ).toMatchObject({ dockerfile: 'api/Dockerfile.production' })
})
it('requires a choice for multiple Dockerfiles and submits that choice with the reviewed PR', async () => {
  detectContainers(['api/Dockerfile', 'web/Dockerfile'])
  const view = await show()
  await expect
    .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
    .toBeDisabled()
  await expect
    .element(
      view.getByLabelText(
        'I reviewed the YAML, project setup and target branch.',
        { exact: false }
      )
    )
    .toBeDisabled()
  await view.getByRole('combobox', { name: 'Dockerfile to build' }).click()
  await page
    .getByRole('option', { name: 'web/Dockerfile', exact: true })
    .click()
  await expect
    .element(view.getByLabelText('Standalone PR workflow YAML'))
    .toHaveValue(expect.stringContaining('PREFLYT_DOCKERFILE: web/Dockerfile'))
  await view
    .getByLabelText('I reviewed the YAML, project setup and target branch.', {
      exact: false,
    })
    .click()
  await view.getByRole('button', { name: 'Create setup PR' }).click()
  expect(
    state.request.mock.calls.find(([path]) =>
      path.endsWith('/standalone/pull-request')
    )?.[1]
  ).toMatchObject({
    dockerfile: 'web/Dockerfile',
    workflow: expect.stringContaining('PREFLYT_DOCKERFILE: web/Dockerfile'),
  })
})
it('preserves manual edits and resets review when another Dockerfile is chosen', async () => {
  detectContainers(['api/Dockerfile', 'web/Dockerfile'], 'api/Dockerfile')
  const view = await show()
  const editor = view.getByLabelText('Standalone PR workflow YAML')
  await editor.fill('# My manual workflow edits')
  await view
    .getByLabelText('I reviewed the YAML, project setup and target branch.', {
      exact: false,
    })
    .click()
  await view.getByRole('combobox', { name: 'Dockerfile to build' }).click()
  await page
    .getByRole('option', { name: 'web/Dockerfile', exact: true })
    .click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Your edited YAML is preserved')
  await expect
    .element(view.getByLabelText('Standalone PR workflow YAML'))
    .toHaveTextContent('# My manual workflow edits')
  await expect
    .element(view.getByRole('button', { name: 'Create setup PR' }))
    .toBeDisabled()
  await view.getByRole('button', { name: 'Load generated workflow' }).click()
  await expect
    .element(view.getByLabelText('Standalone PR workflow YAML'))
    .toHaveValue(expect.stringContaining('web/Dockerfile'))
  await expect
    .element(
      view.getByLabelText(
        'I reviewed the YAML, project setup and target branch.',
        { exact: false }
      )
    )
    .not.toBeChecked()
})
it('keeps long Dockerfile choices usable by keyboard on a narrow screen in both themes', async () => {
  const longPath =
    'apps/a-long-application-directory/container-builds/Dockerfile.production'
  detectContainers(['api/Dockerfile', longPath])
  await page.viewport(320, 812)
  const wasDark = document.documentElement.classList.contains('dark')
  try {
    const view = await show()
    const select = view.getByRole('combobox', { name: 'Dockerfile to build' })
    await select.click()
    await userEvent.keyboard('{End}')
    await expect
      .element(page.getByRole('option', { name: longPath, exact: true }))
      .toHaveFocus()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
    await userEvent.keyboard('{Enter}')
    await expect
      .element(view.getByLabelText('Standalone PR workflow YAML'))
      .toHaveValue(expect.stringContaining(longPath))
    for (const theme of ['light', 'dark']) {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        window.innerWidth
      )
      await page.screenshot({
        path: `__screenshots__/container-dockerfile-${theme}.png`,
      })
    }
  } finally {
    document.documentElement.classList.toggle('dark', wasDark)
    await page.viewport(1280, 800)
  }
})
it('shows missing-Dockerfile guidance and prevents read-only users from changing an installed choice', async () => {
  detectContainers([])
  let view = await show()
  await expect
    .element(view.getByText('No Dockerfile found.', { exact: false }))
    .toBeVisible()
  await view.unmount()
  state.request.mockReset()
  // Restore a complete fixture before creating a separate read-only view.
  state.request.mockImplementation(async () => ({
    apiUrl: 'https://preflyt.example',
    branch: 'development',
    available: true,
    enabled: false,
    checks: [],
    submissions: [],
    setupPr: null,
    write: { available: false, reason: null },
    ai: { available: false, model: null, reason: null },
    workflow: '# Installed',
    original: '',
    path: '.github/workflows/preflyt.yml',
    baseSha: 'a'.repeat(40),
    exists: true,
    notes: [],
    setupSources: [],
  }))
  detectContainers(['api/Dockerfile', 'web/Dockerfile'], 'api/Dockerfile')
  view = await show(false)
  await expect
    .element(view.getByRole('combobox', { name: 'Dockerfile to build' }))
    .toBeDisabled()
})

it('shows build regeneration progress and downloads only the newly reviewed selection', async () => {
  detectContainers(['api/Dockerfile', 'web/Dockerfile'], 'api/Dockerfile')
  const original = state.request.getMockImplementation()!
  let finish!: () => void
  const wait = new Promise<void>((resolve) => {
    finish = resolve
  })
  state.request.mockImplementation(async (path: string, ...args: unknown[]) => {
    if (path.includes('dockerfile=web%2FDockerfile')) await wait
    return original(path, ...args)
  })
  const view = await show()
  await view.getByRole('combobox', { name: 'Dockerfile to build' }).click()
  await page
    .getByRole('option', { name: 'web/Dockerfile', exact: true })
    .click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Updating container build')
  await expect
    .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
    .toBeDisabled()
  finish()
  await expect
    .element(view.getByLabelText('Standalone PR workflow YAML'))
    .toHaveValue(expect.stringContaining('web/Dockerfile'))
  await view
    .getByLabelText('I reviewed the YAML, project setup and target branch.', {
      exact: false,
    })
    .click()
  await view.getByRole('button', { name: 'Download workflow' }).click()
  await vi.waitFor(() =>
    expect(
      state.request.mock.calls.find(([path]) =>
        path.endsWith('/standalone/package')
      )?.[1]
    ).toMatchObject({
      dockerfile: 'web/Dockerfile',
      workflow: expect.stringContaining('web/Dockerfile'),
    })
  )
})
it('lets the user detect Dockerfiles again after a selected path becomes unavailable', async () => {
  detectContainers(['api/Dockerfile', 'web/Dockerfile'])
  const original = state.request.getMockImplementation()!
  state.request.mockImplementation(async (path: string, ...args: unknown[]) => {
    if (path.includes('dockerfile=web%2FDockerfile'))
      throw new Error('The selected Dockerfile was not found at this commit.')
    return original(path, ...args)
  })
  const view = await show()
  await view.getByRole('combobox', { name: 'Dockerfile to build' }).click()
  await page
    .getByRole('option', { name: 'web/Dockerfile', exact: true })
    .click()
  await expect
    .element(
      view.getByText('The selected Dockerfile was not found at this commit.')
    )
    .toBeVisible()
  await view.getByRole('button', { name: 'Detect Dockerfiles again' }).click()
  await expect
    .element(view.getByRole('combobox', { name: 'Dockerfile to build' }))
    .toBeEnabled()
})
