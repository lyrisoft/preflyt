// Capture the actual app with synthetic documentation fixtures, never a live session.
// Build the Community app with VITE_WEBSITE_MODE=false and
// VITE_API_BASE_URL=http://localhost:3000, then serve its production build:
// pnpm --filter @preflyt/web exec vite preview --host 127.0.0.1 --port 5175
// No requests reach that API: every response is intercepted below.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const origin = 'http://127.0.0.1:5175'
const api = 'http://localhost:3000'
const session = {
  authenticated: true,
  identityId: 'docs-owner',
  organizationId: 'docs-workspace',
  role: 'OWNER',
  platformAdmin: false,
  organizationWide: true,
  permissions: ['audit.read', 'contributors.read'],
}
const organizations = {
  activeOrganizationId: 'docs-workspace',
  platformAdmin: false,
  organizations: [{ id: 'docs-workspace', name: 'Example workspace', role: 'OWNER', githubLogin: 'example-org' }],
}
const events = [
  ['GitHub sync completed', 'github.sync.completed', 'Automated system', null],
  ['Policy published', 'policy.published', 'Example owner', 'example-org/service-api'],
  ['Repository selected', 'repository.selected', 'Example admin', 'example-org/service-api'],
  ['Member role changed', 'membership.role_changed', 'Example owner', null],
]
const audit = {
  items: events.map(([actionLabel, action, actor, name], i) => ({
    id: `docs-event-${i}`, actionLabel, action,
    createdAt: `2026-10-01T${String(12-i).padStart(2, '0')}:00:00Z`,
    actor: { id: actor === 'Automated system' ? null : `docs-actor-${i}`, name: actor },
    repository: name ? { id: 'docs-repository', name } : null,
    details: [],
  })),
  total: events.length, page: 1, pageSize: 10, hasMore: false,
  repositories: [{ id: 'docs-repository', name: 'example-org/service-api' }],
  actions: events.map(([label, id]) => ({ id, label })),
}
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1728, height: 906 }, colorScheme: 'light', timezoneId: 'UTC', serviceWorkers: 'block' })
  await context.addCookies([{ name: 'vite-ui-theme', value: 'light', url: origin }])
  const unexpected = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    // Only public font assets may leave the isolated frontend.
    if (['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin)) return route.continue()
    if (url.origin !== api) return route.abort()
    const payload = url.pathname === '/auth/session' ? session
      : url.pathname === '/organizations' ? organizations
      : url.pathname === '/audit-log' ? audit
      : url.pathname === '/notifications' ? { items: [], unreadCount: 0, total: 0, page: 1, pageSize: 10, hasMore: false }
      : null
    if (!payload) { unexpected.push(url.pathname); return route.abort() }
    return route.fulfill({ json: payload, headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } })
  })
  const page = await context.newPage()
  await page.goto(`${origin}/audit-log`)
  await page.getByRole('region', { name: 'Audit events' }).waitFor()
  await page.getByText('Example admin', { exact: true }).waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    if (!document.fonts.check('14px Inter')) throw new Error('App font unavailable')
  })
  if (unexpected.length) throw new Error(`Unmocked screenshot requests: ${unexpected.join(', ')}`)
  const text = await page.locator('body').innerText()
  if (!text.includes('Example workspace') || /@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) throw new Error('Unexpected identity in capture')
  for (const [index, event] of events.entries()) {
    const actor = await page.locator('tbody tr').nth(index).getByRole('cell').nth(1).innerText()
    if (actor !== event[2]) throw new Error('Non-fixture audit actor detected')
  }
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/static/img/guides/audit-log-example.jpg', import.meta.url)), type: 'jpeg', quality: 90, animations: 'disabled' })
  console.log('Captured audit guide from synthetic fixtures; no live API/session used.')
} finally {
  await browser.close()
}
