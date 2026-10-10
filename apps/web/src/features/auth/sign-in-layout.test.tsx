import '@/styles/index.css'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignInLayout } from './sign-in-layout'

async function entry(dark = false) {
  document.documentElement.classList.toggle('dark', dark)
  return render(
    <SignInLayout>
      <Card className='sign-in-card'>
        <CardHeader className='gap-2'>
          <CardTitle asChild>
            <h1 className='text-2xl'>Sign in to Preflyt</h1>
          </CardTitle>
          <CardDescription>
            Sign in to your organization’s engineering workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-5'
            onSubmit={(event) => event.preventDefault()}
          >
            <div className='space-y-2'>
              <Label htmlFor='fixture-username'>Username</Label>
              <Input id='fixture-username' autoComplete='username' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='fixture-password'>Password</Label>
              <Input
                id='fixture-password'
                type='password'
                autoComplete='current-password'
              />
            </div>
            <Button className='w-full' type='submit'>
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </SignInLayout>
  )
}

function surface() {
  return document.querySelector<HTMLElement>('.preflyt-sign-in')!
}
function card() {
  return document.querySelector<HTMLElement>('.sign-in-card')!
}
function ambientStates() {
  const nodes = surface().querySelectorAll('[data-ambient]')
  expect(nodes.length).toBeGreaterThan(0)
  return Array.from(nodes, (node) => getComputedStyle(node).animationPlayState)
}
async function motion(state: 'running' | 'paused') {
  await expect
    .poll(() => ambientStates().every((value) => value === state))
    .toBe(true)
}
function withinViewport(element: Element) {
  const bounds = element.getBoundingClientRect()
  expect(bounds.left).toBeGreaterThanOrEqual(-1)
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth + 1)
  expect(bounds.width).toBeGreaterThan(0)
}

afterEach(async () => {
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

it.each([
  { width: 320, height: 844, dark: false },
  { width: 320, height: 844, dark: true },
  { width: 768, height: 900, dark: false },
  { width: 768, height: 900, dark: true },
  { width: 1440, height: 900, dark: false },
  { width: 1440, height: 900, dark: true },
])(
  'keeps the real card and form within $width px in dark=$dark',
  async ({ width, height, dark }) => {
    await page.viewport(width, height)
    const view = await entry(dark)
    await expect
      .element(view.getByRole('heading', { name: 'Sign in to Preflyt' }))
      .toBeVisible()
    await expect.element(view.getByLabelText('Username')).toBeVisible()
    await expect.element(view.getByLabelText('Password')).toBeVisible()
    await expect
      .element(view.getByRole('button', { name: 'Sign in', exact: true }))
      .toBeVisible()
    await expect
      .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
      .toBe(true)
    withinViewport(card())
    withinViewport(view.getByLabelText('Username').element())
    withinViewport(
      view.getByRole('button', { name: 'Sign in', exact: true }).element()
    )
    expect(getComputedStyle(card()).backgroundColor).not.toBe(
      'rgba(0, 0, 0, 0)'
    )
    expect(getComputedStyle(card()).color).not.toBe(
      getComputedStyle(card()).backgroundColor
    )
    const panel = document.querySelector<HTMLElement>('.sign-in-panel')!
    const panelBounds = panel.getBoundingClientRect()
    const cardBounds = card().getBoundingClientRect()
    withinViewport(panel)
    expect(
      Math.abs(panelBounds.left + panelBounds.width / 2 - width / 2)
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(cardBounds.left + cardBounds.width / 2 - width / 2)
    ).toBeLessThanOrEqual(1)
    expect(cardBounds.top).toBeGreaterThanOrEqual(0)
    expect(cardBounds.bottom).toBeLessThanOrEqual(window.innerHeight)
    const control = document.querySelector<HTMLElement>(
      '.sign-in-motion-control'
    )!
    if (width < 768) {
      expect(getComputedStyle(control).display).toBe('none')
      expect(cardBounds.width).toBeGreaterThanOrEqual(width - 64)
    } else {
      await expect
        .element(
          view.getByRole('button', { name: 'Pause background animation' })
        )
        .toBeVisible()
      expect(cardBounds.width).toBeGreaterThanOrEqual(360)
      expect(cardBounds.width).toBeLessThanOrEqual(481)
    }
  }
)

it.each([false, true])(
  'keeps the centered form and access note above the fold on a short desktop in dark=%s',
  async (dark) => {
    await page.viewport(1440, 720)
    const view = await entry(dark)
    await expect
      .element(view.getByRole('button', { name: 'Sign in', exact: true }))
      .toBeVisible()
    const note = document
      .querySelector<HTMLElement>('.sign-in-access-note')!
      .getBoundingClientRect()
    const cardBounds = card().getBoundingClientRect()
    expect(note.bottom).toBeLessThanOrEqual(window.innerHeight)
    expect(note.top).toBeGreaterThan(cardBounds.bottom)
    expect(
      Math.abs(cardBounds.left + cardBounds.width / 2 - window.innerWidth / 2)
    ).toBeLessThanOrEqual(1)
    expect(cardBounds.top).toBeGreaterThanOrEqual(0)
    expect(cardBounds.bottom).toBeLessThanOrEqual(window.innerHeight)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  }
)

it.each([false, true])(
  'lets keyboard users visibly focus, pause and resume real animation in dark=%s',
  async (dark) => {
    await page.viewport(1440, 900)
    const view = await entry(dark)
    expect(
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    ).toBe(true)
    await motion('running')
    const pause = view.getByRole('button', {
      name: 'Pause background animation',
    })
    await userEvent.keyboard('{Tab}')
    await expect
      .poll(() => document.activeElement === pause.element())
      .toBe(true)
    expect(pause.element().matches(':focus-visible')).toBe(true)
    await expect
      .poll(() => getComputedStyle(pause.element()).boxShadow !== 'none')
      .toBe(true)
    await userEvent.keyboard('{Enter}')
    const resume = view.getByRole('button', {
      name: 'Resume background animation',
    })
    await expect.element(resume).toHaveAttribute('aria-pressed', 'true')
    await motion('paused')
    await userEvent.keyboard('{Enter}')
    await expect.element(pause).toHaveAttribute('aria-pressed', 'false')
    await motion('running')
  }
)

it.each([false, true])(
  'pauses actual ambient animation while the form has focus in dark=%s',
  async (dark) => {
    await page.viewport(1440, 900)
    const view = await entry(dark)
    await motion('running')
    const username = view.getByLabelText('Username')
    await username.click()
    await expect.element(username).toHaveFocus()
    await motion('paused')
    await username.fill('fixture-user')
    await motion('paused')
    username.element().blur()
    await motion('running')
  }
)

it('responds to document visibility events with real animation styles using a temporary hidden-state getter', async () => {
  await page.viewport(1440, 900)
  await entry()
  await motion('running')
  const previous = Object.getOwnPropertyDescriptor(document, 'hidden')
  let hidden = true
  try {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await motion('paused')
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await motion('running')
  } finally {
    if (previous) Object.defineProperty(document, 'hidden', previous)
    else Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  }
})
