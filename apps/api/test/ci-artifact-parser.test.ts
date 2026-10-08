import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MAX_ARTIFACT_BYTES, parseArtifact } from '../src/github-events/ci-artifact-parser.js'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const parse = (format: string, content: string) => parseArtifact(format, content, hash(content))
const sarif = (run: object = { tool: { driver: { name: 'scanner' } }, results: [], invocations: [{ executionSuccessful: true }] }) => JSON.stringify({ version: '2.1.0', runs: [run] })

describe('bounded immutable report parsing', () => {
  it('counts actual nested JUnit outcomes and preserves exact original bytes', () => {
    const xml = '\uFEFF<testsuites tests="4" failures="1" errors="1" skipped="1"><testsuite tests="4"><testcase name="ok"/><testcase name="fail"><failure>secret</failure></testcase><testsuite><testcase name="error"><error/></testcase><testcase name="skip"><skipped/></testcase></testsuite></testsuite></testsuites>'
    const result = parse('junit', xml)
    expect(result.bytes.toString()).toBe(xml)
    expect(result.summary).toMatchObject({ tests: 4, passed: 1, failures: 1, errors: 1, skipped: 1, execution: 'UNKNOWN', partial: true })
    expect(JSON.stringify(result.summary)).not.toContain('secret')
  })
  it.each(['<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>',
    '<!DOCTYPE testsuite [<!ENTITY x "boom">]><testsuite>&x;</testsuite>',
    '<testsuite><testcase name="x"></testsuite>', '<report/>',
    '<testsuite tests="4"><testcase name="x"/></testsuite>',
    '<testsuite><testcase name="x"><failure/><skipped/></testcase></testsuite>',
    '<testsuite><testcase name="x" status="disabled"/></testsuite>',
    '<testsuite><testcase name="x"><unknown/></testcase></testsuite>',
    '<testsuite>not a report</testsuite>',
    '<?xml version="1.0" encoding="UTF-16"?><testsuite/>',
  ])('rejects unsafe, inconsistent or unsupported XML %#', xml => { expect(() => parse('junit', xml)).toThrow() })
  it('accepts empty reports without a positive execution claim', () => {
    expect(parse('junit', '<testsuite tests="0"/>').summary).toMatchObject({ tests: 0, execution: 'UNKNOWN' })
    expect(parse('sarif', sarif({ tool: { driver: { name: 'scanner' } } })).summary).toMatchObject({ results: 0, execution: 'UNKNOWN', partial: true })
  })
  it('validates SARIF structurally offline and exposes only counts', () => {
    const report = sarif({ tool: { driver: { name: 'secret-tool' } }, invocations: [{ executionSuccessful: false, commandLine: 'secret-command' }],
      results: [{ level: 'error', message: { text: 'secret-finding' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'file:///secret' } } }] },
        { message: { text: 'x' }, suppressions: [{ kind: 'external', status: 'accepted' }] }] })
    expect(parse('sarif', report).summary).toMatchObject({ results: 2, error: 1, unknown: 1, suppressed: 1, execution: 'REPORTED_FAILURE' })
    expect(JSON.stringify(parse('sarif', report).summary)).not.toContain('secret')
    expect(parse('sarif', sarif()).summary).toMatchObject({ execution: 'REPORTED_SUCCESS', results: 0 })
  })
  it('treats external results as incomplete without retrieving them', () => {
    const report = sarif({ tool: { driver: { name: 'scanner' } }, results: [], invocations: [{ executionSuccessful: true }],
      externalPropertyFileReferences: { results: [{ location: { uri: 'https://127.0.0.1/private' } }] } })
    expect(parse('sarif', report).summary).toMatchObject({ partial: true, execution: 'UNKNOWN' })
  })
  it.each(['{}', '{', JSON.stringify({ version: '2.0.0', runs: [] }), sarif({ tool: { driver: { name: 's' } }, results: [{ level: 'invalid', message: { text: 'x' } }] }),
    sarif({ tool: { driver: { name: 's' } }, results: [{}] })])('rejects malformed or unsupported SARIF %#', report => { expect(() => parse('sarif', report)).toThrow() })
  it('bounds original UTF-8 bytes, XML depth, JSON depth and testcase counts', () => {
    expect(() => parse('junit', '<testsuite>' + 'é'.repeat(MAX_ARTIFACT_BYTES / 2) + '</testsuite>')).toThrow()
    expect(() => parse('junit', '<testsuite>'.repeat(33) + '</testsuite>'.repeat(33))).toThrow()
    expect(() => parse('sarif', '['.repeat(34) + '0' + ']'.repeat(34))).toThrow()
    expect(() => parse('junit', '<testsuite>' + '<testcase name="x"/>'.repeat(5001) + '</testsuite>')).toThrow()
  })
  it('rejects digest mismatch and invalid UTF-8 source strings', () => {
    expect(() => parseArtifact('junit', '<testsuite/>', '0'.repeat(64))).toThrow('SHA-256')
    expect(() => parse('junit', '<testsuite>\uD800</testsuite>')).toThrow()
    expect(() => parse('other', '<testsuite/>')).toThrow()
  })
})
