import type { ReactNode } from 'react'
import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RepositoryInventoryTable } from './index'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  Link: ({
    params,
    children,
    ...props
  }: {
    params: { repositoryId: string }
    children: ReactNode
  }) => (
    <a href={`/repositories/${params.repositoryId}`} {...props}>
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
    'Owner',
    'Default branch',
    'Visibility',
    'Stack',
    'GitHub account',
    'Selection',
  ]) {
    await expect
      .element(page.getByRole('columnheader', { name, exact: true }))
      .toBeVisible()
  }
  await expect
    .element(page.getByRole('link', { name: 'Open org/service' }))
    .toHaveAttribute('href', '/repositories/101')
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
    <TooltipProvider><RepositoryInventoryTable
      repositories={[repository]}
      canManage
      savingRepository={null}
      onSelectionChange={change}
    /></TooltipProvider>
  )
  await page.getByRole('checkbox', { name: 'Select org/service' }).click()
  expect(change).toHaveBeenCalledWith(repository, false)
  await view.rerender(
    <TooltipProvider><RepositoryInventoryTable
      repositories={[repository]}
      canManage
      savingRepository='101'
      onSelectionChange={change}
    /></TooltipProvider>
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
    .element(page.getByText('Not selected', { exact: true }))
    .toBeVisible()
  await view.unmount()
})
