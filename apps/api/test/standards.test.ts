import { describe, expect, it } from 'vitest'
import {
  legacyCatalogue as catalogue,
  catalogue as currentCatalogue,
  posture,
  recommend,
  resolvePacks,
  ruleRequirementsDigest,
} from '../src/standards/catalogue.js'
import type { ProfileSignal } from '../src/github/repository-profile.js'
const signal = (
  id: string,
  observations: string[] = [],
  state: ProfileSignal['state'] = 'detected',
): ProfileSignal => ({
  id,
  label: id,
  state,
  observations,
  evidence: [
    { path: 'package.json', blobSha: 'a'.repeat(40), reason: 'configuration' },
  ],
})
describe('versioned engineering catalogue and posture', () => {
  it('ships five frozen packs with version/digest, rule metadata and no enforcement', () => {
    expect(catalogue).toHaveLength(5)
    for (const pack of catalogue) {
      expect(Object.isFrozen(pack)).toBe(true)
      expect(pack.version).toBe('1.0.0')
      expect(pack.digest).toMatch(/^[a-f0-9]{64}$/)
      for (const rule of pack.rules)
        expect(rule).toMatchObject({
          onMissing: 'INCOMPLETE',
          defaultEnforcement: 'observe',
          version: '1.0.0',
        })
    }
  })
  it('pins published 1.0.0 definitions so changes require a new version', () => {
    expect(Object.fromEntries(catalogue.map((p) => [p.id, p.digest]))).toEqual({
      'baseline-engineering':
        '05ab6d497bcbfa5f40db8e1f20f4f0ea5766cc569227af4fe3e363237144873d',
      'application-security':
        '62b8c1f2781956827b6e221a196e3014463437fcecffbdf5a0d51dacd63c8577',
      'backend-service':
        'ecdc56b003605a499ece700fe81af21561c3ae9e8382f49d679ac30a925f7424',
      'frontend-application':
        'fca3e1c0bb0cefb77e08c51254acc3049d9c5860395f73e4f42438154a5fb895',
      'infrastructure-as-code':
        '7418720a4e3acaa1ca9416dccd3945cfda03d35da7527260526be2d0608fd0d8',
    })
  })
  it('recommends backend, frontend and infrastructure only from detected signals with reasons', () => {
    const backend = recommend([signal('frameworks', ['NestJS'])])
    expect(backend.map((p) => p.id)).toEqual([
      'baseline-engineering',
      'application-security',
      'backend-service',
    ])
    expect(backend[2]).toMatchObject({
      reason: 'Detected backend framework: NestJS.',
      evidence: [{ path: 'package.json' }],
    })
    expect(
      recommend([signal('frameworks', ['React']), signal('iac')]).map(
        (p) => p.id,
      ),
    ).toEqual([
      'baseline-engineering',
      'application-security',
      'frontend-application',
      'infrastructure-as-code',
    ])
    expect(
      recommend([signal('frameworks', ['NestJS'], 'unknown')]),
    ).toHaveLength(2)
  })
  it('never treats discovered configuration as compliance and keeps missing/unknown unsupported controls visible', () => {
    const controls = posture(
      [{ id: 'baseline-engineering', version: '1.0.0' }],
      'DEFAULT',
      [signal('tests'), signal('ci', [], 'not_detected')],
    )
    expect(controls.find((r) => r.id === 'ci.configured')).toMatchObject({
      configuration: 'MISSING',
      required: true,
      assessmentResult: null,
    })
    expect(controls.find((r) => r.id === 'tests.required')).toMatchObject({
      configuration: 'HINT_DETECTED',
      capability: 'import_only',
      assessmentResult: null,
    })
    expect(controls.find((r) => r.id === 'secrets.scan')).toMatchObject({
      configuration: 'UNKNOWN',
      capability: 'planned',
      assessmentResult: null,
    })
  })
  it('combines duplicate stable rules and exposes transparent adoption-profile differences', () => {
    const refs = [
      { id: 'baseline-engineering', version: '1.0.0' },
      { id: 'backend-service', version: '1.0.0' },
    ]
    const basic = posture(refs, 'DEFAULT', [])
    const strict = posture(refs, 'STRICT', [])
    expect(basic.filter((r) => r.id === 'tests.required')).toHaveLength(1)
    expect(basic.find((r) => r.id === 'tests.required')?.packIds).toHaveLength(
      2,
    )
    expect(strict.filter((r) => r.required).length).toBeGreaterThan(
      basic.filter((r) => r.required).length,
    )
    expect(() =>
      posture([{ id: 'unknown', version: '1' }], 'DEFAULT', []),
    ).toThrow()
  })
})

