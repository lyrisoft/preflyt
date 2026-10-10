import assert from 'node:assert/strict'

const origin = new URL(process.env.WEB_ORIGIN).origin
const base = process.env.PREFLYT_SMOKE_URL ?? origin
const request = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
let response = await request('/healthz')
assert.equal(response.status, 200, 'Web health must be ready')
response = await request('/super-admin/login')
assert.equal(response.status, 200, 'Direct SPA route must load')
assert.match(response.headers.get('content-type') ?? '', /text\/html/)
response = await request('/api/health/ready')
assert.equal(response.status, 200, 'API/database health must be ready')
response = await request('/api/github/repositories/1/profile')
assert.equal(response.status, 401, 'Anonymous profile access must be blocked')
response = await request('/api/auth/session')
assert.equal((await response.json()).authenticated, false)
response = await request('/.env')
assert.equal(response.status, 404, 'Dotfiles must not be served')

if (process.env.SUPER_ADMIN_USERNAME && process.env.SUPER_ADMIN_PASSWORD) {
  const credentials = JSON.stringify({
    username: process.env.SUPER_ADMIN_USERNAME,
    password: process.env.SUPER_ADMIN_PASSWORD,
  })
  response = await request('/api/auth/super-admin/login', {
    method: 'POST',
    headers: {
      Origin: 'https://invalid.example',
      'Content-Type': 'application/json',
    },
    body: credentials,
  })
  assert.equal(response.status, 403, 'Wrong-origin login must be blocked')
  response = await request('/api/auth/super-admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: credentials,
  })
  assert.equal(response.status, 201, 'Configured Super Admin must sign in')
  const cookies = response.headers.getSetCookie()
  const cookie = cookies.map((value) => value.split(';')[0]).join('; ')
  assert(cookie, 'Sign-in must create a cookie')
  assert(
    cookies.every((value) => /HttpOnly/i.test(value)),
    'Session must be HTTP-only',
  )
  if (process.env.PREFLYT_EXPECT_SECURE_COOKIE === 'true') {
    assert(
      cookies.every((value) => /; Secure/i.test(value)),
      'Production session must be secure',
    )
  }
  try {
    response = await request('/api/auth/session', {
      headers: { Cookie: cookie },
    })
    assert.equal((await response.json()).role, 'SUPER_ADMIN')
    if (process.env.PREFLYT_SMOKE_CONFIGURATION === 'true') {
      response = await request('/api/configuration', { headers: { Cookie: cookie } })
      assert.equal(response.status, 200, 'Deployment configuration must be available')
      const configuration = await response.json()
      assert(configuration.fields.every(field => field.kind !== 'secret' || field.value === ''), 'Configuration secrets must remain masked')
      const previous = configuration.fields.find(field => field.key === 'NOTIFICATIONS_ENABLED').value
      const change = { expectedRevision: configuration.revision, values: { NOTIFICATIONS_ENABLED: 'true' }, clearSecrets: [] }
      response = await request('/api/configuration', { method: 'PATCH', headers: { Cookie: cookie, Origin: 'https://invalid.example', 'Content-Type': 'application/json' }, body: JSON.stringify(change) })
      assert.equal(response.status, 403, 'Wrong-origin configuration changes must be blocked')
      response = await request('/api/configuration', { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(change) })
      assert.equal(response.status, 200, 'Bundled queue must permit enabling notifications')
      response = await request('/api/configuration', { headers: { Cookie: cookie } })
      assert.equal(response.status, 200, 'Saved configuration must be readable')
      const changed = await response.json()
      assert.equal(changed.fields.find(field => field.key === 'NOTIFICATIONS_ENABLED').value, 'true', 'Notification setting must be saved')
      response = await request('/api/configuration', { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: changed.revision, values: { NOTIFICATIONS_ENABLED: previous }, clearSecrets: [] }) })
      assert.equal(response.status, 200, 'Smoke configuration must be restored')
    }
    response = await request('/api/github/repositories/1/profile', {
      headers: { Cookie: cookie },
    })
    assert.equal(
      response.status,
      403,
      'Unselected repository must stay inaccessible',
    )
  } finally {
    response = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin },
    })
    assert.equal(response.status, 204, 'Smoke-test session must be revoked')
  }
}
console.log(
  'Compose smoke passed: health, SPA routing, protected API, origin checks and configured authentication.',
)
