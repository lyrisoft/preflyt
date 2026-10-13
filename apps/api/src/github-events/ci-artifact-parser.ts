import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import AjvModule from 'ajv-draft-04'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import schema from './sarif-schema.js'

export const MAX_ARTIFACT_BYTES = 256 * 1024
export const PARSER_VERSION = 1
export type ArtifactFormat = 'junit' | 'sarif'
type ObjectValue = Record<string, any>
const Ajv = AjvModule.default ?? AjvModule
const validateSarif = new Ajv({ strict: false, validateFormats: false, ownProperties: true, logger: false }).compile(schema)
const invalid = () => new BadRequestException('Report is malformed, unsupported, or exceeds import limits')

// Bounds apply before recursive schema/parser work. No external resources are resolved.
function boundedJson(value: unknown) {
  const pending = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++nodes > 20000 || item.depth > 32) throw invalid()
    if (item.value && typeof item.value === 'object')
      for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 })
  }
}
function sarif(content: string) {
  let report: ObjectValue
  try { report = JSON.parse(content.replace(/^\uFEFF/, '')) } catch { throw invalid() }
  boundedJson(report)
  const valid: boolean = validateSarif(report)
  if (!valid || report.version !== '2.1.0' || report.runs.length > 100) throw invalid()
  const levels = { error: 0, warning: 0, note: 0, none: 0, unknown: 0 }
  let results = 0, suppressed = 0, partial = false, invocations = 0, succeeded = 0, failed = 0
  for (const run of report.runs) {
    if (!Array.isArray(run.results) || run.externalPropertyFileReferences) partial = true
    for (const result of run.results ?? []) {
      if (++results > 5000) throw invalid()
      const level = result.level as keyof typeof levels | undefined
      levels[level && level in levels ? level : 'unknown']++
      if (result.suppressions?.some((s: ObjectValue) => s.status === 'accepted')) suppressed++
    }
    for (const invocation of run.invocations ?? []) {
      invocations++
      if (invocation.executionSuccessful === true) succeeded++
      if (invocation.executionSuccessful === false) failed++
    }
    if (!run.invocations?.length) partial = true
  }
  return { runs: report.runs.length, results, ...levels, suppressed, partial,
    execution: failed ? 'REPORTED_FAILURE' : invocations > 0 && succeeded === invocations && !partial ? 'REPORTED_SUCCESS' : 'UNKNOWN' }
}
function junit(content: string) {
  const encoding = content.match(/<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]
  if (encoding && !/^utf-8$/i.test(encoding)) throw invalid()
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(content)) throw invalid()
  let depth = 0, tokens = 0
  // Quotes, comments and CDATA are consumed as units so embedded markup is not treated as structure.
  const tags = new RegExp(String.raw`<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>`, 'g')
  for (const match of content.matchAll(tags)) {
    const tag = match[0]
    if (++tokens > 20000) throw invalid()
    if (/^<(?:!|\?)/.test(tag)) continue
    if (/^<\//.test(tag)) depth--
    else if (!/\/\s*>$/.test(tag)) depth++
    if (depth > 32 || depth < 0) throw invalid()
  }
  if (XMLValidator.validate(content) !== true) throw invalid()
  let report: ObjectValue
  try { report = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    processEntities: false, isArray: (name) => ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(name) }).parse(content) } catch { throw invalid() }
  const roots = Object.keys(report).filter(k => !k.startsWith('?'))
  if (roots.length !== 1 || !['testsuite', 'testsuites'].includes(roots[0])) throw invalid()
  let suites = 0, total = 0
  const zero = () => ({ tests: 0, failures: 0, errors: 0, skipped: 0, passed: 0 })
  function container(node: ObjectValue): ReturnType<typeof zero> {
    if ((node as unknown) === '') node = {}
    if (!node || typeof node !== 'object' || ++suites > 1000) throw invalid()
    for (const key of Object.keys(node))
      if (!key.startsWith('@_') && !['testsuite', 'testcase', 'properties', 'system-out', 'system-err', '#text'].includes(key)) throw invalid()
    if (node['#text']?.trim()) throw invalid()
    const counts = zero()
    for (const test of node.testcase ?? []) {
      if (!test || typeof test !== 'object' || !test['@_name'] || ++total > 5000) throw invalid()
      for (const key of Object.keys(test))
        if (!key.startsWith('@_') && !['failure', 'error', 'skipped', 'properties', 'system-out', 'system-err', '#text'].includes(key)) throw invalid()
      if (test['@_status'] !== undefined || test['@_result'] !== undefined || test['#text']?.trim()) throw invalid()
      const states = ['failure', 'error', 'skipped'].filter(k => test[k] !== undefined)
      if (states.length > 1) throw invalid()
      counts.tests++
      if (states[0] === 'failure') counts.failures++
      else if (states[0] === 'error') counts.errors++
      else if (states[0] === 'skipped') counts.skipped++
      else counts.passed++
    }
    for (const child of node.testsuite ?? []) {
      const nested = container(child)
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] += nested[key]
    }
    for (const key of ['tests', 'failures', 'errors', 'skipped'] as const) {
      const declared = node['@_' + key]
      if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) !== counts[key])) throw invalid()
    }
    // Node.js emits direct testcases under testsuites; count these with the same strict validation.
    return counts
  }
  const counts = roots[0] === 'testsuites' ? container(report.testsuites) : container(report.testsuite[0])
  if (roots[0] === 'testsuite' && report.testsuite.length !== 1) throw invalid()
  return { ...counts, suites, execution: 'UNKNOWN', partial: true }
}

export function parseArtifact(format: unknown, content: unknown, expectedHash: unknown) {
  if (!['junit', 'sarif'].includes(format as string) || typeof content !== 'string' ||
      typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw invalid()
  const bytes = Buffer.from(content, 'utf8')
  if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES || bytes.toString('utf8') !== content) throw invalid()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== expectedHash.toLowerCase()) throw new BadRequestException('Artifact SHA-256 does not match the original UTF-8 bytes')
  return { bytes, sha256, format: format as ArtifactFormat, summary: format === 'junit' ? junit(content) : sarif(content) }
}
