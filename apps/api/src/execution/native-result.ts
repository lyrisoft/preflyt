import {HEALTH_REPORT_BYTES} from '../health/health-report-limits.js'
import { createHash } from 'node:crypto'
import {
  parseArtifact,
  MAX_ARTIFACT_BYTES,
} from '../github-events/ci-artifact-parser.js'
import { nativeAdapters, type NativeRuleId } from './native-plan.js'

export type NativeCheckOutcome = {
  ruleId: NativeRuleId
  state: 'PASS' | 'FAIL' | 'INCOMPLETE'
  reason: string
  reportHash: string | null
  summary: Record<string, unknown> | null
}
/** This normalizes an executed tool's output; it does not establish runtime or source provenance. */
export function nativeCheckOutcome(
  ruleId: NativeRuleId,
  exitCode: number | null,
  report: Buffer | null,
  profile: 'ci' | 'health' = 'ci',
): NativeCheckOutcome {
  const result: NativeCheckOutcome = {
    ruleId,
    state: 'INCOMPLETE',
    reason: 'REPORT_UNAVAILABLE',
    reportHash: null,
    summary: null,
  }
  if (!report || report.length > (profile === 'health' ? HEALTH_REPORT_BYTES : MAX_ARTIFACT_BYTES) || !report.length)
    return result
  const adapter = nativeAdapters[ruleId]
  if (!adapter) return result
  result.reportHash = createHash('sha256').update(report).digest('hex')
  try {
    const parsed = parseArtifact(
      adapter.format,
      report.toString('utf8'),
      result.reportHash,
      profile,
    )
    result.summary = parsed.summary
    if (![0, 1].includes(exitCode ?? -1))
      return { ...result, reason: 'TOOL_EXECUTION_FAILED' }
    const summary = parsed.summary as Record<string, unknown>
    if (adapter.format === 'junit') {
      const executed =
        Number(summary.passed) +
        Number(summary.failures) +
        Number(summary.errors)
      if (!executed) return { ...result, reason: 'NO_TESTS_EXECUTED' }
      if (Number(summary.failures) + Number(summary.errors) > 0)
        return { ...result, state: 'FAIL', reason: 'CHECK_FAILED' }
      if (Number(summary.skipped) > 0 || exitCode !== 0)
        return { ...result, reason: 'TEST_COVERAGE_INCOMPLETE' }
    } else {
      // SARIF invocation claims alone cannot establish success. A trusted execution receipt
      // must independently attest the fixed command, exit status and complete source coverage.
      if (Number(summary.results) > 0)
        return { ...result, state: 'FAIL', reason: 'FINDINGS_REPORTED' }
      if (
        !Number(summary.runs) ||
        Number(summary.suppressed) > 0 ||
        exitCode !== 0
      )
        return { ...result, reason: 'SCAN_COVERAGE_INCOMPLETE' }
      const runs = JSON.parse(report.toString('utf8')).runs as Array<
        Record<string, unknown>
      >
      if (
        runs.some(
          (run) =>
            !Array.isArray(run.results) ||
            run.externalPropertyFileReferences ||
            (Array.isArray(run.invocations) &&
              run.invocations.some(
                (invocation) =>
                  invocation.executionSuccessful === false ||
                  invocation.toolExecutionNotifications?.some(
                    (note: { level?: string }) => note.level === 'error',
                  ),
              )),
        )
      )
        return { ...result, reason: 'SCAN_COVERAGE_INCOMPLETE' }
    }
    return { ...result, state: 'PASS', reason: 'CHECKS_PASSED' }
  } catch {
    return { ...result, reason: 'REPORT_INVALID' }
  }
}
