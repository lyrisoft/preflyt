import { expect, it } from 'vitest'
import type { HealthReport } from './health-api'
import { healthDimensionValues } from './health-dimensions'

const report: HealthReport = {
  completeness: 'PARTIAL',
  mode: 'INSPECTION_ONLY',
  inspection: { complete: true, fileCount: 2, languages: [] },
  analyses: [],
  findings: [],
  limits: [],
}
it('keeps missing analysis and unrequested test execution distinct from zero findings', () => {
  const values = healthDimensionValues(report, null, false)
  expect(values).toEqual({
    security: 'Unavailable',
    reliability: 'Unavailable',
    maintainability: 'Unavailable',
    duplication: 'Unavailable',
    hotspots: 'Unavailable',
    coverage: 'Awaiting CI coverage',
  })
  expect(healthDimensionValues(report, null, true).coverage).toBe('Unavailable')
})
it('uses only validated category output and independently measured percentage denominators', () => {
  const measured: HealthReport = {
    ...report,
    mode: 'EXECUTED',
    analyses: [
      {
        id: 'quality.reliability',
        title: 'Reliability',
        state: 'FAIL',
        reason: 'FINDINGS_REPORTED',
        findingsRetained: 1,
      },
    ],
    findings: [
      {
        fingerprint: 'a'.repeat(64),
        category: 'reliability',
        severity: 'low',
        title: 'Located defect',
        ruleId: 'rule',
        path: 'app.js',
        line: 1,
        checkId: 'quality.reliability',
        evidence: 'ANALYZER_REPORTED',
      },
    ],
    measurements: {
      duplication: {
        version: 1,
        formula: 'unique-lines-v1',
        analyzedLines: 100,
        duplicatedLines: 20,
        analyzedFiles: 2,
        clonePairs: 1,
      },
      coverage: {
        version: 1,
        formula: 'node-covered-lines-v1',
        scope: 'node-loaded-files',
        analyzedLines: 10,
        coveredLines: 6,
        analyzedFiles: 1,
        tests: 2,
        passed: 2,
      },
    },
  }
  const values = healthDimensionValues(
    measured,
    {
      version: 1,
      formula: 'reviewed-retained-hotspots-v1',
      reviewed: 1,
      total: 2,
      complete: true,
      percentage: 50,
    },
    true
  )
  expect(values).toMatchObject({
    security: 'Unavailable',
    reliability: '1',
    maintainability: 'Unavailable',
    duplication: '20.0%',
    hotspots: 'Unavailable',
    coverage: '60.0%',
  })
})
it('does not use review metadata as a substitute for analyzer findings', () => {
  expect(
    healthDimensionValues(
      report,
      {
        version: 1,
        formula: 'reviewed-retained-hotspots-v1',
        reviewed: 0,
        total: 0,
        complete: true,
        percentage: null,
      },
      false
    ).hotspots
  ).toBe('Unavailable')
})

it('shows lower bounds for missing or truncated analyzers instead of false zero-issue health', () => {
  const partial: HealthReport = {
    ...report,
    mode: 'EXECUTED',
    analyses: [
      {
        id: 'secrets.scan',
        title: 'Secrets',
        state: 'FAIL',
        reason: 'FINDINGS_REPORTED',
        findingsRetained: 1,
        findingsReported: 30,
      },
      {
        id: 'security.sast',
        title: 'SAST',
        state: 'UNAVAILABLE',
        reason: 'REVIEW_REQUIRED',
      },
    ],
    findings: [
      {
        fingerprint: 'f'.repeat(64),
        category: 'security',
        severity: 'high',
        title: 'Reported issue',
        ruleId: 'rule',
        path: 'file.js',
        line: 1,
        checkId: 'secrets.scan',
        evidence: 'ANALYZER_REPORTED',
      },
    ],
  }
  expect(healthDimensionValues(partial, null, false).security).toBe('≥1')
  expect(
    healthDimensionValues({ ...partial, findings: [] }, null, false).security
  ).toBe('Unavailable')
})

it('keeps valid retained findings visible as a lower bound when analysis is incomplete', () => {
  const partial: HealthReport = {
    ...report, mode: 'EXECUTED',
    analyses: [{id:'quality.reliability',title:'Reliability',state:'INCOMPLETE',reason:'SOURCE_LOCATION_INVALID',findingsRetained:1,findingsReported:2}],
    findings: [{fingerprint:'a'.repeat(64),category:'reliability',severity:'high',title:'Valid retained issue',ruleId:'rule',path:'app.js',line:1,checkId:'quality.reliability',evidence:'ANALYZER_REPORTED'}],
  }
  expect(healthDimensionValues(partial,null,false).reliability).toBe('≥1')
  expect(healthDimensionValues({...partial,findings:[]},null,false).reliability).toBe('Unavailable')
})

it('counts automatically reported hotspots, including a measured zero, independently of human review', () => {
 const analyzed: HealthReport={...report,mode:'EXECUTED',analyses:[{id:'security.hotspots',title:'Security hotspots',state:'PASS',reason:'CHECKS_PASSED',findingsRetained:0,findingsReported:0}]}
 expect(healthDimensionValues(analyzed,null,false).hotspots).toBe('0')
})
