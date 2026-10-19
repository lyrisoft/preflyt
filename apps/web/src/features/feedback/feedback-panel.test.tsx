import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { SidebarProvider } from '@/components/ui/sidebar'
import { NavUser } from '@/components/layout/nav-user'
import { feedbackLink } from './feedback-link'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { identityId: 'owner' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ href: '/private-workspace/page?secret=not-included' }),
}))
const fetched = vi.fn()
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    fetched
      .mockReset()
      .mockImplementation(async (url: string) =>
        Response.json(
          url.endsWith('/auth/session')
            ? { authenticated: true, platformAdmin: true }
            : { installed: 'v0.1.9', development: false }
        )
      )
  )
})
function mount(collapsed = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SidebarProvider defaultOpen={!collapsed}>
        <div className='w-64 max-w-full'>
          <NavUser
            user={{ name: 'Account', email: 'Signed-in account', avatar: '' }}
          />
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
async function openFeedback(kind: 'bug' | 'suggestion') {
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await expect
    .element(page.getByRole('menuitem', { name: 'Sign out' }))
    .toBeVisible()
  await page
    .getByRole('menuitem', {
      name: kind === 'bug' ? 'Report a bug' : 'Suggest an improvement',
    })
    .click()
}
async function fill(kind: 'bug' | 'suggestion') {
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Report shows A&B + 中文')
  await page
    .getByRole('textbox', {
      name:
        kind === 'bug'
          ? 'Steps to reproduce'
          : 'What problem would this solve?',
    })
    .fill('Open Findings\nSelect a saved report.')
  await page
    .getByRole('textbox', {
      name:
        kind === 'bug' ? 'Expected and actual behavior' : 'How should it work?',
    })
    .fill('Show the saved result.')
}
it('opens a public GitHub bug draft without submitting an issue or including workspace data', async () => {
  await mount()
  expect(fetched.mock.calls.some(([url]) => url.endsWith('/releases'))).toBe(
    false
  )
  await openFeedback('bug')
  await expect
    .element(page.getByRole('dialog', { name: 'Report a bug' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Continue on GitHub' }))
    .toBeDisabled()
  await expect
    .element(page.getByText(/Issues in lyrisoft\/preflyt are public/))
    .toBeVisible()
  await fill('bug')
  const link = page.getByRole('link', { name: 'Continue on GitHub' })
  await expect.element(link).toBeVisible()
  const url = new URL(link.element().getAttribute('href')!)
  expect(url.origin + url.pathname).toBe(
    'https://github.com/lyrisoft/preflyt/issues/new'
  )
  expect(Object.fromEntries(url.searchParams)).toEqual({
    template: 'bug_report.yml',
    title: '[Bug]: Report shows A&B + 中文',
    versions: 'v0.1.9',
    reproduce: 'Open Findings\nSelect a saved report.',
    expected: 'Show the saved result.',
  })
  await expect.element(link).toHaveAttribute('target', '_blank')
  await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect.element(link).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(
    fetched.mock.calls.every(
      ([url, init]) =>
        (url.endsWith('/releases') || url.endsWith('/auth/session')) &&
        !init.method
    )
  ).toBe(true)
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect
    .element(page.getByRole('button', { name: 'Open account menu' }))
    .toHaveFocus()
})
it('keeps separate drafts and pre-fills the existing feature form', async () => {
  await mount()
  await openFeedback('bug')
  await fill('bug')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await openFeedback('suggestion')
  await expect
    .element(page.getByRole('textbox', { name: 'Title', exact: true }))
    .toHaveValue('')
  await fill('suggestion')
  const url = new URL(
    page
      .getByRole('link', { name: 'Continue on GitHub' })
      .element()
      .getAttribute('href')!
  )
  expect(url.searchParams.get('template')).toBe('feature_request.yml')
  expect(url.searchParams.get('problem')).toBe(
    'Open Findings\nSelect a saved report.'
  )
  expect(url.searchParams.get('outcome')).toBe('Show the saved result.')
  expect(url.searchParams.get('alternatives')).toBe('Preflyt version: v0.1.9')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await openFeedback('bug')
  await expect
    .element(page.getByRole('textbox', { name: 'Title', exact: true }))
    .toHaveValue('Report shows A&B + 中文')
})
it('rejects whitespace-only and overlong encoded drafts without losing text', async () => {
  await mount()
  await openFeedback('bug')
  await fill('bug')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('   ')
  await expect
    .element(page.getByRole('button', { name: 'Continue on GitHub' }))
    .toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Long report')
  await page
    .getByRole('textbox', { name: 'Steps to reproduce' })
    .fill('界'.repeat(1000))
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Shorten your draft')
  await expect
    .element(page.getByRole('button', { name: 'Continue on GitHub' }))
    .toBeDisabled()
  await expect
    .element(page.getByRole('textbox', { name: 'Steps to reproduce' }))
    .toHaveValue('界'.repeat(1000))
})
it('retains reporting when release metadata is unavailable', async () => {
  fetched.mockImplementation(async () => Response.json({}, { status: 503 }))
  await mount()
  await openFeedback('suggestion')
  await fill('suggestion')
  await expect
    .element(page.getByRole('link', { name: 'Continue on GitHub' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Contact support privately' }))
    .toHaveAttribute('href', 'mailto:support@lyrisoft.tech')
})
it('renders feedback dialogs without horizontal overflow at 320px in both themes', async () => {
  await page.viewport(320, 780)
  await mount(true)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await openFeedback('bug')
    await fill('bug')
    await expect
      .element(page.getByRole('link', { name: 'Continue on GitHub' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/feedback-mobile-${dark ? 'dark' : 'light'}.png`,
    })
    await page
      .getByRole('button', { name: 'Close', exact: true })
      .first()
      .click()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})
it('uses the shared dialog and icon layout on desktop', async () => {
  await page.viewport(1440, 900)
  await mount()
  await openFeedback('suggestion')
  await fill('suggestion')
  await expect
    .element(page.getByRole('link', { name: 'Continue on GitHub' }))
    .toBeVisible()
  expect(
    document.querySelector(
      '[data-slot="dialog-content"] [data-slot="surface-icon"]'
    )
  ).not.toBeNull()
  await page.screenshot({ path: '__screenshots__/feedback-desktop.png' })
})
it('keeps feedback in the account menu above the existing sign-out action', async () => {
  await mount()
  await expect
    .element(page.getByRole('button', { name: 'Report a bug' }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Open account menu' }).click()
  const labels = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent?.trim()
  )
  expect(labels).toEqual(['Report a bug', 'Suggest an improvement', 'Sign out'])
  await page.screenshot({ path: '__screenshots__/feedback-account-menu.png' })
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect
    .element(page.getByRole('alertdialog', { name: 'Sign out' }))
    .toBeVisible()
})
it('encodes untrusted draft text only as form values', () => {
  const url = new URL(
    feedbackLink(
      'suggestion',
      {
        title: '&labels=admin',
        details: '<script>alert(1)</script>',
        outcome: 'é😀',
      },
      'v0.1.9'
    )
  )
  expect(url.searchParams.has('labels')).toBe(false)
  expect(url.searchParams.get('problem')).toBe('<script>alert(1)</script>')
  expect(url.searchParams.get('outcome')).toBe('é😀')
})
