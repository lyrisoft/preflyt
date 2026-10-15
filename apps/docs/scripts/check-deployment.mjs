// Verify the emitted site matches its deployed origin and contains its local assets.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const build = resolve(dirname(fileURLToPath(import.meta.url)), '../build')
const origin = process.env.DOCS_URL ?? 'https://docs.preflytlabs.com'
const base = process.env.DOCS_BASE_URL ?? '/'
const home = new URL(base, origin).href
const html = readFileSync(resolve(build, 'index.html'), 'utf8')
const canonical = [...html.matchAll(/<link\b[^>]*>/g)].find(([tag]) => /rel="canonical"/.test(tag))?.[0].match(/href="([^"]+)"/)?.[1]
assert.equal(canonical, home, 'Built documentation canonical URL must match its deployment')
let styles = 0, scripts = 0
for (const [, reference] of html.matchAll(/(?:src|href)="([^"<>]+\.(?:css|js)(?:[?#][^"<>]*)?)"/g)) {
  const asset = new URL(reference, home)
  if (asset.origin !== new URL(origin).origin) continue
  assert.ok(asset.pathname.startsWith(base), `Asset outside deployment base: ${asset.pathname}`)
  const local = resolve(build, decodeURIComponent(asset.pathname.slice(base.length)))
  assert.ok(local.startsWith(build + sep) && existsSync(local), `Missing built asset: ${asset.pathname}`)
  if (asset.pathname.endsWith('.css')) styles++
  if (asset.pathname.endsWith('.js')) scripts++
}
assert.ok(styles > 0 && scripts > 0, 'Built documentation must include its CSS and JavaScript')
console.log(`Verified documentation at ${home}: ${styles} stylesheet(s) and ${scripts} script(s).`)
