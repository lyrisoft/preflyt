import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const stub = `
globalThis.fetch = async (url, options = {}) => {
 const path = new URL(url).pathname
 const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers })
 if (path === '/healthz' || path === '/api/health/ready') return json({})
 if (path === '/super-admin/login') return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })
 if (path === '/.env') return new Response(null, { status: 404 })
 if (path === '/api/github/repositories/1/profile') return json({}, options.headers?.Cookie ? 403 : 401)
 if (path === '/api/auth/session') return json(options.headers?.Cookie ? { authenticated: true, role: process.env.FIXTURE_ROLE, platformAdmin: process.env.FIXTURE_PLATFORM_ADMIN === 'true' } : { authenticated: false })
 if (path === '/api/auth/super-admin/login') return options.headers?.Origin === 'https://invalid.example' ? json({}, 403) : json({}, 201, { 'Set-Cookie': 'session=fixture; HttpOnly' })
 if (path === '/api/auth/logout') return new Response(null, { status: 204 })
 throw new Error('Unexpected smoke request: ' + path)
}
`
for (const [role, platformAdmin, allowed] of [
  ['SUPER_ADMIN', true, true], ['OWNER', true, true],
  ['OWNER', false, false], ['SUPER_ADMIN', false, false],
]) {
  test(`admin smoke checks deployment authority for ${role} with platformAdmin=${platformAdmin}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'preflyt-smoke-'))
    try {
      const preload = join(directory, 'fetch.mjs')
      await writeFile(preload, stub)
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, resolve('scripts/deploy/smoke.mjs')], {
        encoding: 'utf8', env: {
          WEB_ORIGIN: 'http://fixture.local', SUPER_ADMIN_USERNAME: 'admin',
          SUPER_ADMIN_PASSWORD: 'nonfunctional-local-test-password',
          FIXTURE_ROLE: role, FIXTURE_PLATFORM_ADMIN: String(platformAdmin),
        },
      })
      if (allowed) assert.equal(result.status, 0, result.stderr)
      else {
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /Configured admin must retain deployment authority/)
      }
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
}
