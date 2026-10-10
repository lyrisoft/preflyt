import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { normalizeReportFindings } from '../src/findings/normalize-report-findings.js'
const parse = (format: string, text: string) => normalizeReportFindings(format, Buffer.from(text), createHash('sha256').update(text).digest('hex'))
const sarif = (results: object[]) => JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'scanner' } }, results }] })
it('retains exact file evidence and stable finding identities without claiming independent verification', () => {
  const text = sarif([{ ruleId: 'injection', level: 'error', message: { text: 'Unsafe query' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.ts' }, region: { startLine: 4 } } }] }])
  expect(parse('sarif', text)[0]).toMatchObject({ severity: 'high', path: 'src/db.ts', line: 4, title: 'Unsafe query', suppressed: false })
  expect(parse('sarif', text)[0].fingerprint).toBe(parse('sarif', text)[0].fingerprint)
})
it('redacts credential messages and rejects encoded traversal paths', () => {
  const rows = parse('sarif', sarif([{ message: { text: 'api_key=very-private' }, locations: [{ physicalLocation: { artifactLocation: { uri: '%2e%2e/private' } } }] }]))
  expect(rows[0]).toMatchObject({ path: null, title: 'Sensitive report details omitted' })
})
it('projects failed nested tests without exposing failure logs or passing tests', () => {
  expect(parse('junit', '<testsuites><testsuite><testcase name="passing"/><testsuite><testcase name="failing" file="src/test.ts"><failure>private-token</failure></testcase></testsuite></testsuite></testsuites>')).toEqual([expect.objectContaining({ title: 'failing', path: 'src/test.ts', category: 'tests' })])
})
it('rejects altered reports and XML entities before projection', () => {
  expect(() => normalizeReportFindings('sarif', Buffer.from(sarif([])), '0'.repeat(64))).toThrow()
  expect(() => parse('junit', '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>')).toThrow()
})
