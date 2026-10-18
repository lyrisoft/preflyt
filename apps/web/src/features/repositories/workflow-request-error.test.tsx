import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
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
