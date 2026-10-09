import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  nativeAdapters,
  nativeToolReviews,
  buildNativePlan,
} from '../src/execution/native-plan.js'
import { NativePlanService } from '../src/execution/native-plan.service.js'
const now = Date.parse('2026-10-09T12:00:00Z')
const review = () => ({
  ruleId: 'secrets.scan',
  image: 'ghcr.io/preflyt/gitleaks@sha256:' + 'a'.repeat(64),
  toolVersion: '8.24.2',
  license: 'MIT',
  configHash: 'b'.repeat(64),
  reviewDigest: 'c'.repeat(64),
  expiresAt: '2026-10-10T12:00:00Z',
  databaseBuiltAt: null,
})
const parse = (records: unknown) =>
  nativeToolReviews(JSON.stringify(records), now)
const input = () => ({
  organizationId: 'org-a',
  repositoryId: '51',
  sourceSha: 'd'.repeat(40),
  selectionId: 'selection-a',
  rules: [
    {
      id: 'secrets.scan',
      title: 'Secret scanning',
      required: true,
      capability: 'planned',
    },
    {
      id: 'tests.required',
      title: 'Tests',
      required: true,
      capability: 'import_only',
    },
    {
      id: 'ci.configured',
      title: 'CI configuration',
      required: true,
      capability: 'available',
    },
  ],
})
afterEach(() => vi.unstubAllEnvs())
describe('native tool admission', () => {
  it('accepts bounded reviewed digest-pinned images', () =>
    expect(parse([review()])?.reviews).toHaveLength(1))
  it.each([
    { image: 'ghcr.io/preflyt/gitleaks:latest' },
    { image: 'evil;curl bad' },
    { expiresAt: '2026-10-08T00:00:00Z' },
    { expiresAt: '2027-10-08T00:00:00Z' },
    { license: 'commercial' },
    { ruleId: 'tests.required' },
    { configHash: 'missing' },
    { reviewDigest: '' },
    { toolVersion: ';evil' },
    { command: ['/bin/sh'] },
    { environment: { GITHUB_TOKEN: 'secret' } },
    { databaseBuiltAt: '2026-10-09T00:00:00Z' },
  ])('rejects unsafe tool configuration %j', (patch) =>
    expect(parse([{ ...review(), ...patch }])).toBeNull(),
  )
  it('rejects duplicates, excessive and malformed reviews', () => {
    expect(parse([review(), review()])).toBeNull()
    expect(parse(Array.from({ length: 17 }, review))).toBeNull()
    expect(nativeToolReviews('bad')).toBeNull()
    expect(parse([null])).toBeNull()
    expect(parse({})).toBeNull()
  })
  it('requires a recent offline vulnerability database for dependency scans', () => {
    const deps = {
      ...review(),
      ruleId: 'security.dependencies',
      license: 'Apache-2.0',
    }
    expect(parse([deps])).toBeNull()
    expect(
      parse([{ ...deps, databaseBuiltAt: '2026-10-07T00:00:00Z' }]),
    ).toBeNull()
    expect(
      parse([{ ...deps, databaseBuiltAt: '2026-10-09T13:00:00Z' }]),
    ).toBeNull()
    expect(
      parse([{ ...deps, databaseBuiltAt: '2026-10-09T00:00:00Z' }])?.reviews,
    ).toHaveLength(1)
  })
})
describe('revision-bound plans', () => {
  it('leaves missing evidence and unsupported adapters blocked', () => {
    const plan = buildNativePlan(input(), null)
    expect(plan.executionAvailable).toBe(false)
    expect(plan.steps.map((s) => s.reason)).toEqual([
      'TOOL_REVIEW_REQUIRED',
      'ADAPTER_UNAVAILABLE',
      'PROFILE_EVIDENCE',
    ])
    expect(plan.steps[0]).not.toHaveProperty('command')
    expect(JSON.stringify(plan)).not.toContain('PASS')
  })
  it('pins reviewed image, fixed commands, limits and hashes without granting execution', () => {
    const plan = buildNativePlan(input(), parse([review()]))
    expect(plan.steps[0].args).toContain('--redact=100')
    expect(plan.steps[0].command).toEqual(['/usr/local/bin/gitleaks'])
    expect(plan.steps[0].limits?.deadlineSeconds).toBe(300)
    expect(plan.steps[0].reason).toBe('DISPATCHER_REQUIRED')
    expect(plan.executionAvailable).toBe(false)
    expect(plan.planHash).toBe(
      buildNativePlan(input(), parse([review()])).planHash,
    )
    for (const patch of [
      { sourceSha: 'e'.repeat(40) },
      { organizationId: 'org-b' },
      { selectionId: 'selection-b' },
      { repositoryId: '52' },
    ])
      expect(
        buildNativePlan({ ...input(), ...patch }, parse([review()])).planHash,
      ).not.toBe(plan.planHash)
    expect(
      buildNativePlan(
        input(),
        parse([
          {
            ...review(),
            image: review().image.replace('a'.repeat(64), 'f'.repeat(64)),
          },
        ]),
      ).planHash,
    ).not.toBe(plan.planHash)
  })
  it('never enables remote scanner config, metadata egress, login or shell', () => {
    for (const adapter of Object.values(nativeAdapters)) {
      expect(adapter.command).toHaveLength(1)
      expect(adapter.command[0]).not.toMatch(/sh$/)
      expect(adapter.args.join(' ')).not.toMatch(/https?:|p\/ci|login|--pro/)
      expect(Object.isFrozen(adapter.args)).toBe(true)
    }
    expect(nativeAdapters['security.dependencies'].args).toContain(
      '--offline-scan',
    )
    expect(nativeAdapters['security.sast'].args).toContain('off')
  })
  it.each([
    { sourceSha: 'main' },
    { sourceSha: 'a'.repeat(64) },
    { repositoryId: '../51' },
    { organizationId: '' },
    { selectionId: '' },
  ])('rejects ambiguous source or scope %j', (patch) =>
    expect(() => buildNativePlan({ ...input(), ...patch }, null)).toThrow(),
  )
})
describe('plan access', () => {
  const session = { identityId: 'reader', organizationId: 'org-a' } as any
  const mocks = () => {
    const access = {
      requireRepository: vi.fn().mockResolvedValue({ id: 'internal-51' }),
    }
    const prisma = {
      repositoryProfile: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            sourceSha: 'd'.repeat(40),
            branch: 'main',
            createdAt: new Date(now),
          }),
      },
      repositoryStandardsSelection: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: 'selection-a',
            profile: 'DEFAULT',
            revision: 1,
            packs: [{ id: 'baseline-engineering', version: '1.0.0' }],
          }),
      },
    }
    return {
      access,
      prisma,
      service: new NativePlanService(access as any, prisma as any),
    }
  }
  it('requires live repository access before fetching stored data', async () => {
    const { access, prisma, service } = mocks()
    access.requireRepository.mockRejectedValue(new Error('Access denied'))
    await expect(service.get(session, '51')).rejects.toThrow('Access denied')
    expect(prisma.repositoryProfile.findFirst).not.toHaveBeenCalled()
  })
  it('uses internal IDs for stored records, and rechecks access before returning', async () => {
    const { access, prisma, service } = mocks()
    const result = await service.get(session, '51')
    expect(
      prisma.repositoryProfile.findFirst.mock.calls[0][0].where.repositoryId,
    ).toBe('internal-51')
    expect(result.repositoryId).toBe('51')
    expect(result.sourceSha).toBe('d'.repeat(40))
    expect(result.executionAvailable).toBe(false)
    expect(access.requireRepository).toHaveBeenCalledTimes(2)
  })
  it('does not return a plan after access is revoked', async () => {
    const { access, service } = mocks()
    access.requireRepository
      .mockResolvedValueOnce({ id: 'internal-51' })
      .mockRejectedValueOnce(new Error('Access revoked'))
    await expect(service.get(session, '51')).rejects.toThrow('Access revoked')
  })
  it('gives a useful error when source or saved standards are absent', async () => {
    const { prisma, service } = mocks()
    prisma.repositoryProfile.findFirst.mockResolvedValue(null as any)
    await expect(service.get(session, '51')).rejects.toThrow(
      'Inspect this repository',
    )
  })
})
