import '@/styles/index.css'
import { GitBranch } from 'lucide-react'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PageHeader } from './page-header'
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
