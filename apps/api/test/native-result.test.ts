import { describe, expect, it } from 'vitest'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
const sarif = (run: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 'fixture' } }, results: [], ...run }],
    }),
  )
const junit = (cases: string) =>
  Buffer.from('<testsuite>' + cases + '</testsuite>')
describe('native result normalization', () => {
  it('requires a bounded, valid report and supported tool exit', () => {
    for (const report of [null, Buffer.alloc(262145), Buffer.from('invalid')])
      expect(nativeCheckOutcome('secrets.scan', 0, report).state).toBe(
        'INCOMPLETE',
      )
    expect(nativeCheckOutcome('secrets.scan', 2, sarif()).state).toBe(
      'INCOMPLETE',
    )
  })
  it('reports findings as failures rather than trusting an exit of zero', () => {
    expect(
      nativeCheckOutcome(
        'secrets.scan',
        0,
        sarif({ results: [{ message: { text: 'finding' } }] }),
      ).state,
    ).toBe('FAIL')
  })
  it('does not pass an empty failed scanner', () => {
    expect(nativeCheckOutcome('secrets.scan', 1, sarif()).state).toBe(
      'INCOMPLETE',
    )
    expect(
      nativeCheckOutcome(
        'secrets.scan',
        0,
        sarif({ invocations: [{ executionSuccessful: false }] }),
      ).state,
    ).toBe('INCOMPLETE')
  })
  it('does not pass missing scan results or scanner errors', () => {
    expect(
      nativeCheckOutcome('secrets.scan', 0, sarif({ results: undefined }))
        .state,
    ).toBe('INCOMPLETE')
    expect(
      nativeCheckOutcome(
        'secrets.scan',
        0,
        sarif({
          invocations: [
            {
              executionSuccessful: true,
              toolExecutionNotifications: [
                { level: 'error', message: { text: 'scan failed' } },
              ],
            },
          ],
        }),
      ).state,
    ).toBe('INCOMPLETE')
  })
  it('normalizes clean output without claiming provenance', () => {
    expect(nativeCheckOutcome('secrets.scan', 0, sarif()).state).toBe('PASS')
  })
  it('requires actual test execution', () => {
    expect(nativeCheckOutcome('tests.required', 0, junit('')).reason).toBe(
      'NO_TESTS_EXECUTED',
    )
    expect(
      nativeCheckOutcome(
        'tests.required',
        0,
        junit('<testcase name="skip"><skipped/></testcase>'),
      ).state,
    ).toBe('INCOMPLETE')
  })
  it('does not pass partial test execution', () => {
    expect(
      nativeCheckOutcome(
        'tests.required',
        0,
        junit(
          '<testcase name="pass"/><testcase name="skip"><skipped/></testcase>',
        ),
      ).state,
    ).toBe('INCOMPLETE')
    expect(
      nativeCheckOutcome('tests.required', 1, junit('<testcase name="pass"/>'))
        .state,
    ).toBe('INCOMPLETE')
  })
  it('accepts Node JUnit direct testcases without trusting declared counts', () => {
    expect(
      nativeCheckOutcome(
        'tests.required',
        1,
        Buffer.from(
          '<testsuites><testcase name="fail"><failure/></testcase></testsuites>',
        ),
      ).state,
    ).toBe('FAIL')
    expect(
      nativeCheckOutcome(
        'tests.required',
        0,
        Buffer.from(
          '<testsuites tests="2"><testcase name="one"/></testsuites>',
        ),
      ).state,
    ).toBe('INCOMPLETE')
  })
  it('distinguishes passing tests from failing tests', () => {
    expect(
      nativeCheckOutcome('tests.required', 0, junit('<testcase name="pass"/>'))
        .state,
    ).toBe('PASS')
    expect(
      nativeCheckOutcome(
        'tests.required',
        1,
        junit('<testcase name="fail"><failure message="seeded"/></testcase>'),
      ).state,
    ).toBe('FAIL')
  })
})
