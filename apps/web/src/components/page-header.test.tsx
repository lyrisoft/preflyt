import '@/styles/index.css'
import { GitBranch } from 'lucide-react'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { ContributorActivitySummary } from '@/features/contributors/contributor-activity-summary'
import { PageHeader } from './page-header'
import { StatusBadge } from './status-badge'
import { Button } from './ui/button'

it('wraps wide desktop filters before squeezing the page title at tablet widths', async () => {
  await page.viewport(768, 900)
  const view = await render(
    <main className='w-full max-w-[640px] p-4'>
      <PageHeader
        title='Engineering Overview'
        description='Review repository evidence and assessment activity.'
        section='Workspace'
        icon={GitBranch}
        actions={
          <>
            <Button variant='outline' className='w-56'>
              All repositories
            </Button>
            <Button variant='outline' className='w-56'>
              Last 6 months
            </Button>
          </>
        }
      />
    </main>
  )
  const heading = view.getByRole('heading', { name: 'Engineering Overview' })
  await expect.element(heading).toBeVisible()
  expect(heading.element().getBoundingClientRect().width).toBeGreaterThan(240)
  await expect
    .element(view.getByRole('button', { name: 'All repositories' }))
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  )
  await page.viewport(1280, 900)
})

it('keeps long repository names and actions usable at 320px', async () => {
  await page.viewport(320, 900)
  const view = await render(
    <main className='p-4'>
      <PageHeader
        title='organization/customer-verification-service'
        icon={GitBranch}
        actions={<Button variant='outline'>Manage repositories</Button>}
      />
    </main>
  )
  await expect
    .element(
      view.getByRole('heading', {
        name: 'organization/customer-verification-service',
      })
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Manage repositories' }))
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  )
  await page.viewport(1280, 900)
})

it('places beta beside the title while keeping the heading name and mobile layout', async () => {
  await page.viewport(320, 900)
  const view = await render(
    <main className='p-4'>
      <PageHeader
        title='AI Intelligence'
        icon={GitBranch}
        titleBadge={<StatusBadge tone='warning'>beta</StatusBadge>}
      />
    </main>
  )
  const heading = view.getByRole('heading', {
    name: 'AI Intelligence',
    exact: true,
  })
  await expect.element(heading).toBeVisible()
  await expect
    .element(view.getByText('beta'))
    .toHaveClass('italic', 'text-yellow-700')
  expect(heading.element().parentElement).toBe(
    view.getByText('beta').element().parentElement
  )
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  )
  await page.viewport(1280, 900)
})

it('scales operational headings, chart captions and compact status text with root text size', async () => {
  await page.viewport(640, 900)
  const view = await render(
    <main className='p-4'>
      <PageHeader
        title='Repository health'
        section='Workspace'
        icon={GitBranch}
        titleBadge={
          <StatusBadge compact tone='success'>
            Healthy
          </StatusBadge>
        }
      />
      <ContributorActivitySummary
        allowed
        series={[
          {
            date: '2026-10-20',
            authoredPrs: 2,
            mergedPrs: 1,
            reviews: 3,
            commits: 4,
          },
        ]}
        metrics={{ authoredPrs: 2, mergedPrs: 1, reviews: 3, commits: 4 }}
      />
    </main>
  )
  try {
    const section = view.getByText('Workspace', { exact: true }).element()
    const badge = view.getByText('Healthy', { exact: true }).element()
    const legend = view
      .getByText('Authored PRs', { exact: true })
      .first()
      .element()
    for (const [size, expected] of [
      ['100%', '12px'],
      ['200%', '24px'],
    ]) {
      document.documentElement.style.fontSize = size
      for (const element of [section, badge, legend])
        expect(getComputedStyle(element).fontSize).toBe(expected)
      await expect
        .poll(() =>
          document.querySelector('.recharts-cartesian-axis-tick-value')
        )
        .not.toBeNull()
      expect(
        getComputedStyle(
          document.querySelector('.recharts-cartesian-axis-tick-value')!
        ).fontSize
      ).toBe(expected)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(640)
      if (size === '200%')
        await page.screenshot({
          element: view
            .getByRole('img', {
              name: 'Daily authored PRs, merged PRs, recorded reviews and attributed commits',
            })
            .element(),
          path: '__screenshots__/metadata-scaled-200-percent.png',
        })
    }
  } finally {
    document.documentElement.style.fontSize = ''
    await page.viewport(1280, 900)
  }
})
