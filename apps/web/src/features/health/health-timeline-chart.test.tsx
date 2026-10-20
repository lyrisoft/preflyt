import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { HealthTimelinePoint } from './health-api'
import { HealthTimelineChart } from './health-timeline-chart'

const points: HealthTimelinePoint[] = Array.from({ length: 4 }, (_, i) => ({
  id: `scan-${i}`,
  sourceSha: String(i).repeat(40),
  at: new Date(Date.UTC(2026, 9, 18, 18, i)).toISOString(),
  findings: 100 + i,
  partial: i === 2,
  comparableFindings: null,
  categories: {
    security: {
      findings: 10 + i,
      partial: i === 2,
      comparisonKey: i === 2 ? null : 'same',
      bySeverity: { critical: 1, high: 3, medium: 2, low: 4 + i, unknown: 0 },
      remediation:
        i === 2
          ? { status: 'PARTIAL' }
          : i === 0
            ? { status: 'BASELINE' }
            : {
                status: 'COMPARED',
                remaining: 10 + i,
                introduced: 1,
                noLongerReported: 0,
                previousAssessmentId: `scan-${i - 1}`,
                previousSourceSha: String(i - 1).repeat(40),
              },
    },
    reliability:
      i === 3
        ? null
        : {
            findings: 2 + i,
            partial: false,
            comparisonKey: 'reliability',
            bySeverity: { high: 2 + i },
          },
    maintainability: null,
  },
}))
it('shows severity stacks for each category without joining scans', async () => {
  await render(
    <HealthTimelineChart
      points={points}
      branch='main'
      onSelectReport={() => {}}
    />
  )
  await expect
    .element(page.getByText('13', { exact: true }).first())
    .toBeVisible()
  await expect
    .poll(() => document.querySelectorAll('[data-severity="critical"]').length)
    .toBe(4)
  expect(document.querySelector('.recharts-line-curve')).toBeNull()
  await page.getByRole('tab', { name: 'Reliability' }).click()
  await expect
    .element(page.getByText('4', { exact: true }).first())
    .toBeVisible()
  await expect
    .element(page.getByText('3 scans · Oldest to newest'))
    .toBeVisible()
  await page.getByRole('tab', { name: 'Maintainability' }).click()
  await expect
    .element(page.getByText('No recorded results to chart'))
    .toBeVisible()
})
it('opens the exact report with pointer and keyboard', async () => {
  const select = vi.fn()
  await render(
    <HealthTimelineChart
      points={points}
      branch='main'
      onSelectReport={select}
    />
  )
  const dot = page
    .getByRole('button', { name: /Open scan.*13 findings/ })
    .first()
  await dot.click()
  expect(select).toHaveBeenLastCalledWith('scan-3')
  dot.element().focus()
  await userEvent.keyboard('{Enter}')
  expect(select).toHaveBeenCalledTimes(2)
  await page.getByText('View chart data', { exact: true }).click()
  await page
    .getByRole('button', { name: /Open scan.*10 findings/ })
    .last()
    .click()
  expect(select).toHaveBeenLastCalledWith('scan-0')
})
it('keeps zero separate from missing results', async () => {
  const view = await render(
    <HealthTimelineChart
      points={[
        {
          ...points[0],
          categories: {
            security: { findings: 0, partial: false, comparisonKey: 'x' },
          },
        },
      ]}
      branch='main'
      onSelectReport={() => {}}
    />
  )
  await expect
    .element(page.getByRole('group', { name: /Security over/ }))
    .toHaveAttribute(
      'aria-label',
      'Security over 1 scans. Finding counts: 0. Select a column to open its assessment.'
    )
  await view.unmount()
  await render(
    <HealthTimelineChart points={[]} branch='main' onSelectReport={() => {}} />
  )
  await expect
    .element(page.getByText('No recorded results to chart'))
    .toBeVisible()
})
it('shows remaining findings decreasing with comparable remediation and preserves exact report navigation', async () => {
  const select = vi.fn()
  const history = [12, 7, 0].map((count, i): HealthTimelinePoint => ({
    ...points[i],
    findings: count,
    partial: false,
    categories: {
      security: {
        findings: count,
        partial: false,
        comparisonKey: 'same',
        bySeverity: { high: count },
        remediation:
          i === 0
            ? { status: 'BASELINE' }
            : {
                status: 'COMPARED',
                remaining: count,
                introduced: 0,
                noLongerReported: i === 1 ? 5 : 7,
                previousAssessmentId: points[i - 1].id,
                previousSourceSha: points[i - 1].sourceSha,
              },
      },
    },
  }))
  await render(
    <HealthTimelineChart
      points={history}
      branch='main'
      onSelectReport={select}
    />
  )
  await expect
    .element(page.getByLabelText('Latest remediation'))
    .toHaveTextContent(
      '0 scanner findings remaining · 0 new · 7 no longer reported since 1111111'
    )
  await expect
    .element(page.getByRole('group', { name: /Security over/ }))
    .toHaveAttribute(
      'aria-label',
      expect.stringContaining('Finding counts: 12, 7, 0')
    )
  await page.getByText('View chart data', { exact: true }).click()
  await expect
    .element(
      page.getByText(
        /7 scanner findings remaining · 0 new · 5 no longer reported/
      )
    )
    .toBeVisible()
  await page
    .getByRole('button', { name: /Open scan.*0 findings/ })
    .last()
    .click()
  expect(select).toHaveBeenLastCalledWith('scan-2')
})
it.each(['PARTIAL', 'SCOPE_CHANGED', 'AI_REVIEW'] as const)(
  'does not present %s counts as fixes',
  async (status) => {
    await render(
      <HealthTimelineChart
        points={[
          {
            ...points[0],
            categories: {
              security: {
                findings: 0,
                partial: status === 'PARTIAL',
                comparisonKey: null,
                remediation: { status },
              },
            },
          },
        ]}
        branch='main'
        onSelectReport={() => {}}
      />
    )
    const notice = page.getByLabelText('Latest remediation')
    await expect.element(notice).not.toHaveTextContent('no longer reported')
    await expect
      .element(notice)
      .toHaveTextContent(
        status === 'PARTIAL'
          ? 'fixes are unverified'
          : status === 'SCOPE_CHANGED'
            ? 'no fixes are credited'
            : 'do not verify fixes'
      )
    if (status === 'PARTIAL')
      await expect
        .element(
          page.getByText(/A lower partial count may reflect missing analysis/)
        )
        .toBeVisible()
  }
)
it('preserves category controls and report actions at 320px in both themes', async () => {
  await render(
    <div className='bg-background p-4 text-foreground'>
      <HealthTimelineChart
        points={points}
        branch='main'
        onSelectReport={() => {}}
      />
    </div>
  )
  for (const width of [1280, 320]) {
    await page.viewport(width, 800)
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      await new Promise((resolve) => setTimeout(resolve, 350))
      await expect
        .element(page.getByRole('tab', { name: 'Maintainability' }))
        .toBeVisible()
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `__screenshots__/preflyt-stacked-history-${width}-${dark ? 'dark' : 'light'}.png`,
      })
    }
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
