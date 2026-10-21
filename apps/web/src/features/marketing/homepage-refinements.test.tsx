import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, server, userEvent } from 'vitest/browser'
import { MarketingHomepage } from './index'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"authenticated":false}'))
  )
})
afterEach(async () => {
  document.documentElement.style.fontSize = ''
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})

it.each([
  [320, '100%'],
  [768, '100%'],
  [1440, '100%'],
  [320, '200%'],
  [1280, '200%'],
])(
  'adapts homepage hierarchy and navigation at %ipx with %s text',
  async (width, size) => {
    await page.viewport(width, 900)
    document.documentElement.style.fontSize = size
    const view = await render(<MarketingHomepage />)
    await expect.element(view.getByRole('heading', { level: 1 })).toBeVisible()
    await expect
      .element(
        view.getByRole('link', {
          name: 'Star on GitHub (opens in a new tab)',
          exact: true,
        })
      )
      .toHaveAttribute('href', 'https://github.com/lyrisoft/preflyt')
    await expect
      .poll(() => document.documentElement.scrollWidth)
      .toBeLessThanOrEqual(width)
    const heading = document
      .querySelector('.reference-feature-heading')!
      .getBoundingClientRect()
    const scene = document
      .querySelector('.reference-feature .product-scene')!
      .getBoundingClientRect()
    if (width === 1440 && size === '100%') {
      expect(scene.left).toBeGreaterThanOrEqual(heading.right)
    } else {
      expect(scene.top).toBeGreaterThanOrEqual(heading.bottom)
      const menu = view.getByRole('button', { name: 'Open menu' })
      await expect.element(menu).toBeVisible()
      expect(
        menu.element().getBoundingClientRect().height
      ).toBeGreaterThanOrEqual(44)
      await menu.click()
      const navigation = view.getByRole('navigation', {
        name: 'Mobile navigation',
      })
      await expect.element(navigation).toBeVisible()
      await expect
        .element(navigation.getByRole('link', { name: 'Install Preflyt' }))
        .toHaveAttribute(
          'href',
          'https://docs.preflytlabs.com/getting-started/quick-start'
        )
      const bounds = navigation.element().getBoundingClientRect()
      expect(bounds.bottom).toBeLessThanOrEqual(900)
      expect(bounds.right).toBeLessThanOrEqual(width)
      for (const link of navigation.element().querySelectorAll('a')) {
        expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      }
      await userEvent.keyboard('{Escape}')
      await expect.element(menu).toHaveFocus()
    }
  }
)

it('skips the website header by keyboard without replacing the current URL', async () => {
  const view = await render(
    <>
      <button>Keyboard start</button>
      <MarketingHomepage />
    </>
  )
  const url = location.href
  view.getByRole('button', { name: 'Keyboard start' }).element().focus()
  await userEvent.keyboard('{Tab}')
  await expect
    .element(view.getByRole('link', { name: 'Skip to content' }))
    .toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(view.getByRole('main')).toHaveFocus()
  expect(location.href).toBe(url)
  await userEvent.keyboard('{Tab}')
  await expect
    .element(
      view
        .getByRole('main')
        .getByRole('link', { name: 'Install Preflyt', exact: true })
    )
    .toHaveFocus()
})

it('keeps the workspace tour bounded and scrollable with keyboard and tab controls', async () => {
  await page.viewport(1280, 900)
  const view = await render(<MarketingHomepage />)
  const region = view.getByRole('region', {
    name: 'Explore the findings page in Northstar',
  })
  expect(region.element().clientHeight).toBeLessThanOrEqual(900 * 0.75)
  expect(region.element().scrollHeight).toBeGreaterThan(
    region.element().clientHeight
  )
  region.element().focus()
  await userEvent.keyboard('{ArrowDown}')
  await expect.poll(() => region.element().scrollTop).toBeGreaterThan(0)
  await view.getByRole('tab', { name: 'Contributors', exact: true }).click()
  await expect
    .element(
      view.getByRole('region', {
        name: 'Explore the contributors page in Northstar',
      })
    )
    .toBeVisible()
})

it('keeps the headline and install action free of entrance animations with reduced motion', async () => {
  await server.commands.setDesignMotion('reduce')
  try {
    const view = await render(<MarketingHomepage />)
    const heading = view.getByRole('heading', { level: 1 }).element()
    const install = view
      .getByRole('main')
      .getByRole('link', { name: 'Install Preflyt', exact: true })
      .element()
    expect(heading.getAnimations()).toHaveLength(0)
    expect(install.getAnimations()).toHaveLength(0)
    expect(document.querySelector('.hero-copy')!.getAnimations()).toHaveLength(
      0
    )
    await expect.element(heading).toBeVisible()
    await expect.element(install).toBeVisible()
  } finally {
    await server.commands.setDesignMotion('no-preference')
  }
})
