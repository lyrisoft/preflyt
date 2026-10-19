import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLandingVersion } from '../../apps/docs/scripts/landing-version.mjs'

const badge = (version, label = version === 'next' ? 'Next (unreleased)' : `v${version}`) => `<img src="https://img.shields.io/badge/Preflyt-${version === 'next' ? 'Next' : `v${version}`}-2f6f60?logo=github" alt="Preflyt ${label}" />`

test('complete versions support two- and three-digit patches without stale-prefix false positives', () => {
  for (const version of ['0.1.2', '0.1.10', '0.1.11', '0.1.100', '1.1.1', 'next']) assert.doesNotThrow(() => assertLandingVersion(badge(version), version))
})

test('a stale image, stale visible label or mixed version badges still fail', () => {
  assert.throws(() => assertLandingVersion(badge('0.1.1'), '0.1.11'), /image must match/)
  assert.throws(() => assertLandingVersion(badge('0.1.11', 'v0.1.1'), '0.1.11'), /label must match/)
  assert.throws(() => assertLandingVersion(badge('0.1.11') + badge('0.1.1'), '0.1.11'), /image must match/)
  assert.throws(() => assertLandingVersion('Preflyt v0.1.11', '0.1.11'), /image must match/)
  assert.throws(() => assertLandingVersion(badge('next'), '0.1.11'), /image must match/)
})
