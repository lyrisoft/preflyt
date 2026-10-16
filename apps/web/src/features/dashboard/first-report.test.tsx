import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { Standards } from '@/features/repositories/repository-queries'
import type { ScopedSession } from '@/features/workspace/scoped-access'
import type { DashboardData } from './dashboard-types'
import { FirstReport } from './first-report'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: { repositoryId: string }
    search?: { tab: string }
  }) => (
    <a
      {...props}
      href={`${to.replace('$repositoryId', params?.repositoryId ?? '')}${search ? `?tab=${search.tab}` : ''}`}
    >
      {children}
    </a>
  ),
}))
const repository: DashboardData['repositories'][number] = {
  githubId: '123',
  fullName: 'example/service',
  technologies: [],
  profileComplete: null,
  policy: null,
  latestAssessment: null,
  readiness: 'INCOMPLETE',
  sync: { state: 'unknown', verifiedAt: null },
}
const admin = {
  permissions: ['repository.manage', 'policy.draft', 'assessment.run'],
  organizationWide: true,
}
const inspected: Standards = {
  selection: null,
  selectionIntegrity: true,
  profileSnapshot: { sourceSha: 'a'.repeat(40), complete: true },
  recommendations: [
    { id: 'baseline', version: '1.1.0', reason: 'Core checks' },
  ],
  catalogue: [
    {
      id: 'baseline',
      version: '1.1.0',
      title: 'Engineering baseline',
      description: 'Core checks',
      digest: 'a'.repeat(64),
      stages: [],
      rules: [
        {
          id: 'build',
          title: 'Build succeeds',
          capability: 'ci',
          guidance: '',
          requiredIn: [],
        },
      ],
    },
  ],
  adoptionProfiles: ['RECOMMENDED'],
  controls: [],
}
const ready: Standards = {
  ...inspected,
  selection: {
    id: 'selection',
    revision: 1,
    profile: 'RECOMMENDED',
    packs: [{ id: 'baseline', version: '1.1.0' }],
    sourceSha: 'a'.repeat(40),
    createdAt: '2026-10-16',
  },
}
const initial = { ...inspected, profileSnapshot: null }
function setup(data: Standards = initial) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(['repository-standards', '123'], data)
  return {
    client,
    wrap: (children: React.ReactNode) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
function html(data: Standards, session: ScopedSession = admin) {
  return renderToStaticMarkup(
    setup(data).wrap(
      <FirstReport repositories={[repository]} session={session} />
    )
  )
}
afterEach(() => {
  vi.unstubAllGlobals()
  navigate.mockReset()
})
it('matches the current action to saved progress and never offers the final action early', () => {
  expect(html(initial)).toContain('>Inspect repository<')
  expect(html(initial)).not.toContain('>Create assessment<')
  expect(html(inspected)).toContain('Save standards and continue')
  expect(html(inspected)).toContain('Engineering baseline')
  expect(html(inspected)).not.toContain('>Create assessment<')
  expect(html(ready)).toContain('>Create assessment<')
  expect(html(ready)).toContain('Missing CI results will remain visible')
  expect(html(ready)).toContain('/repositories/123?tab=assessments')
})
it('does not restart onboarding when an existing assessment falls outside the period', () => {
  const { wrap } = setup()
  expect(
    renderToStaticMarkup(
      wrap(
        <FirstReport
          repositories={[
            {
              ...repository,
              latestAssessment: {
                id: 'report',
                sourceSha: 'a'.repeat(40),
                createdAt: '2020-01-01',
              },
            },
          ]}
          session={admin}
        />
      )
    )
  ).toBe('')
})
it('does not expose actions outside repository scope or require permissions for completed steps', () => {
  const readOnly = {
    permissions: ['repository.read'],
    organizationWide: false,
    repositoryGrants: ['123'],
  }
  expect(html(initial, readOnly)).toContain('Ask an organization admin')
  expect(html(initial, readOnly)).not.toContain('href=')
  expect(
    html(initial, {
      ...admin,
      organizationWide: false,
      repositoryGrants: ['456'],
    })
  ).not.toContain('href=')
  expect(
    html(ready, { permissions: ['assessment.run'], organizationWide: true })
  ).toContain('>Create assessment<')
})
it('starts with repository selection rather than presenting unrelated setup actions', () => {
  const { wrap } = setup()
  const output = renderToStaticMarkup(
    wrap(<FirstReport repositories={[]} session={admin} />)
  )
  expect(output).toContain('href="/repositories"')
  expect(output).toContain('Select a repository')
  expect(output).not.toContain('First report setup')
})
it('keeps invalid saved standards and partial inspection honest', () => {
  const output = html({ ...ready, selectionIntegrity: false })
  expect(output).toContain('Saved standard versions need review')
  expect(output).toContain('/repositories/123?tab=standards')
  expect(output).not.toContain('>Create assessment<')
  expect(output).not.toContain('Save standards and continue')
  const partial = html({
    ...inspected,
    profileSnapshot: { sourceSha: 'a'.repeat(40), complete: false },
  })
  expect(partial).toContain('Partial')
})
it('walks through inspection, explicit standards review and assessment creation in order', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response(JSON.stringify(inspected)))
    .mockResolvedValueOnce(new Response(JSON.stringify(ready.selection)))
    .mockResolvedValueOnce(new Response(JSON.stringify(ready)))
    .mockResolvedValueOnce(new Response(JSON.stringify(ready)))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ assessment: { id: 'report' } }))
    )
    .mockResolvedValue(new Response(JSON.stringify(ready)))
  vi.stubGlobal('fetch', fetch)
  const { wrap } = setup()
  const screen = await render(
    wrap(<FirstReport repositories={[repository]} session={admin} />)
  )
  await page
    .getByRole('button', { name: 'Inspect repository', exact: true })
    .click()
  await expect
    .element(page.getByRole('button', { name: 'Save standards and continue' }))
    .toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.waitFor(() =>
    expect(document.activeElement?.textContent).toBe(
      'Step 2: Review and save standards'
    )
  )
  await page.getByRole('checkbox', { name: /Engineering baseline/ }).click()
  await expect
    .element(page.getByRole('button', { name: 'Save standards and continue' }))
    .toBeDisabled()
  await page.getByRole('checkbox', { name: /Engineering baseline/ }).click()
  await page
    .getByRole('button', { name: 'Save standards and continue' })
    .click()
  await expect
    .element(
      page.getByRole('button', { name: 'Create assessment', exact: true })
    )
    .toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(4)
  await page
    .getByRole('button', { name: 'Create assessment', exact: true })
    .click()
  await vi.waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      to: '/repositories/$repositoryId',
      params: { repositoryId: '123' },
      search: { tab: 'assessments', assessment: 'report' },
    })
  )
  expect(
    fetch.mock.calls.map(([url, options]) => [
      new URL(url).pathname,
      options?.method ?? 'GET',
    ])
  ).toEqual([
    ['/github/repositories/123/profile', 'POST'],
    ['/github/repositories/123/standards', 'GET'],
    ['/github/repositories/123/standards', 'POST'],
    ['/github/repositories/123/standards', 'GET'],
    ['/github/repositories/123/standards', 'GET'],
    ['/github/repositories/123/assessments', 'POST'],
    ['/github/repositories/123/standards', 'GET'],
  ])
  await screen.unmount()
})
it('shows a persistent inspection error and does not advance or save standards', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValue(new Response(JSON.stringify(initial)))
  vi.stubGlobal('fetch', fetch)
  const screen = await render(
    setup().wrap(<FirstReport repositories={[repository]} session={admin} />)
  )
  await page
    .getByRole('button', { name: 'Inspect repository', exact: true })
    .click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Saved progress is kept')
  await expect
    .element(
      page.getByRole('button', { name: 'Inspect repository', exact: true })
    )
    .toBeEnabled()
  expect(
    fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
  ).toHaveLength(1)
  await screen.unmount()
})
it('fits a narrow screen in both themes with long repository and standard names', async () => {
  await page.viewport(320, 900)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const { wrap } = setup(inspected)
    const screen = await render(
      wrap(
        <div className='p-4'>
          <FirstReport
            repositories={[
              {
                ...repository,
                fullName: 'organization/' + 'long-repository-name-'.repeat(8),
              },
            ]}
            session={admin}
          />
        </div>
      )
    )
    await expect
      .element(
        page.getByRole('button', { name: 'Save standards and continue' })
      )
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await screen.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})
