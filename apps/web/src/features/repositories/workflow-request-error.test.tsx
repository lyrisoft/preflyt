import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { workflowRefreshInterval } from './workflow-refresh-polling'
import { WorkflowRequestError } from './workflow-request-error'

it('shows the server retry instant and blocks retries until the cooldown expires', async () => {
  const retry = vi.fn()
  const retryAt = new Date(Date.now() + 1100).toISOString()
  const view = await render(
    <WorkflowRequestError
      error={Object.assign(new Error('paused'), {
        code: 'GITHUB_RATE_LIMITED',
        retryAt,
      })}
      retry={retry}
    />
  )
  expect(view.container.querySelector('time')?.dateTime).toBe(retryAt)
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeDisabled()
  expect(retry).not.toHaveBeenCalled()
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeEnabled()
  await view.getByRole('button', { name: 'Retry' }).click()
  expect(retry).toHaveBeenCalledTimes(1)
})

it('preserves ordinary errors and their recovery action', async () => {
  const view = await render(
    <WorkflowRequestError
      error={new Error('Policy branch main was not found.')}
      retry={() => {}}
      label='Reload workflow'
    />
  )
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Policy branch main was not found.')
  await expect
    .element(view.getByRole('button', { name: 'Reload workflow' }))
    .toBeEnabled()
  expect(view.container.querySelector('time')).toBeNull()
})

it('allows an immediate retry for an expired cooldown', async () => {
  const view = await render(
    <WorkflowRequestError
      error={Object.assign(new Error('paused'), {
        code: 'GITHUB_RATE_LIMITED',
        retryAt: '2020-01-01T00:00:00.000Z',
      })}
      retry={() => {}}
    />
  )
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('You can retry now.')
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeEnabled()
})

it('shows queued synchronization with its retry time without calling it a rate limit', async () => {
  const view = await render(
    <WorkflowRequestError
      error={Object.assign(new Error('GitHub data is being synchronized.'), {
        code: 'GITHUB_SYNC_PENDING',
        retryAt: new Date(Date.now() + 60000).toISOString(),
      })}
      retry={() => {}}
    />
  )
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('GitHub data is being synchronized.')
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeDisabled()
  expect(view.container.textContent).not.toContain('limiting requests')
})

it.each([
  ['GITHUB_SYNC_STALLED', 'Background refresh is delayed'],
  ['GITHUB_SYNC_FAILED', 'GitHub refresh failed'],
])(
  'shows %s distinctly and describes automatic recovery',
  async (code, heading) => {
    const view = await render(
      <WorkflowRequestError
        automatic
        error={Object.assign(
          new Error('Ask your administrator to check the worker.'),
          { code, retryAt: new Date(Date.now() + 60000).toISOString() }
        )}
        retry={() => {}}
      />
    )
    await expect.element(view.getByRole('alert')).toHaveTextContent(heading)
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('Next automatic check:')
    expect(view.container.querySelector('.animate-spin')).toBeNull()
  }
)

it('polls only retryable reads with valid deadlines and bounds expired deadlines', () => {
  expect(workflowRefreshInterval(null)).toBe(false)
  expect(
    workflowRefreshInterval(
      Object.assign(new Error('denied'), {
        code: 'FORBIDDEN',
        retryAt: new Date().toISOString(),
      })
    )
  ).toBe(false)
  expect(
    workflowRefreshInterval(
      Object.assign(new Error('pending'), {
        code: 'GITHUB_SYNC_PENDING',
        retryAt: 'invalid',
      })
    )
  ).toBe(false)
  expect(
    workflowRefreshInterval(
      Object.assign(new Error('pending'), {
        code: 'GITHUB_SYNC_PENDING',
        retryAt: '2020-01-01T00:00:00Z',
      })
    )
  ).toBe(1000)
  const delay = workflowRefreshInterval(
    Object.assign(new Error('paused'), {
      code: 'GITHUB_RATE_LIMITED',
      retryAt: new Date(Date.now() + 60000).toISOString(),
    })
  )
  expect(delay).toBeGreaterThan(59000)
})
