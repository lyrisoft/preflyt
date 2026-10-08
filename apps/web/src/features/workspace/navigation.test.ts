import { describe, expect, it } from 'vitest'
import { sidebarData } from '../../components/layout/data/sidebar-data'
import { authorizedNavigation } from './navigation-policy'
import { workspaceSearchSchema } from './search-schema'

const titles = (role?: string) =>
  authorizedNavigation(sidebarData.navGroups, role).flatMap((group) =>
    group.items.map((item) => item.title)
  )
describe('enterprise navigation permissions and scope', () => {
  it('keeps all specified groups and entries for administrators', () => {
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
        'Quality Gates',
        'Engineering Standards',
        'Policies',
        'AI Intelligence',
        'Integrations',
        'Access Control',
        'Settings',
      ])
    }
  })
  it('fails closed for unknown roles and hides administration actions from readers', () => {
    for (const role of [undefined, 'VIEWER', 'DEVELOPER', 'UNKNOWN']) {
      expect(titles(role)).not.toContain('Access Control')
      expect(titles(role)).not.toContain('Settings')
      expect(titles(role)).toContain('Integrations')
    }
    expect(sidebarData.navGroups[3].items).toHaveLength(3)
  })
  it('distinguishes unfinished modules and excludes theme demo routes', () => {
    const items = sidebarData.navGroups.flatMap((group) => group.items)
    expect(
      items.filter((item) => item.badge === 'Planned').map((item) => item.title)
    ).toEqual([
      'Findings',
      'Quality Gates',
      'AI Intelligence',
      'Access Control',
      'Settings',
    ])
    for (const route of ['/tasks', '/chats', '/users', '/settings']) {
      expect(items.map((item) => item.url)).not.toContain(route)
    }
  })
  it('preserves repository scope in validated navigation search', () => {
    expect(workspaceSearchSchema.parse({ repository: '1097527174' })).toEqual({
      repository: '1097527174',
    })
    expect(
      workspaceSearchSchema.parse({ repository: ['invalid'] }).repository
    ).toBeUndefined()
  })
})
