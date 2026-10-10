import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { AiSettingsPage } from './ai-settings'

const state = vi.hoisted(() => ({
  role: 'OWNER',
  query: {} as Record<string, unknown>,
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { role: state.role, identityId: 'owner', organizationId: 'org' },
  }),
  canAdminister: (role: string) => ['OWNER', 'ADMIN'].includes(role),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.save(...args),
}))
vi.mock('./skills-catalogue', () => ({
  SkillsCatalogue: () => <section>Review skills</section>,
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@/components/layout/main', () => ({
  Main: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
const configuration = () => ({
  enabled: true,
  executionAvailable: false,
  providers: [],
  routes: [],
  stages: ['pull_request'],
  presets: [
    {
      id: 'openai',
      name: 'OpenAI (ChatGPT)',
      baseUrl: 'https://api.openai.com/v1',
      exampleModel: 'gpt-4.1',
    },
  ],
})
beforeEach(() => {
  state.role = 'OWNER'
  state.query = {
    data: configuration(),
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }
  state.save.mockReset().mockResolvedValue({})
  state.invalidate.mockReset().mockResolvedValue({})
})
it('keeps connections and routing separate without promising inference', () => {
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Models')
  expect(html).toContain('Review settings')
  expect(html).toContain('AI Reviews are disabled for this deployment')
  state.query = { data: { ...configuration(), executionAvailable: true } }
  expect(renderToStaticMarkup(<AiSettingsPage />)).toContain(
    'AI assessment reviews are available'
  )
  expect(html).not.toContain('Explain findings')
})
it('shows read-only skills without model management to developers', () => {
  state.role = 'DEVELOPER'
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Review skills')
  expect(html).not.toContain('Add model')
})
it('shows deployment-disabled and request-failure states without old settings', () => {
  state.query = { data: { ...configuration(), enabled: false } }
  expect(renderToStaticMarkup(<AiSettingsPage />)).toContain('AI is disabled')
  state.query = {
    isError: true,
    data: configuration(),
    error: new Error('Access revoked'),
  }
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Access revoked')
  expect(html).not.toContain('Add model')
})
it('starts new provider connections disabled and keeps errors in the form', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model' }).click()
  await expect
    .element(view.getByRole('checkbox', { name: 'Enable model' }))
    .not.toBeChecked()
  await view.getByRole('textbox', { name: 'Display name' }).fill('Team model')
  await view
    .getByRole('textbox', { name: 'Endpoint URL' })
    .fill('https://gateway.example.invalid/v1')
  await view.getByRole('textbox', { name: 'Model name' }).fill('model-a')
  await view.getByLabelText('API key', { exact: true }).fill('fixture-key')
  state.save.mockRejectedValueOnce(
    new Error('Connection changed. Reload before saving.')
  )
  await view.getByRole('button', { name: 'Save model' }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Display name' }))
    .toHaveValue('Team model')
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers',
    expect.objectContaining({
      enabled: false,
      expectedRevision: 0,
      apiKey: 'fixture-key',
    })
  )
})
it('starts routing disabled with source sharing off and bounded defaults', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('tab', { name: 'Review settings' }).click()
  await view.getByRole('button', { name: 'Configure' }).click()
  await expect
    .element(
      view.getByRole('checkbox', { name: 'Enable reviews for this stage' })
    )
    .not.toBeChecked()
  await expect
    .element(
      view.getByRole('checkbox', {
        name: 'Send repository code to the selected AI model',
      })
    )
    .not.toBeChecked()
  await view.getByRole('button', { name: 'Save settings' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/routes/pull_request',
    expect.objectContaining({
      allowSource: false,
      enabled: false,
      maxInputTokens: 8000,
      maxOutputTokens: 1000,
      dailyBudgetCents: 1000,
      expectedRevision: 0,
    })
  )
})
it('paginates connections and resets pagination when filtering', async () => {
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      providers: Array.from({ length: 21 }, (_, i) => ({
        id: `connection-${i}`,
        name: `Connection ${String(i).padStart(2, '0')}`,
        endpointId: 'gateway',
        modelId: 'model-a',
        enabled: false,
        revision: 1,
        testStatus: 'NOT_TESTED',
        apiKeySet: false,
      })),
    },
  }
  const view = await render(<AiSettingsPage />)
  await expect
    .element(view.getByRole('cell', { name: /^Connection 00/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('cell', { name: /^Connection 10/ }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByRole('cell', { name: /^Connection 10/ }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Filter models' })
    .fill('Connection 20')
  await expect
    .element(view.getByRole('cell', { name: /^Connection 20/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('navigation', { name: 'Model pages' }))
    .not.toBeInTheDocument()
})

it('lets an admin approve a self-hosted model without a deployment allowlist or key', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model' }).click()
  await view
    .getByRole('textbox', { name: 'Display name' })
    .fill('Internal model')
  await view
    .getByRole('textbox', { name: 'Endpoint URL' })
    .fill('http://model-server:4000/v1')
  await view.getByRole('combobox', { name: 'Hosting' }).selectOptions('local')
  await view.getByRole('textbox', { name: 'Model name' }).fill('internal-model')
  await expect
    .element(
      view.getByRole('checkbox', { name: 'Provider requires an API key' })
    )
    .not.toBeChecked()
  await view.getByRole('button', { name: 'Save model' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers',
    expect.objectContaining({
      baseUrl: 'http://model-server:4000/v1',
      locality: 'local',
      requiresKey: false,
      modelId: 'internal-model',
      enabled: false,
    })
  )
})
it('shows organization-admin approval separately from connection testing', () => {
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      providers: [
        {
          id: 'model',
          name: 'Team model',
          modelId: 'model-a',
          endpoint: { baseUrl: 'https://model.example/v1' },
          approved: true,
          enabled: true,
          testStatus: 'NOT_TESTED',
        },
      ],
    },
  }
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Approved')
  expect(html).toContain('Not tested')
})

it('activates a built-in provider with only model name and key', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Activate', exact: true }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Endpoint URL' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('textbox', { name: 'Display name' }))
    .not.toBeInTheDocument()
  await view.getByRole('textbox', { name: 'Model name' }).fill('gpt-4.1')
  await view.getByLabelText('API key', { exact: true }).fill('fixture-key')
  await view.getByRole('button', { name: 'Activate model' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers',
    expect.objectContaining({
      preset: 'openai',
      enabled: true,
      modelId: 'gpt-4.1',
      apiKey: 'fixture-key',
      baseUrl: 'https://api.openai.com/v1',
      requiresKey: true,
    })
  )
})

it.each([
  ['CONNECTED', true, 'Connection tested', 'text-success-text'],
  ['NOT_TESTED', true, 'Not tested', 'bg-muted'],
  ['AUTH_REJECTED', true, 'Key rejected', 'text-danger-text'],
  ['MODEL_UNAVAILABLE', true, 'Model unavailable', 'text-danger-text'],
  ['UNAVAILABLE', true, 'Connection unavailable', 'text-danger-text'],
  ['MODEL_UNAVAILABLE', false, 'Disabled', 'bg-muted'],
])(
  'uses semantic badges for %s (enabled %s)',
  (testStatus, enabled, label, color) => {
    state.query = {
      data: {
        ...configuration(),
        providers: [
          {
            id: 'local',
            name: 'Ollama',
            modelId: 'llama3.2:3b',
            endpoint: { baseUrl: 'http://localhost:11434' },
            approved: true,
            enabled,
            testStatus,
          },
        ],
      },
    }
    const html = renderToStaticMarkup(<AiSettingsPage />)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const badges = [...doc.querySelectorAll('[data-slot="badge"]')]
    expect(
      badges.find((badge) => badge.textContent === 'Approved')?.className
    ).toContain('text-success-text')
    expect(
      badges.find((badge) => badge.textContent === String(label))?.className
    ).toContain(color)
  }
)

it('keeps test progress visible and never reports a failed connection as saved', async () => {
  state.query = {
    data: {
      ...configuration(),
      providers: [
        {
          id: 'local',
          name: 'Ollama',
          modelId: 'llama3.2:3b',
          endpoint: { baseUrl: 'http://localhost:11434' },
          enabled: true,
          approved: true,
          testStatus: 'NOT_TESTED',
        },
      ],
    },
  }
  let finish!: (value: unknown) => void
  state.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Test', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Testing…' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('button', { name: 'Edit', exact: true }))
    .toBeDisabled()
  finish({ status: 'MODEL_UNAVAILABLE' })
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Model unavailable.')
  await expect
    .element(view.getByRole('button', { name: 'Test', exact: true }))
    .toBeEnabled()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers/local/test',
    {}
  )
  expect(document.body.textContent).not.toContain('Saved.')
  state.save.mockResolvedValueOnce({ status: 'CONNECTED' })
  await view.getByRole('button', { name: 'Test', exact: true }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Connection tested.')
})
it('cancels model and routing forms without saving', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model', exact: true }).click()
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
  await view.getByRole('tab', { name: 'Review settings', exact: true }).click()
  await view.getByRole('button', { name: 'Configure', exact: true }).click()
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
  expect(state.save).not.toHaveBeenCalled()
})

it('keeps model form actions compact and aligned in the footer', async () => {
  await page.viewport(1280, 900)
  document.documentElement.classList.add('dark')
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model', exact: true }).click()
  const save = document.querySelector('button[type="submit"]') as HTMLElement
  const form = save.closest('form')!
  expect(save.getBoundingClientRect().width).toBeLessThan(
    form.getBoundingClientRect().width / 2
  )
  await expect
    .element(view.getByRole('button', { name: 'Cancel', exact: true }))
    .toBeVisible()
  await expect
    .poll(
      () => getComputedStyle(document.querySelector('[role="dialog"]')!).opacity
    )
    .toBe('1')
  await page.screenshot({ path: '__screenshots__/model-buttons-dark.png' })
  await page.viewport(390, 844)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await expect
    .element(view.getByRole('button', { name: 'Save model', exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

it('explains conditional PR source review and GitHub feedback without claiming they are absent', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Help for AI Intelligence' }).click()
  await expect
    .element(view.getByText('Current availability', { exact: true }))
    .toBeVisible()
  await expect
    .element(
      view.getByText(
        /PR reviews can also use selected changes from the assessed commit/
      )
    )
    .toBeVisible()
  await expect
    .element(
      view.getByText(/Comments on changed lines also require source sharing/)
    )
    .toBeVisible()
  await expect
    .element(
      view.getByText(
        /AI suggestions never approve policies or count as passed checks/
      )
    )
    .toBeVisible()
  expect(document.body.textContent).not.toContain(
    'Source review and GitHub feedback are not available'
  )
})

it('keeps provider actions compact and preserves routing labels across themes and mobile', async () => {
  const builtins = [
    ['openai', 'OpenAI (ChatGPT)'],
    ['anthropic', 'Anthropic (Claude)'],
    ['gemini', 'Google (Gemini)'],
    ['deepseek', 'DeepSeek'],
  ]
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      presets: builtins.map(([id, name]) => ({
        id,
        name,
        baseUrl: 'https://provider.example/v1',
        exampleModel: 'example-model',
      })),
      stages: [
        'laptop',
        'repository',
        'pull_request',
        'qa',
        'performance',
        'production',
      ],
    },
  }
  await page.viewport(1440, 1000)
  const view = await render(<AiSettingsPage />)
  await expect
    .element(view.getByRole('heading', { name: 'Built-in providers' }))
    .toBeVisible()
  const activationButtons = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-slot="card-footer"] button'
    ),
  ]
  expect(activationButtons).toHaveLength(4)
  for (const button of activationButtons) {
    const footer = button.closest('[data-slot="card-footer"]')!
    expect(button.getBoundingClientRect().width).toBeLessThan(
      footer.getBoundingClientRect().width * 0.75
    )
  }
  await page.screenshot({ path: '__screenshots__/ai-providers-light.png' })
  document.documentElement.classList.add('dark')
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
  await Promise.all(
    document
      .getAnimations()
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().iterations !== Infinity
      )
      .map((animation) => animation.finished.catch(() => undefined))
  )
  await page.screenshot({ path: '__screenshots__/ai-providers-dark.png' })
  await view.getByRole('tab', { name: 'Review settings' }).click()
  await expect
    .element(view.getByRole('heading', { name: 'Pull requests', exact: true }))
    .toBeVisible()
  expect(document.body.textContent).toContain('Primary')
  expect(document.body.textContent).toContain('Fallback')
  await page.screenshot({ path: '__screenshots__/ai-model-choices-dark.png' })
  await page.viewport(390, 844)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await page.screenshot({ path: '__screenshots__/ai-model-choices-mobile.png' })
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})
