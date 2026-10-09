import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { SkillsCatalogue } from './skills-catalogue'

const state = vi.hoisted(() => ({
  role: 'OWNER',
  query: {} as Record<string, unknown>,
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === 'skill-repositories'
      ? {
          data: {
            repositories: [
              { githubId: '123', fullName: 'org/repo', selected: true },
            ],
          },
        }
      : state.query,
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { role: state.role, identityId: 'owner', organizationId: 'org' },
  }),
  canAdminister: (role: string) => ['OWNER', 'ADMIN'].includes(role),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.save(...args),
}))
const template = {
  name: 'Security evidence review',
  description: 'Explain missing evidence',
  instructions: 'Review supplied assessment evidence only.',
  stages: ['repository', 'pull_request'],
  repositories: [],
  source: 'Preflyt first-party template',
  license: 'Organization-owned',
}
const skill = {
  ...template,
  id: 'skill',
  skillKey: 'key',
  version: 1,
  contentDigest: 'a'.repeat(64),
  status: 'DRAFT',
  enabled: false,
}
beforeEach(() => {
  state.role = 'OWNER'
  state.query = {
    data: { skills: [skill], templates: [template] },
    isPending: false,
    isError: false,
  }
  state.save.mockReset().mockResolvedValue({})
  state.invalidate.mockReset().mockResolvedValue({})
})
it('creates a disabled draft from a first-party template with bounded scope', async () => {
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('button', { name: 'Use template' }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Instructions', exact: true }))
    .toHaveValue(template.instructions)
  await view.getByRole('checkbox', { name: 'org/repo' }).click()
  await view.getByRole('button', { name: 'Save draft' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/skills',
    expect.objectContaining({
      name: template.name,
      instructions: template.instructions,
      expectedVersion: 0,
      repositories: ['123'],
    })
  )
})
it('requires explicit review before approving the pinned version', async () => {
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('button', { name: 'Review', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Approve version' }))
    .toBeDisabled()
  await view
    .getByRole('checkbox', {
      name: 'I reviewed the instructions, source and license for this version.',
    })
    .click()
  await view.getByRole('button', { name: 'Approve version' }).click()
  expect(state.save).toHaveBeenCalledWith('/ai/skills/skill/approve', {
    expectedDigest: skill.contentDigest,
    reviewed: true,
  })
})
it('creates a new version instead of editing an approved definition', async () => {
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('button', { name: 'Review', exact: true }).click()
  await view.getByRole('button', { name: 'Create new version' }).click()
  await view
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Changed instructions')
  await view.getByRole('button', { name: 'Save draft' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/skills',
    expect.objectContaining({
      skillKey: 'key',
      expectedVersion: 1,
      instructions: 'Changed instructions',
    })
  )
})
it('separates read-only developer access from approval and handles failed loads', () => {
  state.role = 'DEVELOPER'
  const html = renderToStaticMarkup(<SkillsCatalogue />)
  expect(html).toContain('Review skills')
  expect(html).not.toContain('Create skill')
  expect(html).not.toContain('Use template')
  state.query = { isError: true, data: { skills: [skill], templates: [] } }
  const failed = renderToStaticMarkup(<SkillsCatalogue />)
  expect(failed).toContain('Skills unavailable')
  expect(failed).not.toContain('Security evidence review')
})
it('paginates skill versions and resets to matching results on filter', async () => {
  state.query = {
    data: {
      skills: Array.from({ length: 21 }, (_, i) => ({
        ...skill,
        id: `skill-${i}`,
        name: `Review ${String(i).padStart(2, '0')}`,
      })),
      templates: [],
    },
  }
  const view = await render(<SkillsCatalogue />)
  await expect
    .element(view.getByText('Review 00', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByText('Review 10', { exact: true }))
    .toBeVisible()
  await view.getByRole('textbox', { name: 'Filter skills' }).fill('Review 20')
  await expect
    .element(view.getByText('Review 20', { exact: true }))
    .toBeVisible()
})
