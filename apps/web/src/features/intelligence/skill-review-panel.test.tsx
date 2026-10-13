import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { SkillReviewPanel } from './skill-review-panel'

const state = vi.hoisted(() => ({
  reviews: {} as Record<string, unknown>,
  skills: [] as Record<string, unknown>[],
  role: 'DEVELOPER',
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (o: { queryKey: string[] }) =>
    o.queryKey[0] === 'skill-reviews'
      ? state.reviews
      : { data: { skills: state.skills } },
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { role: state.role, identityId: 'developer', organizationId: 'org' },
  }),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...a: unknown[]) => state.save(...a),
}))
const skill = {
  id: 'skill',
  name: 'Evidence review',
  version: 1,
  enabled: true,
  status: 'APPROVED',
  stages: ['repository'],
  repositories: ['123'],
}
const check = {
  id: 'check',
  title: 'Evidence review',
  skillId: 'skill',
  skillVersion: 1,
  skillDigest: 'a'.repeat(64),
  kind: 'AI_REVIEW' as const,
  mode: 'ADVISORY' as const,
  stages: ['repository' as const],
  available: true,
}
const review = {
  id: 'review',
  state: 'SUCCEEDED',
  failure: null,
  latencyMs: 1000,
  skills: [skill],
  checks: [check],
  result: {
    findings: [
      {
        checkId: 'check',
        summary: 'Missing secret scan evidence',
        recommendation: 'Run the configured check',
        evidenceRefs: ['check:0'],
      },
    ],
    context: {
      evidence: [
        { ref: 'check:0', ruleId: 'security.secret', result: 'UNKNOWN' },
      ],
    },
  },
}
beforeEach(() => {
  state.reviews = { data: { enabled: true, reviews: [], checks: [check] } }
  state.skills = [
    skill,
    { ...skill, id: 'other', name: 'Other repository', repositories: ['999'] },
  ]
  state.role = 'DEVELOPER'
  state.save.mockReset().mockResolvedValue({})
  state.invalidate.mockReset().mockResolvedValue({})
})
it('runs only selected skills assigned to the assessment scope', async () => {
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='repository'
    />
  )
  await expect
    .element(view.getByRole('button', { name: 'Run review' }))
    .toBeDisabled()
  await expect
    .element(view.getByText('Other repository · v1'))
    .not.toBeInTheDocument()
  await view
    .getByRole('checkbox', { name: 'Evidence review · skill v1' })
    .click()
  await view.getByRole('button', { name: 'Run review' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/github/repositories/123/ai-reviews',
    { assessmentId: 'assessment', checkIds: ['check'] }
  )
})
it('labels inferred suggestions and maps evidence references to known checks', async () => {
  state.reviews = { data: { enabled: true, reviews: [review] } }
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='repository'
    />
  )
  await expect.element(view.getByText('AI suggestion')).toBeVisible()
  await expect
    .element(view.getByText('Evidence: security.secret'))
    .toBeVisible()
  await expect
    .element(view.getByText('Missing secret scan evidence'))
    .toBeVisible()
})
it('cancels active work without discarding its history', async () => {
  state.reviews = {
    data: {
      enabled: true,
      reviews: [{ ...review, state: 'RUNNING', result: null }],
    },
  }
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='repository'
    />
  )
  await view.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/github/repositories/123/ai-reviews/review/cancel',
    {}
  )
})
it('suppresses stale history after permission or transport failure', async () => {
  state.reviews = { isError: true, data: { enabled: true, reviews: [review] } }
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='repository'
    />
  )
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Review history unavailable.')
  await expect
    .element(view.getByText('Missing secret scan evidence'))
    .not.toBeInTheDocument()
})
it('paginates history and hides review requests from viewers', async () => {
  state.role = 'VIEWER'
  state.reviews = {
    data: {
      enabled: true,
      reviews: Array.from({ length: 6 }, (_, i) => ({
        ...review,
        id: `r${i}`,
        checks: [{ ...check, title: `Skill ${i}` }],
      })),
    },
  }
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='repository'
    />
  )
  await expect
    .element(view.getByRole('button', { name: 'Run review' }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByText('Skill 5 · skill v1', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Skill 0 · skill v1', { exact: true }))
    .not.toBeInTheDocument()
})

it('shares PR changes only when explicitly requested', async () => {
  state.reviews = {
    data: {
      enabled: true,
      checks: [{ ...check, stages: ['pull_request'] }],
      reviews: [],
    },
  }
  const view = await render(
    <SkillReviewPanel
      repositoryId='123'
      assessmentId='assessment'
      stage='pull_request'
    />
  )
  await view
    .getByRole('checkbox', { name: 'Evidence review · skill v1' })
    .click()
  await view.getByRole('checkbox', { name: /Include PR changes/ }).click()
  await view.getByRole('button', { name: 'Run review' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/github/repositories/123/ai-reviews',
    {
      assessmentId: 'assessment',
      checkIds: ['check'],
      includeSource: true,
    }
  )
})
