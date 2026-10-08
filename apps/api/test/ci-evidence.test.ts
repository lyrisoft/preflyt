import { expect, it } from 'vitest'
import { ciResult } from '../src/github-events/ci-evidence.js'
it.each([
  ['completed', 'completed', 'success', 'SUCCEEDED'],
  ['completed', 'completed', 'failure', 'FAILED'],
  ['completed', 'completed', 'timed_out', 'FAILED'],
  ['completed', 'completed', 'skipped', 'NOT_EXECUTED'],
  ['completed', 'completed', 'cancelled', 'UNKNOWN'],
  ['completed', 'completed', 'neutral', 'UNKNOWN'],
  ['completed', 'completed', null, 'UNKNOWN'],
  ['completed', 'unknown', 'success', 'UNKNOWN'],
  ['in_progress', 'in_progress', 'success', 'PENDING'],
  ['rerequested', 'completed', 'success', 'PENDING'],
  ['created', 'completed', 'success', 'UNKNOWN'],
])('maps %s/%s/%s to provider observation %s', (action, status, conclusion, result) => {
  expect(ciResult(action, status, conclusion)).toBe(result)
  expect(result).not.toBe('PASS')
})
