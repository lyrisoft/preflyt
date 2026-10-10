import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { MarkdownInstructions } from './skill-markdown'
import { SkillsCatalogue } from './skills-catalogue'

const state = vi.hoisted(() => ({
  role: 'OWNER',
  query: {} as Record<string, unknown>,
  save: vi.fn(),
  invalidate: vi.fn(),
  download: vi.fn(),
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
  governanceTextRequest: (...args: unknown[]) => state.download(...args),
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
  state.download
    .mockReset()
    .mockResolvedValue(
      '---\nname: Review\ndescription: Evidence\n---\n\n# Review instructions'
    )
  state.invalidate.mockReset().mockResolvedValue({})
})
it('creates a disabled draft from a first-party template with bounded scope', async () => {
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('tab', { name: 'Built-in skills' }).click()
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await view.getByRole('button', { name: 'Create separate copy' }).click()
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

it('loads SKILL.md into an editable draft without saving or approving it', async () => {
  const imported = {
    ...template,
    name: 'Uploaded review',
    instructions: '# Review evidence\n\n- Cite checks.',
    license: '',
  }
  state.save.mockResolvedValue(imported)
  const view = await render(<SkillsCatalogue />)
  await userEvent.upload(
    view.getByLabelText('Upload SKILL.md file'),
    new File(
      [
        '---\nname: Uploaded review\ndescription: Review evidence\n---\n\n# Review evidence',
      ],
      'SKILL.md',
      { type: 'text/markdown' }
    )
  )
  await expect
    .element(view.getByRole('textbox', { name: 'Name', exact: true }))
    .toHaveValue('Uploaded review')
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.save).toHaveBeenCalledWith(
    '/ai/skills/parse',
    expect.objectContaining({ markdown: expect.any(String) }),
    expect.any(AbortSignal)
  )
  await expect
    .element(view.getByRole('button', { name: 'Save draft' }))
    .toBeDisabled()
  await view.getByRole('textbox', { name: 'License', exact: true }).fill('MIT')
  await view.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect
    .element(view.getByRole('heading', { name: 'Review evidence' }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Save draft' }).click()
  expect(state.save).toHaveBeenLastCalledWith(
    '/ai/skills',
    expect.objectContaining({
      name: imported.name,
      instructions: imported.instructions,
      license: 'MIT',
      expectedVersion: 0,
    })
  )
})
it('replaces new-version draft text while retaining its family and expected version', async () => {
  state.save.mockResolvedValue({
    ...template,
    name: 'Changed document',
    instructions: '# Replacement',
  })
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('button', { name: 'Review', exact: true }).click()
  await view.getByRole('button', { name: 'Create new version' }).click()
  await userEvent.upload(
    view.getByLabelText('Replace from SKILL.md file'),
    new File(['fixture'], 'SKILL.md')
  )
  await expect
    .element(view.getByRole('textbox', { name: 'Instructions', exact: true }))
    .toHaveValue('# Replacement')
  await view.getByRole('button', { name: 'Save draft' }).click()
  expect(state.save).toHaveBeenLastCalledWith(
    '/ai/skills',
    expect.objectContaining({
      skillKey: skill.skillKey,
      expectedVersion: 1,
      instructions: '# Replacement',
    })
  )
})
it('keeps unsaved text after a rejected file and cancels without saving', async () => {
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('tab', { name: 'Built-in skills' }).click()
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await view.getByRole('button', { name: 'Create separate copy' }).click()
  await userEvent.upload(
    view.getByLabelText('Replace from SKILL.md file'),
    new File(['x'.repeat(32769)], 'SKILL.md')
  )
  await expect.element(view.getByRole('alert')).toHaveTextContent('32 KiB')
  await expect
    .element(view.getByRole('textbox', { name: 'Instructions', exact: true }))
    .toHaveValue(template.instructions)
  expect(state.save).not.toHaveBeenCalled()
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
})
it('downloads the selected database version for a read-only user', async () => {
  state.role = 'DEVELOPER'
  const objectUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:skill-download')
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  try {
    const view = await render(<SkillsCatalogue />)
    await view.getByRole('button', { name: 'Review', exact: true }).click()
    await view.getByRole('button', { name: 'Download SKILL.md' }).click()
    expect(state.download).toHaveBeenCalledWith('/ai/skills/skill/markdown')
    expect(click.mock.instances[0]).toHaveProperty('download', 'SKILL.md')
    const file = objectUrl.mock.calls[0]![0] as Blob
    expect(await file.text()).toContain('# Review instructions')
  } finally {
    objectUrl.mockRestore()
    click.mockRestore()
  }
})
it('renders Markdown headings and lists without executing HTML or loading linked resources', () => {
  const html = renderToStaticMarkup(
    <MarkdownInstructions>
      {
        '# Review\n\n- Cite checks.\n\n![image](https://external.invalid/image.png)\n\n[link](https://external.invalid)\n\n<script>bad()</script>\n\n<iframe src="https://external.invalid"></iframe>'
      }
    </MarkdownInstructions>
  )
  expect(html).toContain('<h1>Review</h1>')
  expect(html).toContain('<li>Cite checks.</li>')
  expect(html).not.toMatch(/<img|<script|<iframe|href=|src=/)
})

it('keeps the Markdown editor wide on desktop and prevents mobile overflow', async () => {
  await page.viewport(1280, 900)
  document.documentElement.classList.add('dark')
  const view = await render(<SkillsCatalogue />)
  await view.getByRole('tab', { name: 'Built-in skills' }).click()
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await view.getByRole('button', { name: 'Create separate copy' }).click()
  await view
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill(
      '# Security evidence review\n\n## Instructions\n\n- Review the supplied evidence.\n- Cite each check behind a finding.\n- Do not treat missing checks as passing.\n\n```text\nEvidence → Finding → Recommended next action\n```'
    )
  await view.getByRole('tab', { name: 'Preview', exact: true }).click()
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement
  await expect.poll(() => getComputedStyle(dialog).opacity).toBe('1')
  expect(dialog.getBoundingClientRect().width).toBeGreaterThan(900)
  await expect
    .element(view.getByRole('button', { name: 'Save draft' }))
    .toBeVisible()
  await page.screenshot({ path: '__screenshots__/skill-markdown-desktop.png' })
  await page.viewport(390, 844)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await expect
    .element(view.getByRole('button', { name: 'Save draft' }))
    .toBeVisible()
  await page.screenshot({ path: '__screenshots__/skill-markdown-mobile.png' })
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

it('filters and paginates built-ins and strips catalogue metadata from editable copies', async () => {
  state.query = {
    data: {
      skills: [],
      templates: Array.from({ length: 8 }, (_, i) => ({
        ...template,
        id: `builtin-${i}`,
        name: `Review ${i}`,
        category: 'Backend Services',
        checkIds: ['tests.required'],
        checks: ['Required test execution'],
      })),
    },
  }
  const view = await render(<SkillsCatalogue />)
  await expect
    .element(view.getByRole('tab', { name: 'Built-in skills' }))
    .toHaveAttribute('aria-selected', 'true')
  await expect
    .element(view.getByText('Review 6', { exact: true }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByText('Review 6', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Filter skills' })
    .fill('test execution')
  await expect.element(view.getByText('Page 1 of 2')).toBeVisible()
  await view.getByRole('button', { name: 'View Review 0' }).click()
  await view.getByRole('button', { name: 'Create separate copy' }).click()
  await view
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Organization-specific review instructions.')
  await view.getByRole('button', { name: 'Save draft' }).click()
  const body = state.save.mock.lastCall![1]
  expect(body).toMatchObject({
    name: 'Review 0',
    instructions: 'Organization-specific review instructions.',
    expectedVersion: 0,
  })
  for (const key of [
    'id',
    'category',
    'checks',
    'checkIds',
    'enabled',
    'status',
    'contentDigest',
  ])
    expect(body).not.toHaveProperty(key)
  expect(
    (state.query.data as { templates: (typeof template)[] }).templates[0]!
      .instructions
  ).toBe(template.instructions)
})
it('lets developers preview built-in instructions without editing or enabling them', async () => {
  state.role = 'DEVELOPER'
  state.query = { data: { skills: [], templates: [template] } }
  const view = await render(<SkillsCatalogue />)
  await expect
    .element(
      view.getByRole('button', {
        name: 'Use Security evidence review',
      })
    )
    .not.toBeInTheDocument()
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await expect.element(view.getByRole('dialog')).toBeVisible()
  await expect
    .element(view.getByText(template.instructions, { exact: true }))
    .toBeVisible()
  expect(state.save).not.toHaveBeenCalled()
})

it('downloads a built-in SKILL.md without creating an organization draft', async () => {
  state.query = {
    data: { skills: [], templates: [{ ...template, id: 'security-evidence' }] },
  }
  const view = await render(<SkillsCatalogue />)
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await view.getByRole('button', { name: 'Download SKILL.md' }).click()
  expect(state.download).toHaveBeenCalledWith(
    '/ai/skills/builtins/security-evidence/markdown'
  )
  expect(state.save).not.toHaveBeenCalled()
})

it('keeps the built-in library and preview within a mobile viewport', async () => {
  await page.viewport(390, 844)
  state.query = {
    data: {
      skills: [],
      templates: [
        {
          ...template,
          id: 'security-evidence',
          checks: [
            'Secret scanning',
            'Static application security',
            'Dependency vulnerability scan',
          ],
        },
      ],
    },
  }
  const view = await render(<SkillsCatalogue />)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await view
    .getByRole('button', { name: 'View Security evidence review' })
    .click()
  await expect
    .element(view.getByRole('button', { name: 'Download SKILL.md' }))
    .toBeVisible()
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await page.viewport(1280, 900)
})

it('uses the existing organization instance of a built-in instead of creating another copy', async () => {
  state.query = {
    data: { skills: [], templates: [{ ...template, id: 'security-evidence' }] },
  }
  state.save.mockResolvedValue(skill)
  const view = await render(<SkillsCatalogue />)
  await view
    .getByRole('button', { name: 'Use Security evidence review' })
    .click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/skills/builtins/security-evidence/use',
    {}
  )
  await expect
    .element(view.getByRole('button', { name: 'Approve version' }))
    .toBeVisible()
  expect(state.save).toHaveBeenCalledTimes(1)
})
