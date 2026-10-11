import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { DashboardData } from './dashboard-types'
import { FirstReport } from './first-report'

vi.mock('@tanstack/react-router', () => ({
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
vi.mock('./first-report-action', () => ({
  FirstReportAction: () => <button>Create first report</button>,
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
it('guides inspection, standards and assessment using saved state', () => {
  const html = renderToStaticMarkup(
    <FirstReport
      repositories={[
        { ...repository, profileComplete: true, policy: 'RECOMMENDED' },
      ]}
      session={admin}
    />
  )
  expect(html).toContain('/repositories/123?tab=assessments')
  expect(html).toContain('Missing check results remain visible')
})
it('does not restart onboarding when an existing report falls outside the selected period', () => {
  const html = renderToStaticMarkup(
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
  expect(html).toBe('')
})
it('shows a useful read-only empty state without unauthorized actions', () => {
  const html = renderToStaticMarkup(
    <FirstReport
      repositories={[repository]}
      session={{ permissions: ['repository.read'], repositoryGrants: ['123'] }}
    />
  )
  expect(html).toContain('Ask an organization admin')
  expect(html).not.toContain('href=')
  const wrongScope = renderToStaticMarkup(
    <FirstReport
      repositories={[repository]}
      session={{ permissions: admin.permissions, repositoryGrants: ['456'] }}
    />
  )
  expect(wrongScope).not.toContain('href=')
})
it('starts with explicit repository selection for admins', () => {
  const html = renderToStaticMarkup(
    <FirstReport repositories={[]} session={admin} />
  )
  expect(html).toContain('Select a repository')
  expect(html).toContain('href="/apps"')
})
it('fits a narrow screen in both themes with a long repository name', async () => {
  await page.viewport(320, 900)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const screen = await render(
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
    await expect
      .element(page.getByRole('link', { name: 'Customize setup' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await screen.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})
