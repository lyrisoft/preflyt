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

// Optional after GitHub ingestion is configured. No credentials or signed events
// are submitted: verify the public proxy reaches Preflyt's authentication guards.
if (process.env.PREFLYT_SMOKE_GITHUB === 'true') {
  for (const [path, options] of [
    ['/api/pipeline/policy', {}],
    ['/api/pipeline/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }],
    ['/api/pipeline/publication?run=1&attempt=1', {}],
    ['/api/github/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }],
  ]) {
    response = await request(path, options)
    assert.equal(response.status, 401, `${path} must reject unsigned/anonymous requests`)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/,
      `${path} must reach the API rather than the SPA`)
    const error = await response.json()
    assert.equal(error.statusCode, 401, `${path} must return the API authentication error`)
    assert.match(error.message ?? '', /GitHub (Actions identity token|webhook signature)/,
      `${path} must reach Preflyt's GitHub authentication guard`)
  }
  console.log('GitHub endpoint smoke passed: pipeline OIDC and webhook signature guards are reachable.')
}

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
