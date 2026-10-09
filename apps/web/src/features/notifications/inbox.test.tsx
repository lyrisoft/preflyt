import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { NotificationBell } from './inbox'

const inbox = vi.hoisted(() => ({
  query: {
    isPending: false,
    isError: false,
    data: undefined as
      undefined | { enabled: boolean; unreadCount: number; items: never[] },
    error: null,
    refetch: vi.fn(),
  },
  session: { isError: false, refetch: vi.fn() },
  read: { isPending: false, isError: false },
}))
vi.mock('./notification-query', () => ({
  useInbox: () => inbox,
  titles: {},
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

it.each(['loading', 'disabled', 'empty', 'session error', 'unread'])(
  'keeps the header bell visible when %s',
  (state) => {
    inbox.query.isPending = state === 'loading' || state === 'session error'
    inbox.session.isError = state === 'session error'
    inbox.query.data =
      state === 'loading'
        ? undefined
        : {
            items: [],
            enabled: state !== 'disabled',
            unreadCount: state === 'unread' ? 3 : 0,
          }
    const html = renderToStaticMarkup(<NotificationBell />)
    expect(html).toContain('lucide-bell')
    expect(html).toContain(
      state === 'session error' ? 'Notifications unavailable' : 'Notifications,'
    )
    if (state === 'unread') expect(html).toContain('>3</span>')
  }
)
