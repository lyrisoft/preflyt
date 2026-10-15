import { expect, it } from 'vitest'
import type { NativeReceiptCheck } from '../src/execution/native-receipt.js'
import { healthAnalysisComplete } from '../src/health/health-analysis-completion.js'
import { healthReport } from '../src/health/health-report.js'
import { overallHealth } from '../src/health/health-overall.js'

const fileAnalysis = { version: 1, formula: 'semgrep-candidate-files-v1', scope: 'js-ts-python', candidateFiles: 32, analyzedFiles: 32, skippedFiles: 0, pathsDigest: 'a'.repeat(64) } as const
const duplication = { version: 1, kind: 'duplication', formula: 'unique-lines-v1', analyzedLines: 983, duplicatedLines: 0, analyzedFiles: 6, clonePairs: 0, minimumLines: 5, minimumTokens: 50, mode: 'weak' } as const
function check(ruleId: string, patch = {}): NativeReceiptCheck {
  return { ruleId, state: 'PASS', reason: 'CHECKS_PASSED', coverage: ruleId === 'secrets.scan' ? 'FULL_RULE' : 'PARTIAL', cleanupConfirmed: true, reportHash: 'b'.repeat(64), configHash: 'c'.repeat(64), toolVersion: 'fixture', summary: { runs: 1, results: 0 }, findings: [], fileAnalysis, ...(ruleId === 'quality.duplication' ? { measurement: duplication } : {}), ...patch } as NativeReceiptCheck
}
const ids = ['secrets.scan', 'security.sast', 'security.dependencies', 'quality.reliability', 'quality.maintainability', 'quality.duplication', 'security.hotspots']
const inspection = { complete: true, fileCount: 43, languages: ['JavaScript', 'TypeScript'] }
function report(checks = ids.map(id => check(id)), inspected = inspection) {
  return healthReport(inspected, ids.map(id => ({ id, title: id, state: 'UNAVAILABLE', reason: 'SCANNER_PENDING' })), checks)
}
it('reports seven successful scoped analyses as complete and healthy without CI coverage', () => {
  const checks = ids.map(id => check(id)), saved = report(checks)
  expect(saved.completeness).toBe('COMPLETE')
  expect(overallHealth(saved, 'COMPLETED').status).toBe('HEALTHY')
  expect(saved.measurements?.duplication?.duplicatedLines).toBe(0)
  expect(saved.measurements?.coverage).toBeUndefined()
  expect(checks.filter(c => c.ruleId !== 'secrets.scan').every(c => c.coverage === 'PARTIAL')).toBe(true)
  expect(saved.limits.join(' ')).toContain('Zero findings apply only to the recorded analysis scope')
})
it('accepts a qualified completed infrastructure analysis without promoting native rule coverage', () => {
  const value = check('iac.policy')
  expect(healthAnalysisComplete(value)).toBe(true)
  expect(value.coverage).toBe('PARTIAL')
})
it('keeps missing, failed, truncated, unmeasured and unclean execution incomplete', () => {
  for (const patch of [
    { state: 'INCOMPLETE' }, { state: 'UNAVAILABLE' }, { cleanupConfirmed: false },
    { reportHash: null }, { configHash: '' }, { toolVersion: '' },
    { summary: null }, { summary: { runs: 1 } }, { summary: { runs: 1, results: 1 } },
    { fileAnalysis: undefined }, { fileAnalysis: { ...fileAnalysis, analyzedFiles: 31, skippedFiles: 1 } },
    { fileAnalysis: { ...fileAnalysis, candidateFiles: 0, analyzedFiles: 0 } },
    { scanErrors: [{ type: 'ParseError', path: 'src/file.ts' }] },
  ]) {
    const saved = report(ids.map(id => check(id, id === 'security.sast' ? patch : {})))
    expect(saved.completeness, JSON.stringify(patch)).toBe('PARTIAL')
    expect(overallHealth(saved, 'COMPLETED').status).toBe('INCOMPLETE')
  }
  expect(report(ids.slice(1).map(id => check(id))).completeness).toBe('PARTIAL')
  expect(report(undefined, { ...inspection, complete: false }).completeness).toBe('PARTIAL')
  expect(healthAnalysisComplete(check('quality.duplication', { measurement: undefined }))).toBe(false)
  expect(healthAnalysisComplete(check('quality.duplication', { measurement: { ...duplication, analyzedLines: 0 } }))).toBe(false)
  expect(healthAnalysisComplete(check('unknown.analyzer'))).toBe(false)
})
it('does not let a category-only report or missing required CI evidence claim repository-wide health', () => {
  const saved = report()
  expect(overallHealth({ ...saved, selection: 'duplication' }, 'COMPLETED').status).toBe('INCOMPLETE')
  const policyContext = { state: 'CAPTURED', healthRules: [{ id: 'tests.coverage', required: true, maxFailedChecks: 0 }] } as any
  expect(overallHealth({ ...saved, policyContext }, 'COMPLETED').status).toBe('INCOMPLETE')
})
it('separates completed analysis from findings and never hides a known high failure', () => {
  const finding = { fingerprint: 'f'.repeat(64), ruleId: 'fixture', severity: 'high', category: 'security', title: 'Fixture', message: 'Fixture', path: 'src/file.ts', line: 1 }
  const saved = report(ids.map(id => check(id, id === 'security.sast' ? { state: 'FAIL', reason: 'FINDINGS_REPORTED', summary: { runs: 1, results: 1 }, findings: [finding] } : {})))
  expect(saved.completeness).toBe('COMPLETE')
  expect(overallHealth(saved, 'COMPLETED').status).toBe('UNHEALTHY')
  expect(overallHealth({ ...saved, completeness: 'PARTIAL' }, 'COMPLETED').status).toBe('UNHEALTHY')
})
