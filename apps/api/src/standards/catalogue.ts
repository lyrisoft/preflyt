import { digest as contentDigest } from '../assessments/assessment-digest.js'
import { createHash } from 'node:crypto'
import type { ProfileSignal } from '../github/repository-profile.js'
export type AdoptionProfile = 'DEFAULT' | 'RECOMMENDED' | 'STRICT'
export const adoptionProfiles = ['DEFAULT', 'RECOMMENDED', 'STRICT'] as const
export type Rule = {
  id: string
  version: string
  title: string
  risk: string
  signal: string | null
  check: string
  capability: 'available' | 'import_only' | 'planned'
  requiredIn: AdoptionProfile[]
  severity: 'critical' | 'high' | 'medium'
  operator: string
  onMissing: 'INCOMPLETE'
  allowedSources: string[]
  maxAgeHours: number
  applicability: string
  thresholds: { maxFailedChecks: number; minimumExecutedTests?: number }
  exceptionEligible: boolean
  defaultEnforcement: 'observe'
  guidance: string
  rationale: string
}
function rule(
  id: string,
  title: string,
  signal: string | null,
  capability: Rule['capability'],
  core = false,
): Rule {
  return {
    id,
    version: '1.0.0',
    title,
    signal,
    check: id,
    capability,
    requiredIn: core
      ? ['DEFAULT', 'RECOMMENDED', 'STRICT']
      : ['RECOMMENDED', 'STRICT'],
    severity: id.startsWith('secrets') ? 'critical' : 'high',
    risk: 'Missing or unverified engineering evidence can allow defects to reach later lifecycle stages.',
    operator:
      capability === 'available'
        ? 'configuration_hint_present'
        : 'verified_check_succeeded',
    onMissing: 'INCOMPLETE',
    allowedSources:
      capability === 'available'
        ? ['pinned_repository_profile']
        : ['verified_imported_ci', 'approved_sandbox'],
    maxAgeHours: 24,
    applicability:
      'Selected repository; repository, pull-request and CI stages.',
    thresholds: {
      maxFailedChecks: 0,
      ...(id === 'tests.required' ? { minimumExecutedTests: 1 } : {}),
    },
    exceptionEligible: true,
    defaultEnforcement: 'observe',
    guidance:
      'Configure the named control and collect revision-bound, trusted evidence. Configuration alone does not establish compliance.',
    rationale: '/docs/product/engineering-standards-library.md',
  }
}
const tests = rule(
  'tests.required',
  'Required test execution',
  'tests',
  'import_only',
  true,
)
const types = rule('types.required', 'Type checking', null, 'planned')
const lint = rule('lint.required', 'Lint validation', null, 'planned')
const build = rule('build.required', 'Build validation', null, 'planned')
const secrets = rule(
  'secrets.scan',
  'Secret scanning',
  'gitleaks',
  'planned',
  true,
)
const packs = [
  {
    id: 'baseline-engineering',
    title: 'Baseline Engineering',
    description: 'Core CI, tests, dependency hygiene and secret controls.',
    repositoryTypes: ['all'],
    rules: [
      rule('ci.configured', 'CI configuration', 'ci', 'available', true),
      tests,
      secrets,
      rule(
        'dependencies.locked',
        'Dependency lockfiles',
        'lockfiles',
        'available',
      ),
    ],
  },
  {
    id: 'application-security',
    title: 'Application Security',
    description: 'SAST, dependency vulnerability and secret evidence.',
    repositoryTypes: ['all'],
    rules: [
      secrets,
      rule(
        'security.sast',
        'Static application security',
        'semgrep',
        'import_only',
      ),
      rule(
        'security.dependencies',
        'Dependency vulnerability scan',
        'trivy',
        'planned',
      ),
    ],
  },
  {
    id: 'backend-service',
    title: 'Backend Services',
    description: 'Backend build, tests, types and service resilience evidence.',
    repositoryTypes: ['backend'],
    rules: [
      tests,
      types,
      lint,
      build,
      {
        ...rule(
          'service.resilience',
          'Timeout and retry controls',
          null,
          'planned',
        ),
        requiredIn: ['STRICT'] as AdoptionProfile[],
      },
    ],
  },
  {
    id: 'frontend-application',
    title: 'Frontend Applications',
    description:
      'Frontend build, component tests, types and dependency controls.',
    repositoryTypes: ['frontend'],
    rules: [
      tests,
      types,
      lint,
      build,
      rule(
        'frontend.components',
        'Component test coverage',
        'tests',
        'planned',
      ),
    ],
  },
  {
    id: 'infrastructure-as-code',
    title: 'Infrastructure as Code',
    description: 'IaC policy, container and infrastructure exposure evidence.',
    repositoryTypes: ['infrastructure'],
    rules: [
      rule('iac.policy', 'Infrastructure policy checks', 'checkov', 'planned'),
      rule(
        'containers.scan',
        'Container vulnerability scan',
        'trivy',
        'planned',
      ),
      rule(
        'iac.exposures',
        'Unsafe infrastructure exposures',
        'iac',
        'planned',
      ),
    ],
  },
].map((pack) => ({
  schemaVersion: 1,
  version: '1.0.0',
  owner: 'Lyrisoft Technologies',
  languages: ['*'],
  stages: ['repository', 'pull_request', 'ci'],
  changelog: ['Initial catalogue; no policy enforcement.'],
  ...pack,
}))
// Publish immutable definitions. New versions must be added, never edited in place after release.
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
export const catalogue = freeze(
  packs.map((pack) => ({
    ...pack,
    digest: createHash('sha256').update(JSON.stringify(pack)).digest('hex'),
  })),
)
export type StandardPack = (typeof catalogue)[number]
export type PackRef = { id: string; version: string; definition?: StandardPack }
export function packDigest(pack: Omit<StandardPack, 'digest'>) {
  return contentDigest(pack)
}
// Embedded organization versions come only from a server-frozen selection.
// Revalidate the complete definition against supported check contracts before use.
export function organizationPack(value: unknown): StandardPack | undefined {
  if (!value || typeof value !== 'object') return
  const pack = value as StandardPack
  const { digest, ...definition } = pack
  if (
    !/^org-standard-[a-f0-9-]{36}$/.test(pack.id) ||
    !/^1\.0\.[1-9]\d{0,5}$/.test(pack.version) ||
    typeof pack.title !== 'string' ||
    !pack.title.trim() ||
    pack.title.length > 120 ||
    typeof pack.description !== 'string' ||
    pack.description.length > 2000 ||
    !Array.isArray(pack.rules) ||
    !pack.rules.length ||
    pack.rules.length > 64 ||
    new Set(pack.rules.map((r) => r.id)).size !== pack.rules.length ||
    pack.schemaVersion !== 1 ||
    pack.owner !== 'Organization' ||
    JSON.stringify(pack.stages) !==
      JSON.stringify(['repository', 'pull_request', 'ci']) ||
    JSON.stringify(pack.languages) !== JSON.stringify(['*']) ||
    JSON.stringify(pack.repositoryTypes) !== JSON.stringify(['all']) ||
    !Array.isArray(pack.changelog) ||
    pack.changelog.length !== 1 ||
    pack.changelog[0] !== 'Organization-managed version.' ||
    Object.keys(pack).sort().join(',') !==
      'changelog,description,digest,id,languages,owner,repositoryTypes,rules,schemaVersion,stages,title,version' ||
    digest !== packDigest(definition) ||
    pack.rules.some(
      (r) =>
        !catalogue.some((p) =>
          p.rules.some((known) => contentDigest(known) === contentDigest(r)),
        ),
    )
  )
    return
  return pack
}
export function resolvePacks(refs: PackRef[]) {
  return refs.map(
    (ref) =>
      catalogue.find(
        (pack) => pack.id === ref.id && pack.version === ref.version,
      ) ??
      (ref.definition &&
      ref.definition.id === ref.id &&
      ref.definition.version === ref.version
        ? organizationPack(ref.definition)
        : undefined),
  )
}
export function recommend(signals: ProfileSignal[]) {
  const detected = new Map(
    signals.filter((s) => s.state === 'detected').map((s) => [s.id, s]),
  )
  const frameworks = detected.get('frameworks')?.observations ?? []
  const backend = frameworks.filter((s) =>
    ['NestJS', 'Express', 'Fastify'].includes(s),
  )
  const frontend = frameworks.filter((s) =>
    ['React', 'Next.js', 'Vue', 'Nuxt', 'Angular', 'Svelte'].includes(s),
  )
  const refs = [
    {
      id: 'baseline-engineering',
      reason: 'Core engineering controls apply to every selected repository.',
      signalIds: [] as string[],
    },
    {
      id: 'application-security',
      reason: 'Security evidence is relevant to every selected repository.',
      signalIds: [] as string[],
    },
  ]
  if (backend.length)
    refs.push({
      id: 'backend-service',
      reason: `Detected backend framework: ${backend.join(', ')}.`,
      signalIds: ['frameworks'],
    })
  if (frontend.length)
    refs.push({
      id: 'frontend-application',
      reason: `Detected frontend framework: ${frontend.join(', ')}.`,
      signalIds: ['frameworks'],
    })
  if (detected.has('iac') || detected.has('containers'))
    refs.push({
      id: 'infrastructure-as-code',
      reason: 'Infrastructure or container configuration was detected.',
      signalIds: ['iac', 'containers'].filter((id) => detected.has(id)),
    })
  return refs.map((ref) => ({
    ...ref,
    version: '1.0.0',
    evidence: ref.signalIds.flatMap((id) => detected.get(id)?.evidence ?? []),
  }))
}
export function posture(
  refs: PackRef[],
  profile: AdoptionProfile,
  signals: ProfileSignal[],
) {
  const rules = new Map<string, Rule & { packIds: string[] }>()
  for (const pack of resolvePacks(refs)) {
    if (!pack) throw new Error('Unknown frozen pack version')
    for (const rule of pack.rules) {
      const existing = rules.get(rule.id)
      if (existing) {
        if (
          JSON.stringify({ ...existing, packIds: undefined }) !==
          JSON.stringify(rule)
        )
          throw new Error('Conflicting frozen rule definitions')
        existing.packIds.push(pack.id)
        continue
      }
      rules.set(rule.id, { ...rule, packIds: [pack.id] })
    }
  }
  return [...rules.values()].map((rule) => {
    const signal = signals.find((s) => s.id === rule.signal)
    return {
      ...rule,
      required: rule.requiredIn.includes(profile),
      assessmentResult: null,
      configuration:
        !signal || signal.state === 'unknown'
          ? 'UNKNOWN'
          : signal.state === 'detected'
            ? 'HINT_DETECTED'
            : 'MISSING',
      evidence: signal?.evidence ?? [],
      reason:
        signal?.state === 'detected'
          ? 'Configuration hint only; execution and compliance are not evaluated.'
          : 'Required evidence has not been mapped or evaluated.',
    }
  })
}
