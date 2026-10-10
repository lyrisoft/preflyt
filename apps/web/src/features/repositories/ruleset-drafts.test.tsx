import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { RulesetDrafts } from './ruleset-drafts'

const query = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => query.value,
}))
const render = (canDraft = false) =>
  renderToStaticMarkup(
    <RulesetDrafts
      repositoryId='51'
      repositoryName='fixture/repo'
      actorId='viewer'
      canDraft={canDraft}
    />
  )
beforeEach(() => {
  query.value = {
    isPending: false,
    isError: false,
    data: {
      drafts: [
        {
          id: 'draft-1',
          name: 'Development protection',
          profile: 'STANDARD',
          options: { branches: ['development'] },
          revision: 1,
          selectionId: 'old',
          updatedAt: '2026-10-09T12:00:00Z',
        },
      ],
      selection: { id: 'new' },
      hasMore: true,
    },
  }
})
it('shows draft review and standards changes to readers, while hiding write actions', () => {
  const html = render()
  expect(html).toContain('Development protection')
  expect(html).toContain('Standards changed')
  expect(html).toContain('View')
  expect(html).toContain('Next')
  expect(html).not.toContain('New draft')
  expect(html).not.toContain('>Edit<')
  expect(render(true)).toContain('New draft')
  expect(render(true)).toContain('>Edit<')
})
it('hides previously loaded rows on permission errors and explains empty data', () => {
  query.value = {
    ...query.value,
    isError: true,
    error: new Error('Repository access changed.'),
  }
  expect(render()).toContain('Repository access changed.')
  expect(render()).not.toContain('Development protection')
  query.value = {
    isPending: false,
    isError: false,
    data: { drafts: [], selection: null, hasMore: false },
  }
  expect(render()).toContain('No ruleset drafts yet')
  expect(render()).toContain('A policy manager can create a draft')
})
