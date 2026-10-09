import { digest } from '../assessments/assessment-digest.js'

// Fixed native adapters. Repository and model input can never supply executable/argv/env.
export const nativeAdapters = {
  'secrets.scan': {
    id: 'gitleaks-directory-v1',
    tool: 'Gitleaks',
    license: 'MIT',
    format: 'sarif',
    command: ['/usr/local/bin/gitleaks'],
    args: [
      'dir',
      '/workspace',
      '--config',
      '/opt/preflyt/config/gitleaks.toml',
      '--gitleaks-ignore-path',
      '/opt/preflyt/config/.gitleaksignore',
      '--report-format',
      'sarif',
      '--report-path',
      '/reports/report.sarif',
      '--redact=100',
      '--exit-code',
      '1',
    ],
  },
  'security.dependencies': {
    id: 'trivy-dependencies-v1',
    tool: 'Trivy',
    license: 'Apache-2.0',
    format: 'sarif',
    command: ['/usr/local/bin/trivy'],
    args: [
      'filesystem',
      '--config',
      '/opt/preflyt/config/trivy.yaml',
      '--scanners',
      'vuln',
      '--offline-scan',
      '--skip-db-update',
      '--skip-java-db-update',
      '--skip-check-update',
      '--skip-version-check',
      '--ignorefile',
      '/opt/preflyt/config/.trivyignore',
      '--format',
      'sarif',
      '--output',
      '/reports/report.sarif',
      '--exit-code',
      '1',
      '/workspace',
    ],
  },
  'security.sast': {
    id: 'semgrep-local-v1',
    tool: 'Semgrep CE',
    license: 'LGPL-2.1-only',
    format: 'sarif',
    command: ['/usr/local/bin/semgrep'],
    args: [
      'scan',
      '--config',
      '/opt/preflyt/config/semgrep.yaml',
      '--metrics',
      'off',
      '--disable-version-check',
      '--no-git-ignore',
      '--sarif',
      '--output',
      '/reports/report.sarif',
      '--error',
      '/workspace',
    ],
  },
  'iac.policy': {
    id: 'trivy-iac-v1',
    tool: 'Trivy',
    license: 'Apache-2.0',
    format: 'sarif',
    command: ['/usr/local/bin/trivy'],
    args: [
      'filesystem',
      '--config',
      '/opt/preflyt/config/trivy.yaml',
      '--scanners',
      'misconfig',
      '--misconfig-scanners',
      'terraform,kubernetes',
      '--offline-scan',
      '--skip-check-update',
      '--skip-version-check',
      '--ignorefile',
      '/opt/preflyt/config/.trivyignore',
      '--format',
      'sarif',
      '--output',
      '/reports/report.sarif',
      '--exit-code',
      '1',
      '/workspace',
    ],
  },
} as const
for (const adapter of Object.values(nativeAdapters)) {
  Object.freeze(adapter.command)
  Object.freeze(adapter.args)
  Object.freeze(adapter)
}
Object.freeze(nativeAdapters)
export type NativeRuleId = keyof typeof nativeAdapters
export type NativeToolReview = {
  ruleId: NativeRuleId
  image: string
  toolVersion: string
  license: string
  configHash: string
  reviewDigest: string
  expiresAt: string
  databaseBuiltAt: string | null
}
const exactKeys =
  'configHash,databaseBuiltAt,expiresAt,image,license,reviewDigest,ruleId,toolVersion'
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
export function nativeToolReviews(
  raw = process.env.NATIVE_TOOL_REVIEWS ?? '[]',
  now = Date.now(),
) {
  try {
    if (raw.length > 65536) return null
    const list = JSON.parse(raw) as NativeToolReview[]
    if (
      !Array.isArray(list) ||
      list.length > 16 ||
      new Set(list.map((r) => r.ruleId)).size !== list.length
    )
      return null
    for (const item of list) {
      const adapter = nativeAdapters[item.ruleId]
      if (
        !adapter ||
        Object.keys(item).sort().join(',') !== exactKeys ||
        typeof item.image !== 'string' ||
        item.image.length > 256 ||
        !/^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$/.test(
          item.image,
        ) ||
        typeof item.toolVersion !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,63}$/.test(item.toolVersion) ||
        item.license !== adapter.license ||
        !hex(item.configHash) ||
        !hex(item.reviewDigest) ||
        typeof item.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(item.expiresAt)) ||
        Date.parse(item.expiresAt) <= now ||
        Date.parse(item.expiresAt) > now + 30 * 86400000 ||
        (item.ruleId === 'security.dependencies'
          ? typeof item.databaseBuiltAt !== 'string' ||
            !item.databaseBuiltAt ||
            !Number.isFinite(Date.parse(item.databaseBuiltAt)) ||
            Date.parse(item.databaseBuiltAt) > now ||
            now - Date.parse(item.databaseBuiltAt) > 86400000
          : item.databaseBuiltAt !== null)
      )
        return null
    }
    const reviews = [...list].sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    return { reviews, reviewHash: digest(reviews) }
  } catch {
    return null
  }
}
export function buildNativePlan(
  input: {
    organizationId: string
    repositoryId: string
    sourceSha: string
    selectionId: string
    rules: Array<{
      id: string
      title: string
      required: boolean
      capability: string
    }>
  },
  reviewed = nativeToolReviews(),
) {
  if (
    !/^[1-9]\d{0,15}$/.test(input.repositoryId) ||
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !input.organizationId ||
    !input.selectionId ||
    input.rules.length > 64 ||
    new Set(input.rules.map((r) => r.id)).size !== input.rules.length
  )
    throw new Error('Invalid native plan scope')
  const steps = input.rules.map((rule) => {
    const adapter = nativeAdapters[rule.id as NativeRuleId]
    const tool = reviewed?.reviews.find((r) => r.ruleId === rule.id)
    const reason =
      rule.capability === 'available'
        ? 'PROFILE_EVIDENCE'
        : !adapter
          ? 'ADAPTER_UNAVAILABLE'
          : !tool
            ? 'TOOL_REVIEW_REQUIRED'
            : 'DISPATCHER_REQUIRED'
    return {
      ruleId: rule.id,
      adapterSupported: !!adapter,
      title: rule.title,
      required: rule.required,
      reason,
      ...(adapter && tool
        ? {
            adapterId: adapter.id,
            image: tool.image,
            toolVersion: tool.toolVersion,
            format: adapter.format,
            license: tool.license,
            configHash: tool.configHash,
            reviewDigest: tool.reviewDigest,
            reviewExpiresAt: tool.expiresAt,
            databaseBuiltAt: tool.databaseBuiltAt,
            command: [...adapter.command],
            args: [...adapter.args],
            environment: {
              HOME: '/scratch',
              TMPDIR: '/scratch',
              SEMGREP_SEND_METRICS: 'off',
              SEMGREP_ENABLE_VERSION_CHECK: '0',
            },
            limits: {
              cpu: '1',
              memory: '2Gi',
              ephemeralStorage: '2Gi',
              deadlineSeconds: 300,
            },
            reportPath: '/reports/report.sarif',
            maxReportBytes: 5 * 1024 * 1024,
          }
        : {}),
    }
  })
  const plan = {
    version: 1,
    organizationId: input.organizationId,
    repositoryId: input.repositoryId,
    sourceSha: input.sourceSha,
    selectionId: input.selectionId,
    toolReviewHash: reviewed?.reviewHash ?? null,
    executionAvailable: false,
    steps,
  }
  return { ...plan, planHash: digest(plan) }
}
