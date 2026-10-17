import type { ReactNode } from 'react'
import type * as RouterModule from '@tanstack/react-router'
import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { HealthPortfolioData } from '../health/health-api'
import { RepositoryInventoryTable } from './index'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof RouterModule>()),
  Link: ({
    params,
    children,
    search,
    to: _to,
    ...props
  }: {
    params: { repositoryId: string }
    to: string
    search?: Record<string, string | undefined>
    children: ReactNode
  }) => (
    <a
      href={`/repositories/${params.repositoryId}${search ? '?' + new URLSearchParams(Object.entries(search).filter((entry): entry is [string, string] => entry[1] !== undefined)) : ''}`}
      {...props}
    >
      {children}
    </a>
  ),
}))
const repository = {
  githubId: '101',
  name: 'service',
  fullName: 'org/service',
  ownerLogin: 'org',
  defaultBranch: 'main',
  isPrivate: true,
  selected: true,
  technologies: ['TypeScript', 'React'],
  profiledAt: '2026-10-10',
  profileSha: 'abcdef123',
  installation: { accountLogin: 'connected-org' },
}

it('shows card information in separate columns and keeps the repository link', async () => {
  const view = await render(
    <TooltipProvider>
      <RepositoryInventoryTable
        repositories={[repository]}
        canManage
        savingRepository={null}
        onSelectionChange={vi.fn()}
      />
    </TooltipProvider>
  )
  for (const name of [
    'Repository',
    'Health status',
    'Owner',
    'Default branch',
    'Visibility',
    'Stack',
    'GitHub account',
    'Actions',
  ]) {
    await expect
      .element(page.getByRole('columnheader', { name, exact: true }))
      .toBeVisible()
  }
  await expect
    .element(page.getByRole('link', { name: 'Open org/service' }))
    .toHaveAttribute('href', '/repositories/101')
  await expect
    .element(page.getByRole('columnheader', { name: 'Selection', exact: true }))
    .not.toBeInTheDocument()
  for (const name of ['org', 'main', 'Private', 'connected-org']) {
    await expect
      .element(page.getByRole('cell', { name, exact: true }))
      .toBeVisible()
  }
  await expect
    .element(page.getByRole('img', { name: 'TypeScript' }))
    .toBeVisible()
  await expect.element(page.getByRole('img', { name: 'React' })).toBeVisible()
  await view.unmount()
})

it('preserves selection changes and disables controls while saving', async () => {
  const change = vi.fn()
  const view = await render(
    <TooltipProvider>
      <RepositoryInventoryTable
        repositories={[repository]}
        canManage
        savingRepository={null}
        onSelectionChange={change}
      />
    </TooltipProvider>
  )
  await page.getByRole('checkbox', { name: 'Select org/service' }).click()
  expect(change).toHaveBeenCalledWith(repository, false)
  await view.rerender(
    <TooltipProvider>
      <RepositoryInventoryTable
        repositories={[repository]}
        canManage
        savingRepository='101'
        onSelectionChange={change}
      />
    </TooltipProvider>
  )
  await expect
    .element(page.getByRole('checkbox', { name: 'Select org/service' }))
    .toBeDisabled()
  await expect.element(page.getByRole('status')).toHaveTextContent('Saving…')
  await view.unmount()
})

it('does not offer selection to read-only users or link unselected repositories', async () => {
  const view = await render(
    <RepositoryInventoryTable
      repositories={[{ ...repository, selected: false }]}
      canManage={false}
      savingRepository={null}
      onSelectionChange={vi.fn()}
    />
  )
  await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument()
  await expect.element(page.getByRole('link')).not.toBeInTheDocument()
  await expect.element(page.getByText('Select to view stack')).toBeVisible()
  await expect
    .element(page.getByText('Select to assess', { exact: true }))
    .toBeVisible()
  await view.unmount()
})

