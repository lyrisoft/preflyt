import { expect, it } from 'vitest'
import { controlSummary } from './control-summary'

it('keeps required/advisory configuration counts separate and treats new states as unknown', () => {
  const summary = controlSummary([
    { required: true, configuration: 'HINT_DETECTED' },
    { required: true, configuration: 'MISSING' },
    { required: false, configuration: 'UNKNOWN' },
    { required: false, configuration: 'UNRECOGNIZED' },
  ])
  expect(summary.distribution).toEqual([
    { key: 'HINT_DETECTED', value: 1 },
    { key: 'UNKNOWN', value: 2 },
    { key: 'MISSING', value: 1 },
    { key: 'NOT_INSPECTED', value: 0 },
  ])
  expect(summary.requirements).toEqual([
    { name: 'Required', found: 1, unknown: 0, missing: 1, ci: 0 },
    { name: 'Advisory', found: 0, unknown: 2, missing: 0, ci: 0 },
  ])
})
it('does not invent coverage for an empty control selection', () => {
  const summary = controlSummary([])
  expect(summary.distribution.every((state) => state.value === 0)).toBe(true)
  expect(
    summary.requirements.every(
      (row) => row.found + row.unknown + row.missing + row.ci === 0
    )
  ).toBe(true)
})

it('counts CI-only controls without inventing missing setup or found files', () => {
  const summary = controlSummary([
    { required: true, configuration: 'NOT_INSPECTED' },
    { required: true, configuration: 'NOT_INSPECTED' },
  ])
  expect(
    summary.distribution.find((state) => state.key === 'NOT_INSPECTED')?.value
  ).toBe(2)
  expect(summary.requirements[0]).toEqual({
    name: 'Required',
    found: 0,
    unknown: 0,
    missing: 0,
    ci: 2,
  })
})
