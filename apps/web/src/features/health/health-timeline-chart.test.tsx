import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { HealthTimelineChart } from './health-timeline-chart'

it('keeps partial observations visible and breaks comparison across an incompatible scan', async () => {
  await page.viewport(1280, 800)
  const select = vi.fn()
  const points = [
    {
      id: 'a',
      sourceSha: 'a'.repeat(40),
      at: '2026-10-14T10:00:00Z',
      findings: 12,
      partial: true,
      comparableFindings: 3,
      checkIds: ['quality.maintainability'],
    },
    {
      id: 'b',
      sourceSha: 'b'.repeat(40),
      at: '2026-10-14T11:00:00Z',
      findings: 20,
      partial: true,
      comparableFindings: null,
    },
    {
      id: 'c',
      sourceSha: 'c'.repeat(40),
      at: '2026-10-14T12:00:00Z',
      findings: 8,
      partial: false,
      comparableFindings: 2,
      checkIds: ['quality.maintainability'],
    },
  ]
  await render(
    <HealthTimelineChart
      points={points}
      branch='main'
      onSelectReport={select}
    />
  )
  await expect
    .element(
      page.getByText(
        '2 of 3 scans have incomplete coverage. Counts may increase when analysis completes.'
      )
    )
    .toBeVisible()
  await expect
    .poll(() => document.querySelectorAll('.recharts-bar-rectangle').length)
    .toBe(3)
  // Two comparable points separated by an incompatible scope must not form a line.
  expect(
    document.querySelector('.recharts-line-curve')?.getAttribute('d')
  ).not.toMatch(/[LC]/)
  expect(
    document
      .querySelector('.recharts-line-curve')
      ?.getAttribute('d')
      ?.match(/M/g)
  ).toHaveLength(2)
  await page.getByText('View chart data', { exact: true }).click()
  await expect
    .element(page.getByRole('cell', { name: '-', exact: true }))
    .toBeVisible()
  await page.getByRole('button', { name: 'Open health report bbbbbbb' }).click()
  expect(select).toHaveBeenCalledWith('b')
  await page.screenshot({
    path: '__screenshots__/preflyt-partial-chart-desktop.png',
  })
  await page.viewport(320, 900)
  await expect
    .poll(() => {
      const bars = [
        ...document.querySelectorAll('.recharts-bar-rectangle path'),
      ].map((bar) => bar.getBoundingClientRect())
      return (
        bars.length === 3 &&
        bars.every((bar) => bar.right <= 320) &&
        bars[1].right + 20 < bars[2].left
      )
    })
    .toBe(true)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    // Let the shared 280ms chart transition settle before visual capture.
    await new Promise((resolve) => setTimeout(resolve, 400))
    await page.screenshot({
      path: `__screenshots__/preflyt-partial-chart-final-${theme}.png`,
    })
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await expect
      .element(page.getByRole('region', { name: 'Findings over time' }))
      .toBeVisible()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
