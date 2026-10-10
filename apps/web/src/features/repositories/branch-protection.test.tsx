import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render as renderBrowser } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { BranchProtection } from './branch-protection'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
beforeEach(() => {
  state.query = {
    isError: false,
    data: {
      branch: 'main',
      page: 1,
      hasMore: false,
      rules: [
        {
          rulesetId: 7,
          sourceType: 'Organization',
          source: 'fixture',
          type: 'required_status_checks',
          requiredApprovals: null,
          checks: [{ context: 'test', integrationId: 123 }],
        },
      ],
      legacy: { status: 'unavailable' },
    },
  }
})
const render = () =>
  renderToStaticMarkup(<BranchProtection repositoryId='repo' />)
it('shows inherited requirements and explains unknown legacy coverage without a merge verdict', () => {
  const html = render()
  expect(html).toContain('Organization')
  expect(html).toContain('App 123')
  expect(html).toContain('does not mean the branch is unprotected')
  expect(html).toContain('GitHub decides whether')
})
it('hides previously loaded requirements after access failure', () => {
  state.query = {
    ...state.query,
    isError: true,
    error: new Error('Access changed'),
  }
  const html = render()
  expect(html).toContain('Access changed')
  expect(html).not.toContain('App 123')
  expect(html).not.toContain('Ruleset 7')
})
it('shows verified legacy requirements separately from active rulesets', () => {
  const data = state.query.data as { legacy: unknown }
  data.legacy = {
    status: 'verified',
    requiredApprovals: 2,
    checks: ['legacy-build'],
    enforceAdmins: true,
  }
  const html = render()
  expect(html).toContain('legacy-build')
  expect(html).toContain('Required approvals: 2')
  expect(html).not.toContain('Could not verify legacy protection')
})

it('keeps requirements readable without horizontal overflow on mobile in both themes', async () => {
  const data = state.query.data as { branch: string }
  data.branch = `feature/${'long-branch-name-'.repeat(8)}`
  await page.viewport(320, 800)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const screen = await renderBrowser(<BranchProtection repositoryId='repo' />)
    await expect
      .element(page.getByText(`Active rules for ${data.branch}`))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await screen.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})
