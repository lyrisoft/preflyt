import '@/styles/index.css'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { BranchCoverageCard } from './branch-coverage-card'
import type { HealthData } from './health-api'

const sha = 'a'.repeat(40)
const result: NonNullable<HealthData['ciCoverage']> = {
  state: 'VERIFIED',
  reason: 'CI_COVERAGE_VERIFIED',
  sourceSha: sha,
  measurement: { analyzedFiles: 1, analyzedLines: 2, coveredLines: 1 },
  runUrl: 'https://github.com/org/repo/actions/runs/12/attempts/1',
  receivedAt: '2026-10-18T08:00:00Z',
}
const attempt = {
  state: 'PENDING',
  sourceSha: 'b'.repeat(40),
  failureCode: 'GITHUB_RATE_LIMITED',
  retryAt: '2026-10-18T09:00:00Z',
  createdAt: '2026-10-18T08:30:00Z',
  finishedAt: null,
  runUrl: 'https://github.com/org/repo/actions/runs/13/attempts/1',
}
it('shows verified branch coverage before a Health result exists', async () => {
  const view = await render(
    <BranchCoverageCard
      branch='main'
      healthSha={null}
      coverage={{
        branch: 'main',
        result,
        matchesHealth: false,
        latestAttempt: null,
      }}
    />
  )
  await expect.element(view.getByText('50.0%', { exact: true })).toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'View coverage run' }))
    .toHaveAttribute('href', result.runUrl!)
})
it('keeps earlier coverage visible while the latest report waits for GitHub', async () => {
  const view = await render(
    <BranchCoverageCard
      branch='main'
      healthSha={'c'.repeat(40)}
      coverage={{
        branch: 'main',
        result,
        matchesHealth: false,
        latestAttempt: attempt,
      }}
    />
  )
  await expect.element(view.getByText('50.0%', { exact: true })).toBeVisible()
  await expect
    .element(view.getByText('Earlier commit', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Updating', { exact: true }))
    .toHaveClass('text-info-text')
  await expect
    .element(
      view.getByText('Coverage and Health describe different commits.', {
        exact: false,
      })
    )
    .toBeVisible()
  await expect
    .element(view.getByText('Next verification attempt:', { exact: false }))
    .toBeVisible()
})
it('preserves earlier coverage after a failed update without calling it current', async () => {
  const view = await render(
    <BranchCoverageCard
      branch='main'
      healthSha={sha}
      coverage={{
        branch: 'main',
        result,
        matchesHealth: true,
        latestAttempt: {
          ...attempt,
          state: 'FAILED',
          failureCode: 'REPORT_JOB_FAILED',
        },
      }}
    />
  )
  await expect.element(view.getByText('50.0%', { exact: true })).toBeVisible()
  await expect
    .element(view.getByText('Update failed', { exact: true }))
    .toHaveClass('text-danger-text')
})
it('does not display a percentage from an unverified report', async () => {
  const view = await render(
    <BranchCoverageCard
      branch='main'
      healthSha={sha}
      exact={{ ...result, state: 'UNVERIFIED', reason: 'CI_REPORT_UNVERIFIED' }}
    />
  )
  await expect
    .element(view.getByText('Source not verified', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('50.0%', { exact: true }))
    .not.toBeInTheDocument()
})

it.each([true, false])(
  'shows compact test coverage beside the summary metrics without inventing missing coverage: %s',
  async (verified) => {
    const view = await render(
      <BranchCoverageCard
        compact
        branch='main'
        healthSha={sha}
        exact={verified ? result : undefined}
      />
    )
    await expect
      .element(view.getByText('Test coverage', { exact: true }))
      .toBeVisible()
    await expect
      .element(view.getByText(verified ? '50.0%' : '—', { exact: true }))
      .toBeVisible()
    await expect
      .element(
        view.getByText(
          verified ? 'Verified CI coverage' : 'Coverage not received',
          { exact: true }
        )
      )
      .toBeVisible()
    if (!verified)
      await expect
        .element(view.getByText('0.0%', { exact: true }))
        .not.toBeInTheDocument()
  }
)
