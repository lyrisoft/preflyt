import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { AiSettingsPage } from './ai-settings'
import {
  isAiSettingsTab,
  validateIntelligenceSearch,
} from './intelligence-search'
import { SkillsPage } from './skills-page'

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
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode
    to: string
    search?: Record<string, string>
  }) => (
    <a href={to + (search ? '?' + new URLSearchParams(search) : '')}>
      {children}
    </a>
  ),
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
  vaptLimits: {
    maxInputTokens: 4000000,
    maxOutputTokens: 131072,
    maxModelCalls: 80,
    revision: 3,
  },
  vaptLimitBounds: {
    maxInputTokens: { min: 100000, max: 100000000 },
    maxOutputTokens: { min: 8192, max: 2000000 },
    maxModelCalls: { min: 1, max: 1000 },
  },
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
  expect(html).toContain('Model router')
  expect(html).toContain('AI Reviews are disabled for this deployment')
  state.query = { data: { ...configuration(), executionAvailable: true } }
  expect(renderToStaticMarkup(<AiSettingsPage />)).toContain('Add model')
  expect(html).not.toContain('Explain findings')
})
it('links each connected model to its own details page', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      providers: [
        {
          id,
          name: 'My model',
          modelId: 'model-api-id',
          endpoint: { baseUrl: 'https://model.example.invalid' },
          enabled: true,
          approved: true,
          testStatus: 'CONNECTED',
        },
      ],
    },
  }
  const view = await render(<AiSettingsPage />)
  await expect
    .element(view.getByRole('link', { name: 'My model', exact: true }))
    .toHaveAttribute('href', `/intelligence?model=${id}`)
  expect(validateIntelligenceSearch({ model: id })).toEqual({
    tab: 'connections',
    model: id,
  })
})
it('edits cumulative Security review limits independently of model routing and sends the saved revision', async () => {
  const view = await render(<AiSettingsPage tab='vapt-limits' />)
  await expect
    .element(view.getByRole('form', { name: 'AI security review limits' }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Input tokens per review' })
    .fill('12000000')
  await view
    .getByRole('textbox', { name: 'Output tokens per review' })
    .fill('250000')
  await view
    .getByRole('textbox', { name: 'Model requests per review' })
    .fill('150')
  await view.getByRole('button', { name: 'Save review limits' }).click()
  expect(state.save).toHaveBeenCalledWith('/ai/configuration/vapt-limits', {
    maxInputTokens: 12000000,
    maxOutputTokens: 250000,
    maxModelCalls: 150,
    expectedRevision: 3,
  })
  await expect
    .element(view.getByText('Limits saved for new scans.'))
    .toBeVisible()
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(validateIntelligenceSearch({ tab: 'vapt-limits' })).toEqual({
    tab: 'vapt-limits',
  })
})
it('keeps edited Security review limits visible when another administrator has changed them', async () => {
  state.save.mockRejectedValueOnce(
    new Error('Security review limits changed. Refresh before saving.')
  )
  const view = await render(<AiSettingsPage tab='vapt-limits' />)
  await view
    .getByRole('textbox', { name: 'Input tokens per review' })
    .fill('9000000')
  await view.getByRole('button', { name: 'Save review limits' }).click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Security review limits changed. Refresh before saving.')
  await expect
    .element(view.getByRole('textbox', { name: 'Input tokens per review' }))
    .toHaveValue('9,000,000')
})
it('accepts grouped numbers and rejects malformed or fractional limits', async () => {
  const view = await render(<AiSettingsPage tab='vapt-limits' />)
  await expect
    .element(view.getByRole('textbox', { name: 'Input tokens per review' }))
    .toHaveValue('4,000,000')
  for (const value of ['1,50', '150.5']) {
    await view
      .getByRole('textbox', { name: 'Model requests per review' })
      .fill(value)
    await view.getByRole('button', { name: 'Save review limits' }).click()
    expect(state.save).not.toHaveBeenCalled()
  }
  await view
    .getByRole('textbox', { name: 'Model requests per review' })
    .fill('150')
  await view
    .getByRole('textbox', { name: 'Input tokens per review' })
    .fill('12,000,000')
  await view.getByRole('button', { name: 'Save review limits' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/vapt-limits',
    expect.objectContaining({ maxInputTokens: 12000000, maxModelCalls: 150 })
  )
})
it('prevents invalid Security review limits and keeps the form usable at 320px in both themes', async () => {
  await page.viewport(320, 900)
  const view = await render(<AiSettingsPage tab='vapt-limits' />)
  try {
    for (const theme of ['light', 'dark']) {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      await expect
        .element(view.getByRole('textbox', { name: 'Input tokens per review' }))
        .toBeVisible()
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    }
    await view
      .getByRole('textbox', { name: 'Input tokens per review' })
      .fill('0')
    await view.getByRole('button', { name: 'Save review limits' }).click()
    expect(state.save).not.toHaveBeenCalled()
  } finally {
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})
it('shows built-in providers directly and opens setup with only model and key fields', async () => {
  const view = await render(<AiSettingsPage />)
  await expect
    .element(view.getByRole('tab', { name: 'Review skills' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('tab', { name: 'Model router' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('region', { name: 'Built-in providers' }))
    .toBeVisible()
  await view
    .getByRole('button', { name: 'Activate OpenAI (ChatGPT)', exact: true })
    .click()
  await expect
    .element(view.getByRole('textbox', { name: 'Model name' }))
    .toBeVisible()
  await expect
    .element(view.getByLabelText('API key', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('textbox', { name: 'Endpoint URL' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('textbox', { name: 'Display name' }))
    .not.toBeInTheDocument()
  await expect.element(view.getByRole('spinbutton')).not.toBeInTheDocument()
})
it('links developers to the dedicated Skills page without model management', () => {
  state.role = 'DEVELOPER'
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Open Skills')
  expect(html).toContain('href="/skills"')
  expect(html).not.toContain('Filter skills')
  expect(html).not.toContain('Create skill')
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
  const body = state.save.mock.calls[0]![1]
  expect(body).not.toHaveProperty('inputPriceCentsPerMillion')
  expect(body).not.toHaveProperty('outputPriceCentsPerMillion')
  await expect.element(view.getByRole('spinbutton')).not.toBeInTheDocument()
})
it.each(['Edit'])(
  'omits token prices when using %s on an existing model',
  async (action) => {
    state.query = {
      data: {
        ...configuration(),
        providers: [
          {
            id: 'provider',
            name: 'OpenAI (ChatGPT)',
            endpointId: 'provider',
            endpoint: {
              preset: 'openai',
              baseUrl: 'https://api.openai.com/v1',
              locality: 'hosted',
              requiresKey: true,
            },
            modelId: 'model-a',
            enabled: true,
            approved: true,
            revision: 1,
            testStatus: 'CONNECTED',
            apiKeySet: true,
            inputPriceCentsPerMillion: 200,
            outputPriceCentsPerMillion: 800,
          },
        ],
      },
    }
    const view = await render(<AiSettingsPage />)
    await view.getByRole('button', { name: action, exact: true }).click()
    await expect.element(view.getByRole('spinbutton')).not.toBeInTheDocument()
    await view.getByRole('button', { name: 'Save model' }).click()
    expect(state.save).toHaveBeenCalledWith(
      '/ai/configuration/providers/provider',
      expect.objectContaining({ modelId: 'model-a', expectedRevision: 1 })
    )
    const body = state.save.mock.calls[0]![1]
    expect(body).not.toHaveProperty('inputPriceCentsPerMillion')
    expect(body).not.toHaveProperty('outputPriceCentsPerMillion')
  }
)
it('configures one shared default with source sharing off and no pricing or token budgets', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('tab', { name: 'Model router' }).click()
  await view.getByRole('button', { name: 'Configure default' }).click()
  await expect
    .element(view.getByRole('checkbox', { name: 'Enable AI reviews' }))
    .toBeChecked()
  await expect
    .element(
      view.getByRole('checkbox', {
        name: 'Send repository code to the selected AI model',
      })
    )
    .not.toBeChecked()
  await expect
    .element(view.getByRole('combobox', { name: 'Primary connection' }))
    .toBeVisible()
  await expect
    .element(
      view.getByRole('spinbutton', {
        name: 'Daily estimated cost limit (US cents)',
      })
    )
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('spinbutton', { name: 'Input token limit' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('spinbutton', { name: 'Output token limit' }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Save settings' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/routes/default',
    expect.objectContaining({
      allowSource: false,
      enabled: true,
      expectedRevision: 0,
    })
  )
  const body = state.save.mock.calls[0]![1]
  for (const field of ['maxInputTokens', 'maxOutputTokens', 'dailyBudgetCents'])
    expect(body).not.toHaveProperty(field)
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
  await view.getByRole('combobox', { name: 'Hosting' }).click()
  await view
    .getByRole('option', { name: 'Self-hosted model', exact: true })
    .click()
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
  state.save
    .mockResolvedValueOnce({ id: 'provider' })
    .mockResolvedValueOnce({ status: 'CONNECTED' })
  await view.getByRole('button', { name: 'Add model' }).click()
  await view.getByRole('combobox', { name: 'Provider' }).click()
  await page.getByRole('option', { name: 'OpenAI (ChatGPT)' }).click()
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
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers/provider/test',
    {}
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
  await view.getByRole('tab', { name: 'Model router', exact: true }).click()
  await view
    .getByRole('button', { name: 'Configure default', exact: true })
    .click()
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
      'button[aria-label^="Activate "]'
    ),
  ]
  expect(activationButtons).toHaveLength(4)
  for (const button of activationButtons) {
    const footer = button.parentElement!
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
  await view.getByRole('tab', { name: 'Model router' }).click()
  await view.getByText('Stage overrides (optional)', { exact: true }).click()
  await expect
    .element(view.getByText('Pull requests', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('button', { name: 'Configure default', exact: true })
    .click()
  expect(document.body.textContent).toContain('Primary')
  expect(document.body.textContent).toContain('Fallback')
  await page.screenshot({ path: '__screenshots__/ai-model-choices-dark.png' })
  await page.viewport(390, 844)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await page.screenshot({ path: '__screenshots__/ai-model-choices-mobile.png' })
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

it('opens notification links at the requested model or routing tab', async () => {
  const view = await render(<AiSettingsPage tab='routing' />)
  await expect
    .element(view.getByRole('tab', { name: 'Model router' }))
    .toHaveAttribute('data-state', 'active')
  await expect
    .element(view.getByRole('button', { name: 'Configure' }))
    .toBeVisible()
  await view.getByRole('tab', { name: 'Models', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Add model' }))
    .toBeVisible()
})

it('keeps routing selection in sync with controlled URL changes', async () => {
  const changed = vi.fn()
  const view = await render(
    <AiSettingsPage tab='routing' onTabChange={changed} />
  )
  await view.getByRole('tab', { name: 'Models', exact: true }).click()
  expect(changed).toHaveBeenCalledWith('connections')
  await view.rerender(
    <AiSettingsPage tab='connections' onTabChange={changed} />
  )
  await expect
    .element(view.getByRole('tab', { name: 'Models', exact: true }))
    .toHaveAttribute('data-state', 'active')
})

it('accepts only known intelligence tabs in notification URLs', () => {
  expect(validateIntelligenceSearch({ tab: 'routing' })).toEqual({
    tab: 'routing',
  })
  expect(isAiSettingsTab('skills')).toBe(false)
  expect(validateIntelligenceSearch({ tab: 'skills' })).toEqual({
    tab: 'skills',
  })
  for (const tab of [
    undefined,
    'unknown',
    ['routing'],
    1,
    { value: 'routing' },
  ]) {
    expect(validateIntelligenceSearch({ tab })).toEqual({ tab: 'connections' })
  }
})

it('keeps stage overrides optional and moves automatic PR feedback out of model routing', async () => {
  const view = await render(<AiSettingsPage tab='routing' />)
  await expect
    .element(view.getByRole('button', { name: 'Configure default' }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Configure default' }).click()
  await expect
    .element(
      view.getByRole('checkbox', {
        name: 'Run assigned AI reviews automatically',
      })
    )
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('checkbox', { name: 'Post an AI review summary' }))
    .not.toBeInTheDocument()
})

vi.mock('./skills-catalogue', () => ({ SkillsCatalogue: () => null }))
it('shows beta beside both Intelligence and Skills page titles', async () => {
  const ai = await render(<AiSettingsPage />)
  await expect.element(ai.getByText('beta', { exact: true })).toBeVisible()
  await expect
    .element(ai.getByRole('heading', { name: 'AI Intelligence', exact: true }))
    .toBeVisible()
  await ai.unmount()
  const skills = await render(<SkillsPage />)
  await expect.element(skills.getByText('beta', { exact: true })).toBeVisible()
  await expect
    .element(skills.getByRole('heading', { name: 'Skills', exact: true }))
    .toBeVisible()
})

it('lets admins choose a dedicated VAPT model route independently of Repository reviews', async () => {
  state.query = {
    data: {
      ...configuration(),
      executionAvailable: true,
      stages: ['repository', 'vapt'],
    },
  }
  const view = await render(<AiSettingsPage tab='routing' />)
  await view.getByText('Stage overrides (optional)', { exact: true }).click()
  const row = view
    .getByText('AI security review', { exact: true })
    .element()
    .closest('div.flex')!
  expect(row.textContent).toContain('Uses default model')
  const edit = Array.from(row.querySelectorAll('button')).find(
    (b) => b.textContent === 'Edit'
  )!
  edit.click()
  await expect
    .element(
      view.getByRole('heading', {
        name: 'AI security review model routing',
      })
    )
    .toBeVisible()
  await view.getByRole('button', { name: 'Save settings', exact: true }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/routes/vapt',
    expect.objectContaining({ expectedRevision: 0 })
  )
})

it('keeps the real custom model form and its save action inside a short window in both themes and at enlarged text', async () => {
  await page.viewport(640, 480)
  const view = await render(<AiSettingsPage />)
  try {
    await view.getByRole('button', { name: 'Add model', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Endpoint URL' }))
      .toBeInTheDocument()
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      for (const size of ['100%', '200%']) {
        document.documentElement.style.fontSize = size
        await new Promise((resolve) => setTimeout(resolve, 350))
        const element = dialog.element()
        await expect
          .poll(() => element.getBoundingClientRect().top)
          .toBeGreaterThanOrEqual(0)
        await expect
          .poll(() => element.getBoundingClientRect().bottom)
          .toBeLessThanOrEqual(480)
        expect(getComputedStyle(element).overflowY).toBe('auto')
        const save = dialog.getByRole('button', { name: 'Save model' })
        dialog
          .getByRole('button', { name: 'Cancel', exact: true })
          .element()
          .focus()
        await userEvent.keyboard('{Tab}')
        await expect.element(save).toHaveFocus()
        await expect
          .poll(() => save.element().getBoundingClientRect().bottom)
          .toBeLessThanOrEqual(element.getBoundingClientRect().bottom)
        expect(
          save.element().getBoundingClientRect().top
        ).toBeGreaterThanOrEqual(element.getBoundingClientRect().top)
      }
    }
    await page.screenshot({
      element: dialog.element(),
      path: '__screenshots__/model-dialog-fixed-actions-200-percent.png',
    })
    document.documentElement.style.fontSize = ''
    dialog.element().scrollTop = 0
    await new Promise((resolve) => setTimeout(resolve, 350))
    await page.screenshot({
      element: dialog.element(),
      path: '__screenshots__/model-dialog-fixed-short-window.png',
    })
  } finally {
    document.documentElement.style.fontSize = ''
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})
