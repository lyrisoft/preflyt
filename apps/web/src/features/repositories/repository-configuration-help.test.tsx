import '@/styles/index.css'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { repositoryConfigurationHelp } from './repository-configuration-help'

it('explains every configuration label and why CI-only checks are excluded from setup gaps in Help', async () => {
  const view = await render(
    <PageHelpDrawer title='Repository' sections={repositoryConfigurationHelp} />
  )
  await page.getByRole('button', { name: 'Help for Repository' }).click()
  const dialog = page.getByRole('dialog')
  await expect
    .element(
      dialog.getByRole('heading', { name: 'Check configuration labels' })
    )
    .toBeVisible()
  for (const label of [
    'Files found / Related files found',
    'Not found',
    'Configuration not determined',
    'CI evidence required',
  ]) {
    await expect
      .element(dialog.getByText(label, { exact: true }))
      .toBeInTheDocument()
  }
  await expect
    .element(dialog.getByText(/including build validation and type checking/))
    .toBeInTheDocument()
  await expect
    .element(
      dialog.getByText(
        /A required check stays incomplete until its required evidence is verified/
      )
    )
    .toBeInTheDocument()
  await expect
    .element(dialog.getByText(/these are excluded from Setup gaps/))
    .toBeInTheDocument()
  await expect
    .element(dialog.getByText(/excluding CI-only checks from the denominator/))
    .toBeInTheDocument()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await view.unmount()
})