it('shows health without a duplicate branch and keeps the report link in the final Actions column', async () => {
  const health = {
    items: new Map([
      [
        '101',
        {
          repositoryId: '101',
          name: 'org/service',
          branch: 'development',
          id: '11111111-1111-4111-8111-111111111111',
          state: 'COMPLETED',
          completeness: 'PARTIAL',
          mode: 'INSPECTION_ONLY',
          freshness: 'CURRENT',
          finishedAt: null,
          findings: null,
          severity: null,
        },
      ],
    ]),
    pending: false,
    failed: false,
    canRead: () => true,
  }
  const view = await render(
    <TooltipProvider>
      <RepositoryInventoryTable
        repositories={[repository]}
        canManage
        savingRepository={null}
        onSelectionChange={vi.fn()}
        health={health}
      />
    </TooltipProvider>
  )
  await expect.element(page.getByText('Partial', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('Inspection only', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'View report for org/service' }))
    .toHaveAttribute(
      'href',
      '/repositories/101?tab=health&health=11111111-1111-4111-8111-111111111111'
    )
  await expect
    .element(page.getByText('development', { exact: true }))
    .not.toBeInTheDocument()
  const table = page
    .getByRole('table', { name: 'Repository inventory' })
    .element()
  const headers = table.querySelectorAll('thead th')
  expect(headers[headers.length - 1].textContent).toBe('Actions')
  const cells = table.querySelectorAll('tbody tr:first-child td')
  const actionCell = cells[cells.length - 1]
  expect(actionCell.querySelector('a')?.textContent).toBe('View report')
  expect(cells[2].querySelector('a')).toBeNull()
  await expect
    .element(page.getByText('Complete', { exact: true }))
    .not.toBeInTheDocument()
  await view.unmount()
})
it('keeps missing analysis, loading and denied access distinct without leaking report links', async () => {
  const base = {
    items: new Map(),
    pending: false,
    failed: false,
    canRead: () => true,
  }
  const props = {
    repositories: [repository],
    canManage: false,
    savingRepository: null,
    onSelectionChange: vi.fn(),
  }
  const view = await render(
    <RepositoryInventoryTable {...props} health={{ ...base, pending: true }} />
  )
  await expect.element(page.getByText('Loading health…')).toBeVisible()
  await view.rerender(
    <RepositoryInventoryTable {...props} health={{ ...base, failed: true }} />
  )
  await expect
    .element(page.getByText('Unavailable', { exact: true }))
    .toBeVisible()
  await view.rerender(<RepositoryInventoryTable {...props} health={base} />)
  await expect
    .element(page.getByText('Not loaded', { exact: true }))
    .toBeVisible()
  await view.rerender(
    <RepositoryInventoryTable
      {...props}
      health={{ ...base, canRead: () => false }}
    />
  )
  await expect
    .element(page.getByText('No access', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: /View report|Open Health/ }))
    .not.toBeInTheDocument()
  await view.unmount()
})
it('keeps the inventory scrollable at 320px in both themes', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await render(
      <div className='p-4'>
        <RepositoryInventoryTable
          repositories={[repository]}
          canManage={false}
          savingRepository={null}
          onSelectionChange={vi.fn()}
        />
      </div>
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    const container = document.querySelector('[data-slot="table-container"]')!
    await expect.poll(() => container.getAttribute('tabindex')).toBe('0')
    expect(container.scrollWidth).toBeGreaterThan(container.clientWidth)
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

it('shows passed Health as Healthy in green without treating partial inspection as passing', async () => {
  const { InventoryHealthCell } = await import('../health/inventory-health')
  const item = {
    repositoryId: '101',
    name: 'org/service',
    branch: 'main',
    id: 'saved',
    state: 'COMPLETED',
    result: 'PASS' as const,
    completeness: 'COMPLETE',
    mode: 'EXECUTED',
    freshness: 'CURRENT',
    finishedAt: null,
    findings: 0,
    severity: null,
  }
  const health = {
    items: new Map([['101', item]]),
    pending: false,
    failed: false,
    canRead: () => true,
  }
  const view = await render(
    <InventoryHealthCell repositoryId='101' selected health={health} />
  )
  await expect
    .element(view.getByText('Healthy'))
    .toHaveClass('text-success-text')
  await view.rerender(
    <InventoryHealthCell
      repositoryId='101'
      selected
      health={{
        ...health,
        items: new Map([
          [
            '101',
            {
              ...item,
              result: 'INCOMPLETE',
              completeness: 'PARTIAL',
              mode: 'INSPECTION_ONLY',
            },
          ],
        ]),
      }}
    />
  )
  await expect
    .element(view.getByText('Partial'))
    .toHaveClass('text-warning-text')
  await expect.element(view.getByText('Healthy')).not.toBeInTheDocument()
})

it('shows API overall health consistently even when analysis is partial', async () => {
  const { InventoryHealthCell } = await import('../health/inventory-health')
  const item: HealthPortfolioData['items'][number] = {
    name: 'fixture/repo',
    branch: 'main',
    id: 'saved',
    finishedAt: null,
    severity: { high: 1 },
    repositoryId: '51',
    state: 'COMPLETED',
    mode: 'EXECUTED',
    completeness: 'PARTIAL',
    findings: 1,
    freshness: 'CURRENT',
    overallHealth: {
      version: 1,
      status: 'UNHEALTHY',
      reasons: ['Critical finding.'],
    },
  }
  const health = {
    items: new Map([['51', item]]),
    pending: false,
    failed: false,
    canRead: () => true,
  }
  const view = await render(
    <InventoryHealthCell repositoryId='51' selected health={health} />
  )
  await expect
    .element(view.getByText('Unhealthy'))
    .toHaveClass('text-danger-text')
  item.overallHealth!.status = 'INCOMPLETE'
  await view.rerender(
    <InventoryHealthCell repositoryId='51' selected health={health} />
  )
  await expect.element(view.getByText('Incomplete')).toBeVisible()
  expect(
    view.getByText('Incomplete').element().closest('[data-slot="badge"]')
      ?.className
  ).toContain('text-warning-text')
})

it('shows Terraform and YAML stack labels for infrastructure repositories', async () => {
  const view = await render(
    <TooltipProvider>
      <RepositoryInventoryTable
        repositories={[{ ...repository, technologies: ['Terraform', 'YAML'] }]}
        canManage
        savingRepository={null}
        onSelectionChange={vi.fn()}
      />
    </TooltipProvider>
  )
  await expect
    .element(view.getByRole('img', { name: 'Terraform', exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'YAML', exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Stack not detected'))
    .not.toBeInTheDocument()
})
