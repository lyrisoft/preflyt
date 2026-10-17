import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  ProductPage,
  CapabilityPage,
  SelfHostingPage,
} from './capability-pages'
import { demoPullRequests } from './demo-workspace'
import { FocusedHealthPreview } from './focused-previews'
import { MarketingHomepage } from './index'
import { WorkspaceWindow } from './workspace-window'

afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})
it.each([320, 768, 1440])(
  'keeps the public homepage readable at %ipx when the API is unavailable',
  async (width) => {
    await page.viewport(width, 900)
    const fetch = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('API unavailable')
    })
    vi.stubGlobal('fetch', fetch)
    const view = await render(<MarketingHomepage />)
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent(/Open source\s*engineering assurance\./)
    await expect
      .poll(() => document.documentElement.scrollWidth)
      .toBeLessThanOrEqual(window.innerWidth)
    await view.getByRole('tab', { name: 'Contributors', exact: true }).click()
    await expect
      .element(
        view
          .getByRole('tabpanel', { name: 'Contributors', exact: true })
          .getByText('alex-northstar', { exact: true })
      )
      .toBeVisible()
    expect(
      fetch.mock.calls.every(([url]) => String(url).endsWith('/auth/session'))
    ).toBe(true)
    const ids = Array.from(
      document.querySelectorAll('.marketing-site [id]'),
      (element) => element.id
    )
    expect(
      new Set(ids).size,
      `Duplicate IDs: ${ids.filter((id, index) => ids.indexOf(id) !== index).join(', ')}`
    ).toBe(ids.length)
    const repositoryMetric = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.workspace-window-interactive [data-preview="contributors"] [data-slot="card"]'
      )
    ).find((element) =>
      element.textContent?.includes('Contributed repositories')
    )!
    await expect
      .element(repositoryMetric)
      .toHaveTextContent(
        String(new Set(demoPullRequests.map((pr) => pr.repositoryId)).size)
      )
  }
)
it.each([
  ['Product', <ProductPage />],
  ['Repository health', <CapabilityPage capability='repository-health' />],
  [
    'Standards & evidence',
    <CapabilityPage capability='standards-and-evidence' />,
  ],
  ['Merge Protection', <CapabilityPage capability='merge-protection' />],
  ['Self-hosting', <SelfHostingPage />],
])('keeps the %s page readable on a phone', async (_name, component) => {
  await page.viewport(320, 900)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  )
  const view = await render(component)
  await expect.element(view.getByRole('heading', { level: 1 })).toBeVisible()
  await expect
    .poll(() => document.documentElement.scrollWidth)
    .toBeLessThanOrEqual(320)
})
it('shows populated repository evidence and lets visitors investigate demo findings', async () => {
  const view = await render(<FocusedHealthPreview />)
  await expect.element(view.getByText('2.4%', { exact: true })).toBeVisible()
  await expect
    .element(view.getByRole('region', { name: 'Findings over time' }))
    .toBeVisible()
  await view.getByText('View chart data', { exact: true }).click()
  await view.getByRole('button', { name: 'Open health report 1ed530b' }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('12 findings')
  await expect
    .element(view.getByText('Latest report · main · 7c82a1f'))
    .toBeVisible()
  await view.getByRole('tab', { name: 'Findings', exact: true }).click()
  await view
    .getByRole('textbox', { name: 'Search focused findings' })
    .fill('privilege')
  await expect
    .element(
      view.getByText('Container security context permits privilege escalation')
    )
    .toBeVisible()
  await expect
    .element(view.getByText('Dependency update requires review'))
    .not.toBeInTheDocument()
})

it('keeps the complete framed demo interactive, including repository history', async () => {
  const view = await render(<WorkspaceWindow />)
  await expect.element(view.getByText('1,420', { exact: true })).toBeVisible()
  await view.getByRole('tab', { name: 'Repositories', exact: true }).click()
  await expect
    .element(
      view.getByRole('button', { name: 'northstar/platform-api', exact: true })
    )
    .toBeVisible()
  await view.getByRole('tab', { name: 'Pull requests', exact: true }).click()
  await expect
    .element(
      view.getByText('Pull requests requiring attention', { exact: true })
    )
    .toBeVisible()
  await view.getByRole('tab', { name: 'Health', exact: true }).click()
  await expect
    .element(view.getByText('Priority findings', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('button', { name: 'Repository health', exact: true })
    .click()
  await view
    .getByRole('tab', { name: 'Assessment history (6)', exact: true })
    .click()
  await expect
    .element(
      view
        .getByRole('tabpanel', { name: 'Assessment history (6)', exact: true })
        .getByText('1ed530b', { exact: true })
    )
    .toBeVisible()
})

it('shows complete Findings and Contributors pages in the homepage tour', async () => {
  const view = await render(<MarketingHomepage />)
  await expect
    .element(view.getByRole('tabpanel', { name: 'Findings', exact: true }))
    .toBeVisible()
  await view.getByRole('tab', { name: 'Contributors', exact: true }).click()
  const contributors = view.getByRole('tabpanel', {
    name: 'Contributors',
    exact: true,
  })
  await expect
    .element(contributors.getByText('Participation over time', { exact: true }))
    .toBeVisible()
  await expect
    .element(contributors.getByText('PR revision evidence', { exact: true }))
    .toBeVisible()
  await view.getByRole('tab', { name: 'Findings', exact: true }).click()
  const findings = view.getByRole('tabpanel', { name: 'Findings', exact: true })
  await expect
    .element(
      findings.getByRole('heading', { name: 'Issues by severity', exact: true })
    )
    .toBeVisible()
  await expect
    .element(
      findings.getByRole('heading', { name: 'Issues by check', exact: true })
    )
    .toBeVisible()
  await findings
    .getByRole('textbox', { name: 'Search findings or files' })
    .fill('no-matching-file')
  await expect
    .element(
      findings.getByText('No findings match these filters.', { exact: true })
    )
    .toBeVisible()
  await view
    .getByRole('tab', { name: 'Repository details', exact: true })
    .click()
  const repository = view.getByRole('tabpanel', {
    name: 'Repository details',
    exact: true,
  })
  await expect
    .element(repository.getByText('Analysis coverage', { exact: true }))
    .toBeVisible()
  await expect
    .element(repository.getByRole('tab', { name: 'Findings (3)', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(
      repository.getByRole('tab', {
        name: 'Assessment history (6)',
        exact: true,
      })
    )
    .not.toBeInTheDocument()
  await expect
    .element(repository.getByText('Policy evidence', { exact: true }))
    .not.toBeInTheDocument()
})

it('uses the actual app sidebar groups and protects private workspace data', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const view = await render(<WorkspaceWindow />)
  const navigation = view.getByRole('complementary', {
    name: 'Workspace navigation',
  })
  for (const group of [
    'Workspace',
    'Governance',
    'Intelligence',
    'Administration',
  ]) {
    await expect
      .element(navigation.getByText(group, { exact: true }))
      .toBeVisible()
  }
  for (const destination of [
    'Policies',
    'AI Intelligence',
    'Skills',
    'Integrations',
    'Teams',
    'Access Control',
    'Audit log',
    'Settings',
  ]) {
    await expect
      .element(navigation.getByText(destination, { exact: true }))
      .toBeVisible()
  }
  await expect
    .element(navigation.getByText('Northstar', { exact: true }))
    .toBeVisible()
  await expect
    .element(navigation.getByText('Preview', { exact: true }))
    .not.toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(
    /demo workspace|lyrisoft|iampeters|maiguard/i
  )
  expect(fetch).not.toHaveBeenCalled()
})

it('filters populated overview activity locally by period and repository', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const view = await render(<WorkspaceWindow />)
  await expect.element(view.getByText('1,420', { exact: true })).toBeVisible()
  await view
    .getByRole('button', {
      name: '15 Apr 2026: 8 saved assessments',
      exact: true,
    })
    .click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('15 Apr 2026: 8 assessments')
  await view.getByRole('combobox', { name: 'Assessment period' }).click()
  await page.getByRole('option', { name: 'Last 30 days', exact: true }).click()
  await expect
    .element(view.getByText('1,420', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(
      view.getByRole('button', {
        name: '15 Apr 2026: 8 saved assessments',
        exact: true,
      })
    )
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: /^Filter repositories:/ }).click()
  await page.getByRole('option', { name: /northstar\/platform-api/ }).click()
  await view.getByRole('tab', { name: 'Repositories', exact: true }).click()
  await expect
    .element(
      view.getByRole('button', { name: 'northstar/platform-api', exact: true })
    )
    .toBeVisible()
  await expect
    .element(view.getByText('northstar/web', { exact: true }))
    .not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps section navigation and the footer usable on a phone', async () => {
  await page.viewport(320, 900)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  )
  const view = await render(<SelfHostingPage />)
  const menu = view.getByRole('button', { name: 'Open menu' })
  await menu.click()
  const navigation = view.getByRole('navigation', { name: 'Mobile navigation' })
  await expect.element(navigation).toBeVisible()
  const navigationElement = navigation.element()
  await expect
    .element(navigation.getByRole('link', { name: 'Community Edition' }))
    .toHaveAttribute('aria-current', 'true')
  await expect
    .element(navigation.getByRole('link', { name: 'Product', exact: true }))
    .not.toHaveAttribute('aria-current')
  await userEvent.keyboard('{Escape}')
  await expect.element(navigationElement).not.toBeVisible()
  await expect.element(menu).toHaveFocus()
  const footer = view.getByRole('navigation', { name: 'Footer navigation' })
  await expect
    .element(footer.getByRole('link', { name: 'Security policy' }))
    .toHaveAttribute(
      'href',
      'https://github.com/lyrisoft/preflyt/blob/main/SECURITY.md'
    )
  await expect
    .poll(() => document.documentElement.scrollWidth)
    .toBeLessThanOrEqual(320)
})

it('uses the dynamic latest release badge and accurate public release copy', async () => {
  const view = await render(<MarketingHomepage />)
  const badge = view.getByRole('link', {
    name: 'Latest Preflyt release',
    exact: true,
  })
  await expect
    .element(badge)
    .toHaveAttribute(
      'href',
      'https://github.com/lyrisoft/preflyt/releases/latest'
    )
  await expect
    .element(
      view.getByRole('img', {
        name: 'Latest Preflyt release on GitHub',
        exact: true,
      })
    )
    .toHaveAttribute(
      'src',
      'https://img.shields.io/github/v/release/lyrisoft/preflyt?label=Preflyt&logo=github&color=2f6f60&cacheSeconds=300'
    )
  await expect
    .element(
      view.getByRole('link', {
        name: 'Latest Preflyt Action release',
        exact: true,
      })
    )
    .toHaveAttribute(
      'href',
      'https://github.com/lyrisoft/preflyt-action/releases/latest'
    )
  await expect
    .element(
      view.getByRole('img', {
        name: 'Latest Preflyt Action release on GitHub',
        exact: true,
      })
    )
    .toHaveAttribute(
      'src',
      'https://img.shields.io/github/v/release/lyrisoft/preflyt-action?label=Preflyt%20Action&logo=github&cacheSeconds=300'
    )
  expect(
    document.querySelector('.community-release-note')?.textContent
  ).toContain('Source code and container images are public.')
  expect(
    document.querySelector('.community-release-note')?.textContent
  ).not.toContain('in preparation')
  await expect
    .element(view.getByText('Contributions are welcome.', { exact: false }))
    .toBeVisible()
})
