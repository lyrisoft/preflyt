import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PricingPage } from './pricing-page'

afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})

it.each([320, 768, 1440])(
  'keeps plan availability and working actions clear at %ipx',
  async (width) => {
    await page.viewport(width, 900)
    const fetch = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('API unavailable')
    })
    vi.stubGlobal('fetch', fetch)
    const view = await render(<PricingPage />)
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Start with open source.Run it your way.')
    const community = view.getByRole('article', { name: 'Community Edition' })
    const cloud = view.getByRole('article', { name: 'Cloud' })
    await expect
      .element(community.getByText('Open source', { exact: true }))
      .toBeVisible()
    await expect
      .element(community.getByText('Available now'))
      .toHaveClass('text-success-text')
    await expect
      .element(cloud.getByText('Coming soon'))
      .not.toHaveClass('text-success-text')
    await expect
      .element(
        community.getByRole('link', { name: 'Install Community Edition' })
      )
      .toHaveAttribute(
        'href',
        'https://docs.preflytlabs.com/getting-started/quick-start'
      )
    await expect
      .element(cloud.getByRole('link', { name: 'Contact us for updates' }))
      .toHaveAttribute(
        'href',
        'mailto:support@lyrisoft.tech?subject=Preflyt%20Cloud%20enquiry'
      )
    await expect
      .element(
        cloud.getByText(
          'A fully managed Preflyt experience, operated by our team.'
        )
      )
      .toBeVisible()
    expect(document.querySelector('.pricing-cloud-workflows')).toBeNull()
    expect(document.querySelector('.pricing-planned-features')).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).toContain(
      'Community Edition source code and container images are public.'
    )
    expect(document.body.textContent).not.toContain('in preparation')
    expect(document.body.textContent).not.toContain('Agentic AI')
    expect(document.body.textContent).not.toContain('Repository-aware AI')
    expect(document.body.textContent).not.toContain('one-click integrations')
    await expect
      .poll(() => document.documentElement.scrollWidth)
      .toBeLessThanOrEqual(width)
    expect(
      fetch.mock.calls.every(([url]) => String(url).endsWith('/auth/session'))
    ).toBe(true)
  }
)

it('explains the separate costs without requiring an account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  )
  const view = await render(<PricingPage />)
  const question = view.getByText('Do I need a paid AI provider?', {
    exact: true,
  })
  await question.click()
  await expect
    .element(
      view.getByText(
        /Repository Health and deterministic CI checks work without AI/
      )
    )
    .toBeVisible()
  expect(document.querySelector('a[href="/pricing"]')).toBeNull()
})

it('keeps the secondary contact action readable when hovered', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  )
  const view = await render(<PricingPage />)
  const action = view.getByRole('link', {
    name: 'Contact us for updates',
    exact: true,
  })
  await page.elementLocator(action.element()).hover()
  const node = action.element() as HTMLElement
  expect(node.matches(':hover')).toBe(true)
  await Promise.all(node.getAnimations().map((animation) => animation.finished))

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const luminance = () => {
    const channels = [...context.getImageData(0, 0, 1, 1).data]
      .slice(0, 3)
      .map((value) => value / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      )
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  context.fillStyle = getComputedStyle(node.closest('article')!).backgroundColor
  context.fillRect(0, 0, 1, 1)
  context.fillStyle = getComputedStyle(node).backgroundColor
  context.fillRect(0, 0, 1, 1)
  const background = luminance()
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = getComputedStyle(node).color
  context.fillRect(0, 0, 1, 1)
  const foreground = luminance()
  const contrast =
    (Math.max(foreground, background) + 0.05) /
    (Math.min(foreground, background) + 0.05)
  expect(contrast).toBeGreaterThanOrEqual(4.5)
})
