import { expect, it } from 'vitest'
import { findingGuidanceText } from './finding-guidance-text'
import type { Finding } from './finding-types'

const advice =
  'Use parameterized SQL instead of interpolating user input into a query.'
const finding = {
  title: advice,
  category: 'security',
  ruleId: 'sql-string-interpolation',
  referenceGuidance: {
    version: 2,
    source: 'PREFLYT_RULE_REFERENCE',
    rule: 'sql-string-interpolation',
    problem: 'Input is interpolated into SQL query text',
    why: 'Interpolating input can change the query, potentially returning unintended records or exposing data.',
    fix: 'Use placeholders and pass values separately.',
    limits: 'whether it is exploitable depends on the input source',
  },
  reportGuidance: {
    version: 1,
    source: 'ANALYZER_REPORT',
    explanation: advice,
    advice,
  },
} as Finding
it('explains the known SQL construction issue and effect separately from the remedy without rewriting evidence', () => {
  const original = structuredClone(finding)
  const text = findingGuidanceText(finding)
  expect(text.title).toBe('Input is interpolated into SQL query text')
  expect(text.explanation).toContain(
    'returning unintended records or exposing data'
  )
  expect(text.solution).toContain('pass values separately')
  expect(text.attribution).toContain('whether it is exploitable depends')
  expect(text.attribution).not.toContain('saved with this assessment')
  expect(finding).toEqual(original)
})
it('never reuses identical or imperative remediation as an unknown-rule problem', () => {
  for (const explanation of [advice, 'Use bound parameters.']) {
    const text = findingGuidanceText({
      ...finding,
      ruleId: 'unknown',
      referenceGuidance: undefined,
      reportGuidance: { ...finding.reportGuidance!, explanation },
    })
    expect(text.title).toBe('Analyzer finding at this location')
    expect(text.explanation).toContain(
      'does not describe the code issue or its effect'
    )
    expect(text.solution).toBe(advice)
  }
  expect(
    findingGuidanceText({
      ...finding,
      ruleId: 'sql-string-interpolation-unknown',
      referenceGuidance: undefined,
    }).title
  ).toBe('Analyzer finding at this location')
})
it('preserves supplied issue and impact while deduplicating a repeated title', () => {
  const text = findingGuidanceText({
    ...finding,
    ruleId: 'custom',
    referenceGuidance: undefined,
    title: 'Input changes query behavior',
    reportGuidance: {
      ...finding.reportGuidance!,
      explanation: 'Input changes query behavior',
    },
  })
  expect(text.title).toBe('Input changes query behavior')
  expect(text.explanation).toBeNull()
  expect(text.solution).toBe(advice)
})

it('protects every finding category and both saved guidance sources against duplicated remediation', () => {
  for (const category of [
    'security',
    'reliability',
    'maintainability',
    'duplication',
    'hotspot',
    'tests',
    'coverage',
    'check',
  ]) {
    for (const text of [
      'Use safer input handling.',
      'Recommendation: Use safer input handling.',
      'You should use safer input handling.',
    ]) {
      const base = {
        ...finding,
        category,
        ruleId: 'custom',
        title: text,
        referenceGuidance: undefined,
        reportGuidance: {
          ...finding.reportGuidance!,
          explanation: text.toUpperCase(),
          advice: text,
        },
      }
      const report = findingGuidanceText(base)
      expect(report.title).not.toBe(text)
      expect(report.explanation?.toLowerCase()).not.toBe(text.toLowerCase())
      expect(report.solution).toBe(text)
      const saved = findingGuidanceText({
        ...base,
        guidance: {
          version: 2,
          source: 'PREFLYT_RULE_GUIDANCE',
          rule: 'custom',
          why: text,
          fix: text,
          limits: 'Pattern only.',
        },
      })
      expect(saved.title).not.toBe(text)
      expect(saved.explanation).not.toBe(text)
      expect(saved.solution).toBe(text)
    }
  }
})
it('deduplicates formatting variants and leaves a genuine description with a distinct fix intact', () => {
  const base = {
    ...finding,
    ruleId: 'custom',
    title: 'Unsafe input handling',
    referenceGuidance: undefined,
  }
  const duplicate = findingGuidanceText({
    ...base,
    reportGuidance: {
      ...finding.reportGuidance!,
      explanation: 'Use  bound parameters!',
      advice: 'use bound parameters.',
    },
  })
  expect(duplicate.explanation).toContain('does not describe the code issue')
  const valid = findingGuidanceText({
    ...base,
    reportGuidance: {
      ...finding.reportGuidance!,
      explanation:
        'Untrusted input changes the query and can expose other records.',
      advice: 'Use bound parameters.',
    },
  })
  expect(valid.explanation).toBe(
    'Untrusted input changes the query and can expose other records.'
  )
  expect(valid.solution).toBe('Use bound parameters.')
})
