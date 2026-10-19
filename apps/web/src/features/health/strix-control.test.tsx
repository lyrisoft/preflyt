import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { Button } from '@/components/ui/button'
import { StrixControl } from './strix-control'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})
async function show(available: boolean, selected = false, onChange = vi.fn()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        available,
        reason: available ? 'Model ready.' : 'Connect a tested AI model.',
      })
    )
  )
  function Option() {
    const [checked, setChecked] = useState(selected)
    return (
      <StrixControl
        repositoryId='51'
        disabled={false}
        checked={checked}
        onCheckedChange={(value) => {
          setChecked(value)
          onChange(value)
        }}
      >
        <Button size='sm' className='rounded-e-none shadow-none'>
          Reassess
        </Button>
      </StrixControl>
    )
  }
  await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Option />
    </QueryClientProvider>
  )
  return onChange
}
it('offers an optional AI review through the shared assessment action', async () => {
  const changed = await show(true)
  await expect
    .element(page.getByText(/Provider charges may apply/))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  const checkbox = page.getByRole('menuitemcheckbox', {
    name: 'Include AI security review',
  })
  await expect.element(checkbox).toBeEnabled()
  await checkbox.click()
  expect(changed).toHaveBeenCalledWith(true)
  await expect.element(checkbox).toBeChecked()
  await expect
    .element(page.getByText(/Provider charges may apply/))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Run VAPT assessment' }))
    .not.toBeInTheDocument()
})
it('keeps normal assessment available when no AI model is connected', async () => {
  await show(false)
  await expect
    .element(page.getByRole('button', { name: 'Reassess', exact: true }))
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeDisabled()
  await expect
    .element(
      page.getByText(/AI review will be skipped; standard checks can still run/)
    )
    .toBeVisible()
})
it('preserves a remembered selection while explaining that disconnected AI will be skipped', async () => {
  await show(false, true)
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeChecked()
  await expect
    .element(page.getByText(/Connect a tested AI model/))
    .toBeVisible()
})

it('supports keyboard selection and returns focus to the options button', async () => {
  const changed = await show(true)
  const options = page.getByRole('button', { name: 'Assessment options' })
  ;(options.element() as HTMLButtonElement).focus()
  await userEvent.keyboard('{ArrowDown}')
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toHaveFocus()
  await userEvent.keyboard(' ')
  expect(changed).toHaveBeenCalledWith(true)
  await userEvent.keyboard('{Escape}')
  await expect.element(options).toHaveFocus()
})

it('marks AI security review as beta using the shared badge without changing selection', async () => {
  await show(true)
  await page.getByRole('button', { name: 'Assessment options' }).click()
  const option = page.getByRole('menuitemcheckbox', {
    name: 'Include AI security review',
    exact: true,
  })
  await expect.element(option.getByText('beta', { exact: true })).toBeVisible()
  await expect.element(option).toHaveAttribute('aria-checked', 'false')
})
