import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { WorkspaceWindow } from './workspace-window'

afterEach(() => vi.unstubAllGlobals())

it('explores demo findings, contributors and repository details without private API calls', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const view = await render(<WorkspaceWindow initialView='findings' />)
  await view.getByRole('button', { name: 'Filter High: 2' }).click()
  await expect.element(view.getByText('High severity issues')).toBeVisible()
  await expect
    .element(view.getByText('Unused exception parameter'))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Show all issues' }).click()
  await expect
    .element(view.getByText('Unused exception parameter'))
    .toBeVisible()
  await view
    .getByRole('group', { name: 'Choose a complete workspace page' })
    .getByRole('button', { name: 'Contributors', exact: true })
    .click()
  await expect
    .element(view.getByText('Participation over time', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('alex-northstar', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('group', { name: 'Choose a complete workspace page' })
    .getByRole('button', { name: 'Repository health', exact: true })
    .click()
  await expect
    .element(view.getByRole('heading', { name: 'northstar/platform-api' }))
    .toBeVisible()
  await expect
    .element(view.getByText('Inspection complete', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Analysis coverage', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Search repository findings' })
    .fill('privilege')
  await expect
    .element(
      view.getByText('Container security context permits privilege escalation')
    )
    .toBeVisible()
  await expect
    .element(view.getByText('Dependency update requires review'))
    .not.toBeInTheDocument()
  await expect.element(view.getByText('91.6%', { exact: true })).toBeVisible()
  await expect.element(view.getByText('2.4%', { exact: true })).toBeVisible()
  await expect
    .element(view.getByText('Analysis history unavailable'))
    .not.toBeInTheDocument()
  await view
    .getByRole('tab', { name: 'Assessment history (6)', exact: true })
    .click()
  await expect
    .element(view.getByRole('tabpanel', { name: 'Assessment history (6)' }))
    .toHaveTextContent('12 findings')
  await expect
    .element(view.getByRole('textbox', { name: 'Search repository findings' }))
    .not.toBeInTheDocument()
  await view.getByRole('tab', { name: 'Findings (3)', exact: true }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Search repository findings' }))
    .toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})
