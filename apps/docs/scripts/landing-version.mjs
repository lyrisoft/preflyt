import assert from 'node:assert/strict'

/** Compare complete badge versions: v0.1.1 is not a prefix match for v0.1.11. */
export function assertLandingVersion(html, version) {
  const expected = version === 'next' ? 'Next' : `v${version}`
  const label = `Preflyt ${version === 'next' ? 'Next (unreleased)' : expected}`
  const badges = [...html.matchAll(/https:\/\/img\.shields\.io\/badge\/Preflyt-(v\d+\.\d+\.\d+|Next)(?=-|["'?/\s]|$)/g)].map(match => match[1])
  assert(badges.length > 0 && badges.every(badge => badge === expected), `${version}: landing badge image must match selected docs`)
  assert(html.includes(`alt="${label}"`) || html.includes(`alt='${label}'`), `${version}: landing badge label must match selected docs`)
}
