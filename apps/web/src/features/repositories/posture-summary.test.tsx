import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PostureSummary } from './posture-summary'

vi.mock('./repository-queries', () => ({
  useStandards: () => ({
    isPending: false,
    isError: false,
    data: {
      selectionIntegrity: true,
      selection: { revision: 3 },
      profileSnapshot: { sourceSha: 'a'.repeat(40) },
      controls: ['build.required', 'types.required'].map((id) => ({
        id,
        required: true,
        configuration: 'NOT_INSPECTED',
      })),
    },
  }),
  useCiEvidence: () => ({
    isPending: false,
    isError: false,
    data: { enabled: true, observations: [] },
  }),
  useAssessmentList: () => ({
    isPending: false,
    isError: false,
    data: { assessments: [] },
  }),
}))

it('shows CI-only checks separately in charts and routes the legend to CI checks', async () => {
  const onFilter = vi.fn()
  const view = await render(
    <PostureSummary
      repositoryId='101'
      profile={null}
      filter='all'
      onFilter={onFilter}
      onOpenTab={vi.fn()}
    />
  )
  await expect
    .element(page.getByText('2 checks require CI evidence'))
    .toBeVisible()
  await expect
    .element(
      page.getByRole('img', {
        name: 'Files found: 0, Configuration not determined: 0, Not found: 0, CI evidence required: 2',
        exact: true,
      })
    )
    .toBeVisible()
  await expect
    .element(
      page.getByRole('img', {
        name: /Required: 0 found, 0 configuration not determined, 0 not found, 2 require CI evidence/,
      })
    )
    .toBeVisible()
  await page
    .getByRole('button', { name: 'CI evidence required 2', exact: true })
    .click()
  expect(onFilter).toHaveBeenCalledWith('ci')
  await view.unmount()
})
