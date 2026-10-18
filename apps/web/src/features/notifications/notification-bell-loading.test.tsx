import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { API_BASE_URL } from '@/lib/api'
import { NotificationBell } from './inbox'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
let client: QueryClient
let requests: string[]
let unread: number
let previewStatus: number
let release: (() => void) | undefined
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  requests = []
  unread = 3
  previewStatus = 200
  release = undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).replace(API_BASE_URL, '')
      requests.push(path)
      if (path === '/auth/session')
        return Response.json({ identityId: 'owner', organizationId: 'org' })
      if (path === '/notifications/summary')
        return Response.json({ enabled: true, unreadCount: unread })
      if (path === '/notifications/preview') {
        if (release)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        if (previewStatus !== 200)
          return new Response(null, { status: previewStatus })
        return Response.json({
          enabled: true,
          unreadCount: unread,
          items: unread
            ? [
                {
                  id: 'notice',
                  type: 'ASSESSMENT_COMPLETED',
                  severity: 'info',
                  repository: 'fixture/app',
                  repositoryId: '51',
                  createdAt: new Date().toISOString(),
                  readAt: null,
                },
              ]
            : [],
        })
      }
      if (path === '/notifications/notice/read' && init?.method === 'POST') {
        unread = 0
        return Response.json({ updated: 1 })
      }
      throw new Error('Unexpected request ' + path)
    })
  )
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
})
async function subject() {
  return render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>
  )
}
it('loads only a count while closed, opens a small preview, and refreshes the count after marking read', async () => {
  await subject()
  const bell = page.getByRole('button', { name: 'Notifications, 3 unread' })
  await expect.element(bell).toBeVisible()
  expect(requests.filter((p) => p.startsWith('/notifications'))).toEqual([
    '/notifications/summary',
  ])
  await bell.click()
  await expect
    .element(page.getByRole('button', { name: 'Mark read', exact: true }))
    .toBeVisible()
  expect(requests).toContain('/notifications/preview')
  await page.getByRole('button', { name: 'Mark read', exact: true }).click()
  await expect
    .element(page.getByRole('button', { name: 'Notifications, 0 unread' }))
    .toBeVisible()
  await expect.element(page.getByText('You’re all caught up.')).toBeVisible()
  expect(requests.every((p) => !p.startsWith('/notifications?'))).toBe(true)
})
it('shows loading while the preview is pending and a recoverable error if it fails', async () => {
  release = () => {}
  await subject()
  await page.getByRole('button', { name: 'Notifications, 3 unread' }).click()
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Loading notifications…')
  previewStatus = 503
  release!()
  release = undefined
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Could not load notifications. Try again.')
  previewStatus = 200
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect
    .element(page.getByRole('button', { name: 'Mark read', exact: true }))
    .toBeVisible()
})
