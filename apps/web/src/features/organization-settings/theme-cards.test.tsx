import '@/styles/index.css'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { getCookie, removeCookie } from '@/lib/cookies'
import { ThemeProvider } from '@/context/theme-provider'
import { ThemeCards } from './theme-cards'

const storageKey = 'preflyt-theme-cards-test'
afterEach(async () => {
  removeCookie(storageKey)
  document.documentElement.classList.remove('dark', 'light')
  await page.viewport(1280, 900)
})
it('switches themes from cards, supports arrow keys and persists the selection', async () => {
  const view = await render(
    <ThemeProvider storageKey={storageKey}>
      <ThemeCards />
    </ThemeProvider>
  )
  await expect
    .element(view.getByRole('radio', { name: 'System', exact: true }))
    .toHaveAttribute('aria-checked', 'true')
  await view.getByRole('radio', { name: 'Light', exact: true }).click()
  expect(getCookie(storageKey)).toBe('light')
  await expect
    .poll(() => document.documentElement.classList.contains('light'))
    .toBe(true)
  // Start keyboard navigation from the selected radio, independently of pointer
  // focus behavior (macOS does not always focus buttons on a mouse click).
  view.getByRole('radio', { name: 'Light', exact: true }).element().focus()
  await expect
    .element(view.getByRole('radio', { name: 'Light', exact: true }))
    .toHaveFocus()
  await userEvent.keyboard('{ArrowRight}')
  await expect
    .element(view.getByRole('radio', { name: 'Dark', exact: true }))
    .toHaveAttribute('aria-checked', 'true')
  expect(getCookie(storageKey)).toBe('dark')
  await expect
    .poll(() => document.documentElement.classList.contains('dark'))
    .toBe(true)
  await view.getByRole('radio', { name: 'System', exact: true }).click()
  expect(getCookie(storageKey)).toBe('system')
  await view.unmount()
  const reopened = await render(
    <ThemeProvider storageKey={storageKey}>
      <ThemeCards />
    </ThemeProvider>
  )
  await expect
    .element(reopened.getByRole('radio', { name: 'System', exact: true }))
    .toHaveAttribute('aria-checked', 'true')
})
it('shows three cards without horizontal overflow on mobile and desktop', async () => {
  const view = await render(
    <div className='mx-auto max-w-4xl p-6'>
      <ThemeProvider storageKey={storageKey}>
        <ThemeCards />
      </ThemeProvider>
    </div>
  )
  for (const width of [390, 1280]) {
    await page.viewport(width, 900)
    for (const theme of ['Light', 'Dark']) {
      await view.getByRole('radio', { name: theme, exact: true }).click()
      await expect
        .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
        .toBe(true)
      for (const name of ['System', 'Light', 'Dark']) {
        await expect
          .element(view.getByRole('radio', { name, exact: true }))
          .toBeVisible()
      }
      await page.screenshot({
        path: `__screenshots__/theme-cards-${width}-${theme.toLowerCase()}.png`,
      })
    }
  }
})
