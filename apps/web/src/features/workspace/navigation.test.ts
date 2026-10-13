import { describe, expect, it } from 'vitest'
import { sidebarData } from '../../components/layout/data/sidebar-data'
import { authorizedNavigation, primaryDestination } from './navigation-policy'
import { workspaceSearchSchema } from './search-schema'

const titles = (role?: string) =>
  authorizedNavigation(sidebarData.navGroups, role).flatMap((group) =>
    group.items.map((item) => item.title)
  )
describe('enterprise navigation permissions and scope', () => {
  it('keeps the familiar sidebar groups and all direct destinations for administrators', () => {
    expect(sidebarData.navGroups.map((group) => group.title)).toEqual([
      'Workspace',
      'Governance',
      'Intelligence',
      'Administration',
    ])
    for (const role of ['OWNER', 'ADMIN', 'SUPER_ADMIN']) {
      expect(titles(role)).toEqual([
        'Overview',
        'Repositories',
        'Assessments',
        'Findings',
        'Contributors',
        'Merge Protection',
        'Standards',
        'Policies',
        'AI Intelligence',
        'Skills',
        'Integrations',
        'Teams',
        'Access Control',
        'Audit log',
        'Settings',
      ])
    }
    const routes = sidebarData.navGroups.flatMap((group) =>
      group.items.map((item) => item.url)
    )
    expect(new Set(routes).size).toBe(routes.length)
  })
  it('keeps personal settings available without granting administrative access', () => {
    for (const role of [undefined, 'VIEWER', 'DEVELOPER', 'UNKNOWN']) {
      expect(titles(role)).not.toContain('Access Control')
      expect(titles(role)).not.toContain('Audit log')
      expect(titles(role)).toContain('Settings')
      expect(titles(role)).toContain('Integrations')
      expect(titles(role)).toContain('Skills')
    }
  })
  it('highlights each page under its direct sidebar entry', () => {
    for (const [path, parent] of [
      ['/repositories/123?tab=assessments', '/apps'],
      ['/contributors/person?days=30', '/contributors'],
      ['/assessments?repository=123', '/assessments'],
      ['/quality-gates?repository=123', '/quality-gates'],
      ['/policies', '/policies'],
      ['/standards', '/standards'],
      ['/teams/team-id', '/teams'],
      ['/intelligence', '/intelligence'],
      ['/skills', '/skills'],
      ['/integrations', '/integrations'],
      ['/organization-settings?tab=notifications', '/organization-settings'],
      ['/findings', '/findings'],
    ])
      expect(primaryDestination(path)).toBe(parent)
    expect(primaryDestination('/teams-other')).toBe('/teams-other')
  })
  it('distinguishes unfinished modules and excludes theme demo routes', () => {
    const items = sidebarData.navGroups.flatMap((group) => group.items)
    expect(
      items.filter((item) => item.badge === 'Planned').map((item) => item.title)
    ).toEqual([])
    for (const route of ['/tasks', '/chats', '/users', '/settings']) {
      expect(items.map((item) => item.url)).not.toContain(route)
    }
  })
  it('preserves repository scope in validated navigation search', () => {
    expect(workspaceSearchSchema.parse({ repository: '1097527174' })).toEqual({
      repository: '1097527174',
    })
    expect(
      workspaceSearchSchema.parse({
        repository: 1097527174,
        assessment: 'report',
      })
    ).toMatchObject({ repository: '1097527174', assessment: 'report' })
    for (const repository of [
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      { id: 123 },
    ]) {
      expect(
        workspaceSearchSchema.parse({ repository }).repository
      ).toBeUndefined()
    }
    expect(
      workspaceSearchSchema.parse({ repository: ['invalid'] }).repository
    ).toBeUndefined()
  })
})

it('includes the Audit log for Auditors without granting Access Control', () => {
  expect(titles('AUDITOR')).toContain('Audit log')
  expect(titles('AUDITOR')).not.toContain('Access Control')
  expect(
    authorizedNavigation(sidebarData.navGroups, undefined, true).flatMap((g) =>
      g.items.map((i) => i.title)
    )
  ).not.toContain('Audit log')
})
