import { expect, it } from 'vitest'
import { validateHealthFindingLocations } from '../src/health/health-finding-locations.js'
import type { NativeSourceBundle } from '../src/execution/native-source.js'
import type { ReportFinding } from '../src/findings/normalize-report-findings.js'
const source = { files: [
  { path: 'a.py', content: Buffer.from('first\r\nsecond\n').toString('base64') },
  { path: 'empty.py', content: '' },
  { path: 'binary.py', content: Buffer.from([255]).toString('base64') },
] } as NativeSourceBundle
const finding = { fingerprint: 'a'.repeat(64), category: 'reliability', severity: 'high',
  title: 'Issue', ruleId: 'rule', path: 'a.py', line: 1, endLine: 2, suppressed: false } as ReportFinding
it('preserves actual ranges and metadata-only issues without inventing lines', () => {
  const rows = [finding, { ...finding, path: null, line: null, endLine: null },
    { ...finding, path: 'binary.py', line: null, endLine: null }]
  expect(validateHealthFindingLocations(rows, source)).toEqual({ findings: rows, rejected: 0 })
  expect(validateHealthFindingLocations(undefined, source)).toEqual({ findings: undefined, rejected: 0 })
})
it('quarantines absent files, invalid bounds, empty or non-text source, and invalid matching blocks', () => {
  const bad = [
    { ...finding, path: 'missing.py' }, { ...finding, line: 3, endLine: 3 },
    { ...finding, endLine: 3 }, { ...finding, line: 0 },
    { ...finding, path: null }, { ...finding, line: null },
    { ...finding, path: 'empty.py' }, { ...finding, path: 'binary.py' },
    { ...finding, relatedLocations: [{ path: 'missing.py', line: 1, endLine: 2 }] },
  ]
  expect(validateHealthFindingLocations([finding, ...bad], source)).toEqual({ findings: [finding], rejected: bad.length })
})
