import { expect, it } from 'vitest'
import { findingStatus } from './finding-classification'

it('replaces Needs review with the human classification while preserving visibility and workflow state', () => {
  expect(
    findingStatus({
      status: 'Needs review',
      review: {
        classification: 'CONFIRMED',
        reason: 'Evidence',
        updatedAt: '',
      },
    })
  ).toBe('Confirmed')
  expect(
    findingStatus({
      status: 'Needs review',
      review: {
        classification: 'FALSE_POSITIVE',
        reason: 'Evidence',
        updatedAt: '',
      },
    })
  ).toBe('False positive')
  expect(
    findingStatus({
      status: 'Ignored',
      review: {
        classification: 'CONFIRMED',
        reason: 'Evidence',
        updatedAt: '',
      },
    })
  ).toBe('Ignored')
  expect(findingStatus({ status: 'Needs review' })).toBe('Needs review')
  expect(
    findingStatus({
      status: 'Reported',
      triage: { state: 'IN_REVIEW', assigneeId: null, note: '', revision: 1 },
    })
  ).toBe('In review')
})
