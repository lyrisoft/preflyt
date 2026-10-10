import { expect, it } from 'vitest'
import { sidebarData } from '../../components/layout/data/sidebar-data'
import { contributorSearchSchema } from '../contributors/search-schema'
import { authorizedNavigation } from './navigation-policy'
import { canPerform } from './scoped-access'

it('never derives resource authorization from a platform role alone', () => {
  expect(canPerform({ role: 'SUPER_ADMIN' }, 'repository.manage', '11')).toBe(
    false
  )
  expect(
    canPerform(
      { permissions: ['assessment.run'], repositoryGrants: ['11'] },
      'assessment.run',
      '11'
    )
  ).toBe(true)
  expect(
    canPerform(
      { permissions: ['assessment.run'], repositoryGrants: ['11'] },
      'assessment.run',
      '12'
    )
  ).toBe(false)
  expect(
    canPerform(
      { permissions: ['repository.manage'], organizationWide: true },
      'repository.manage',
      '12'
    )
  ).toBe(true)
})
it('keeps contributor filters and detail tabs deep-linkable with safe defaults', () => {
  expect(
    contributorSearchSchema.parse({
      days: '90',
      repository: '11',
      tab: 'reviews',
      page: '2',
    })
  ).toMatchObject({ days: '90', repository: '11', tab: 'reviews', page: 2 })
  expect(
    contributorSearchSchema.parse({
      days: 'forever',
      repository: ['12'],
      kind: 'admin',
      page: '-1',
    })
  ).toMatchObject({ days: '30', repository: 'all', kind: 'all', page: 1 })
})

it('keeps platform operations accessible without granting organization administration', () => {
  const items = authorizedNavigation(
    sidebarData.navGroups,
    'VIEWER',
    true
  ).flatMap((g) => g.items)
  expect(items.map((i) => i.title)).toContain('Access Control')
  expect(items.map((i) => i.title)).toContain('Settings')
})
