import { expect, it } from 'vitest'
import { findingDetailSearch, findingsSearch } from './finding-search'

it('preserves numeric repository IDs parsed from URLs and AI filters', () => {
  expect(
    findingsSearch.parse({
      repository: 1410129036,
      source: 'ai',
      kind: 'ai',
      severity: 'low',
    })
  ).toEqual({
    repository: '1410129036',
    source: 'ai',
    kind: 'ai',
    severity: 'low',
  })
  expect(
    findingDetailSearch.parse({
      repository: '1410129036',
      origin: 'ai',
      assessment: 'saved-review',
      back: 'source=ai',
    })
  ).toMatchObject({
    repository: '1410129036',
    origin: 'ai',
    assessment: 'saved-review',
    back: 'source=ai',
  })
  for (const repository of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '../private'])
    expect(findingsSearch.parse({ repository }).repository).toBeUndefined()
})
