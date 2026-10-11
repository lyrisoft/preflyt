import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { NotificationBell, NotificationItem } from './inbox'

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
  titles: {
    AI_MODEL_UNAVAILABLE: 'Model requests keep failing',
    AI_REVIEW_BUDGET_REACHED: 'Previous AI review could not start',
    NATIVE_EXECUTION_FAILED: 'Check execution failed',
    POLICY_EXCEPTION_APPROVED: 'Policy exception approved',
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
  }: {
    children: React.ReactNode
    to: string
    search?: unknown
    params?: unknown
  }) => (
    <a
      href={to}
      data-search={JSON.stringify(search)}
      data-params={JSON.stringify(params)}
    >
      {children}
    </a>
  ),
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

const item = {
  id: 'item',
  createdAt: '2026-10-10T10:00:00.000Z',
  readAt: null,
  type: 'AI_MODEL_UNAVAILABLE',
  severity: 'error',
  repository: 'fixture/review',
  repositoryId: '81818',
  assessmentId: null,
  sourceSha: null,
}
it.each([
  ['AI_MODEL_UNAVAILABLE', 'connections', 'Model requests keep failing'],
  ['AI_REVIEW_BUDGET_REACHED', 'routing', 'Previous AI review could not start'],
])('links %s to the right AI settings tab', (type, tab, label) => {
  const html = renderToStaticMarkup(
    <NotificationItem
      item={{ ...item, type }}
      busy={false}
      onRead={() => undefined}
    />
  )
  expect(html).toContain('href="/intelligence"')
  expect(html).toContain(`&quot;tab&quot;:&quot;${tab}&quot;`)
  expect(html).toContain(label)
  if (type === 'AI_REVIEW_BUDGET_REACHED')
    expect(html).toContain('blocked by previous AI settings')
})
it('links native execution failures to saved commit assessments without inventing an assessment result', () => {
  const html = renderToStaticMarkup(
    <NotificationItem
      item={{
        ...item,
        type: 'NATIVE_EXECUTION_FAILED',
        sourceSha: 'a'.repeat(40),
      }}
      busy={false}
      onRead={() => undefined}
    />
  )
  expect(html).toContain('Check execution failed')
  expect(html).toContain('href="/repositories/$repositoryId"')
  expect(html).toContain('&quot;tab&quot;:&quot;assessments&quot;')
  expect(html).toContain('&quot;repositoryId&quot;:&quot;81818&quot;')
})
it.each([
  ['SENT', 'Email sent', 'text-success-text'],
  ['PENDING', 'Email queued', 'text-warning-text'],
  ['FAILED', 'Email failed', 'text-danger-text'],
  ['SKIPPED', 'Email skipped', 'text-foreground'],
])(
  'uses the shared semantic badge for %s email delivery',
  (state, label, color) => {
    const html = renderToStaticMarkup(
      <NotificationItem
        item={{
          ...item,
          emailDelivery: {
            state,
            attempts: 1,
            failureCode: null,
            sentAt: null,
            nextAttemptAt: '',
          },
        }}
        busy={false}
        onRead={() => undefined}
      />
    )
    expect(html).toContain(label)
    expect(html).toContain('data-slot="badge"')
    expect(html).toContain(color)
  }
)
it('uses an informational blue indicator for informational updates', () => {
  const html = renderToStaticMarkup(
    <NotificationItem
      item={{ ...item, severity: 'info' }}
      busy={false}
      onRead={() => undefined}
    />
  )
  expect(html).toContain('bg-blue-500')
  expect(html).not.toContain('bg-teal-500')
})

it('shows the event explanation, check details and next action with its assessment link', () => {
  const html = renderToStaticMarkup(
    <NotificationItem
      item={{
        ...item,
        type: 'ASSESSMENT_FAILED',
        assessmentId: 'assessment-1',
        title: 'Assessment recorded failed checks',
        message: 'Fix the failing check and rerun the workflow.',
        details: [
          '3 checks recorded · 2 required',
          'Reported failures: Tests <script>',
        ],
        actionLabel: 'Review failed checks',
      }}
      busy={false}
      onRead={() => undefined}
    />
  )
  expect(html).toContain('Fix the failing check and rerun the workflow.')
  expect(html).toContain('3 checks recorded · 2 required')
  expect(html).toContain('Review failed checks')
  expect(html).toContain('&quot;assessment&quot;:&quot;assessment-1&quot;')
  expect(html).toContain('Tests &lt;script&gt;')
})

it('links an exception notice to repository policies without requiring a publication-only policy event id', () => {
  const html = renderToStaticMarkup(
    <NotificationItem
      item={{
        id: 'exception-notice',
        type: 'POLICY_EXCEPTION_APPROVED',
        severity: 'warning',
        readAt: null,
        createdAt: new Date().toISOString(),
        repository: 'fixture/app',
        repositoryId: '51',
        sourceSha: 'a'.repeat(40),
        assessmentId: null,
        policyId: null,
      }}
      onRead={() => {}}
      busy={false}
    />
  )
  expect(html).toContain('href="/policies"')
  expect(html).toContain('Policy exception approved')
  expect(html).toContain('&quot;repository&quot;:&quot;51&quot;')
})
