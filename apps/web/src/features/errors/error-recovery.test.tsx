import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { GeneralError } from './general-error'
import { MaintenanceError } from './maintenance-error'

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate }) }))
afterEach(async () => {
  vi.resetAllMocks()
  document.documentElement.style.fontSize = ''
  await page.viewport(1280, 900)
})

it('retries failed route data before resetting the error boundary and prevents duplicate retries', async () => {
  let finish!: () => void
  invalidate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const reset = vi.fn()
  const view = await render(<GeneralError reset={reset} />)
  await view.getByRole('button', { name: 'Try again' }).click()
  expect(invalidate).toHaveBeenCalledOnce()
  expect(reset).not.toHaveBeenCalled()
  await expect
    .element(view.getByRole('button', { name: 'Loading page…' }))
    .toBeDisabled()
  finish()
  await expect.poll(() => reset.mock.calls.length).toBe(1)
  await expect
    .element(view.getByRole('link', { name: 'Open Preflyt' }))
    .toHaveAttribute('href', '/')
})

it('provides a working maintenance recovery destination without a dead action or a promised recovery time', async () => {
  const view = await render(<MaintenanceError />)
  await expect
    .element(
      view.getByRole('heading', { name: 'Preflyt is temporarily unavailable' })
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Try Preflyt again' }))
    .toHaveAttribute('href', '/')
  await expect
    .element(view.getByRole('button', { name: 'Learn more' }))
    .not.toBeInTheDocument()
  expect(view.container.textContent).not.toContain('shortly')
})

for (const component of [
  <GeneralError key='error' />,
  <MaintenanceError key='maintenance' />,
]) {
  it(`keeps ${component.key} recovery readable at 320px and 200% text`, async () => {
    await page.viewport(320, 480)
    document.documentElement.style.fontSize = '200%'
    const view = await render(component)
    await expect.element(view.getByRole('heading')).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    const link = view.getByRole('link')
    link.element().focus()
    await expect.element(link).toHaveFocus()
    expect(link.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
      480
    )
  })
}