it('publishes implemented report checks as new immutable versions while retaining old policies', () => {
  expect(currentCatalogue).toHaveLength(5)
  for (const pack of currentCatalogue) {
    expect(pack.version).toBe('1.1.1')
    expect(pack.rules.some((rule) => rule.capability === 'planned')).toBe(false)
    expect(Object.isFrozen(pack)).toBe(true)
    const old = resolvePacks([{ id: pack.id, version: '1.0.0' }])[0]!
    expect(old.digest).toBe(
      catalogue.find((item) => item.id === pack.id)!.digest,
    )
    expect(old.digest).not.toBe(pack.digest)
  }
})


it('separates checks without setup detectors from missing or inconclusive configuration', () => {
  const controls = posture(
    [{ id: 'baseline-engineering', version: '1.1.0' }, { id: 'backend-service', version: '1.1.0' }],
    'RECOMMENDED',
    [signal('ci'), signal('tests', [], 'not_detected')],
  )
  for (const id of ['types.required', 'build.required']) {
    expect(controls.find((control) => control.id === id)).toMatchObject({
      configuration: 'NOT_INSPECTED',
      assessmentResult: null,
      required: true,
      evidence: [],
      reason: expect.stringContaining('no setup detector'),
    })
  }
  expect(controls.find((control) => control.id === 'tests.required')?.configuration).toBe('MISSING')
  expect(controls.find((control) => control.id === 'dependencies.locked')?.configuration).toBe('UNKNOWN')
  expect(controls.find((control) => control.id === 'ci.configured')?.configuration).toBe('HINT_DETECTED')
})


it('preserves every published 1.1.0 definition when publishing editorial fixes', () => {
  expect(Object.fromEntries(currentCatalogue.map(pack => [pack.id, resolvePacks([{ id: pack.id, version: '1.1.0' }])[0]!.digest]))).toEqual({
  "baseline-engineering": "704ab0012f26d7daaf5d6e0f0c2224f6d1435fb4201f3bd5aa04fc2acecdedcd",
  "application-security": "aa08d04661ea916ca09e729bc1f2d6cf280d95eb6b34893176b0ee6497f4ce34",
  "backend-service": "971532c7e0b2bafb9491d2f3d2c59aaa963b969379d0e6a8f02e3515ff294989",
  "frontend-application": "68c6fadf2251fc882e8dd1199560906d96e2fc203bd59358fbab94fc5c6d6ba1",
  "infrastructure-as-code": "612c7f2a8e2165cdab85670493305e54cfc8bc1d4d1ffe6099180298568fd43c"
})
})

it('gives every distinct built-in check specific evidence guidance without changing evaluation requirements', () => {
  const descriptions = new Map<string, string>()
  const expected: Record<string, string> = {
    'ci.configured': 'CI workflow configuration',
    'tests.required': 'At least one test must execute',
    'secrets.scan': 'credentials, tokens and private keys',
    'dependencies.locked': 'dependency lockfiles',
    'security.sast': 'static-analysis rules',
    'security.dependencies': 'vulnerability database',
    'types.required': 'compiler or type checker',
    'lint.required': 'configured linter',
    'build.required': 'build or compilation command',
    'service.resilience': 'timeout limits, bounded retries',
    'frontend.components': 'component-level UI tests',
    'iac.policy': 'infrastructure-as-code files',
    'containers.scan': 'CONTAINER_IMAGE',
    'iac.exposures': 'unsafe network exposure',
  }
  for (const pack of currentCatalogue) {
    const previous = resolvePacks([{ id: pack.id, version: '1.1.0' }])[0]!
    for (const rule of pack.rules) {
      expect(rule.guidance.toLowerCase()).toContain(expected[rule.id].toLowerCase())
      expect(rule.guidance).not.toMatch(/named control|revision-bound, trusted evidence/)
      if (descriptions.has(rule.id)) expect(descriptions.get(rule.id)).toBe(rule.guidance)
      descriptions.set(rule.id, rule.guidance)
      const old = previous.rules.find(item => item.id === rule.id)!
      expect(ruleRequirementsDigest(rule)).toBe(ruleRequirementsDigest(old))
    }
  }
  expect(descriptions.size).toBe(14)
  expect(new Set(descriptions.values()).size).toBe(14)
  const components = currentCatalogue.flatMap(pack => pack.rules).find(rule => rule.id === 'frontend.components')!
  expect(components.title).toBe('Component test execution')
  expect(components.guidance).toContain('not a line or branch coverage percentage')
})
