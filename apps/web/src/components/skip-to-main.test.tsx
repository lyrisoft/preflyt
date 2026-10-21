import '@/styles/index.css'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { Main } from './layout/main'
import { SkipToMain } from './skip-to-main'

afterEach(async () => {
  document.documentElement.style.fontSize = ''
  await page.viewport(1280, 900)
})

it('exposes the shortcut on Tab and transfers focus past workspace navigation without changing the URL', async () => {
  await page.viewport(320, 640)
  document.documentElement.style.fontSize = '200%'
  const view = await render(
    <>
      <button>Keyboard start</button>
      <SkipToMain />
      <nav aria-label='Workspace'>
        <button>Repositories</button>
      </nav>
      <Main>
        <h1>Repository health</h1>
        <button>Refresh health</button>
      </Main>
    </>
  )
  const before = window.location.href
  view.getByRole('button', { name: 'Keyboard start' }).element().focus()
  await userEvent.keyboard('{Tab}')
  const link = view.getByRole('link', { name: 'Skip to main content' })
  await expect.element(link).toHaveFocus()
  await expect
    .poll(() => link.element().getBoundingClientRect().top)
    .toBeGreaterThanOrEqual(0)
  expect(link.element().getBoundingClientRect().right).toBeLessThanOrEqual(320)
  await userEvent.keyboard('{Enter}')
  await expect.element(view.getByRole('main')).toHaveFocus()
  expect(window.location.href).toBe(before)
  await userEvent.keyboard('{Tab}')
  await expect
    .element(view.getByRole('button', { name: 'Refresh health' }))
    .toHaveFocus()
})

it('preserves explicit main landmark props', async () => {
  const view = await render(
    <Main id='custom-content' tabIndex={0} aria-label='Report'>
      Saved report
    </Main>
  )
  await expect
    .element(view.getByRole('main', { name: 'Report' }))
    .toHaveAttribute('id', 'custom-content')
  await expect.element(view.getByRole('main')).toHaveAttribute('tabindex', '0')
})
