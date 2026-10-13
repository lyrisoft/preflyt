import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleServerError } from './handle-server-error'

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}))

beforeEach(() => {
  vi.mocked(toastError).mockClear()
})

describe('handleServerError', () => {
  it('shows the message from a fetch error', () => {
    handleServerError(new Error('network'))

    expect(toastError).toHaveBeenCalledWith('network')
  })

  it('maps a plain object with status 204 to the no-content message', () => {
    handleServerError({ status: 204 })

    expect(toastError).toHaveBeenCalledWith('No content.')
  })

  it('prefers the API title when the error is an Axios error with response data', () => {
    const error = new AxiosError('Bad request')
    error.response = {
      status: 422,
      data: { title: 'Validation failed' },
    } as AxiosError['response']

    handleServerError(error)

    expect(toastError).toHaveBeenCalledWith('Validation failed')
  })

  it('falls back to the generic message when Axios response has no data.title', () => {
    const error = new AxiosError('Request failed')
    error.response = {
      status: 500,
      data: {},
    } as AxiosError['response']

    handleServerError(error)

    expect(toastError).toHaveBeenCalledWith('Request failed')
  })

  it('falls back to the generic message when Axios data.title is an empty string', () => {
    const error = new AxiosError('Bad request')
    error.response = {
      status: 400,
      data: { title: '' },
    } as AxiosError['response']

    handleServerError(error)

    expect(toastError).toHaveBeenCalledWith('Bad request')
  })

  it('logs the error to the console in development', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = new Error('logged')

    handleServerError(err)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(err)

    log.mockRestore()
  })

  it('does not log the error to the console in production', () => {
    vi.stubEnv('DEV', false)

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = new Error('not logged')

    handleServerError(err)

    expect(log).not.toHaveBeenCalled()

    log.mockRestore()
  })
})

it('prefers actionable API messages over transport errors', () => {
  const error = new AxiosError('Request failed')
  error.response = {
    status: 403,
    data: { message: 'Repository access is unavailable' },
  } as AxiosError['response']
  handleServerError(error)
  expect(toastError).toHaveBeenLastCalledWith(
    'Repository access is unavailable'
  )
})
it('uses a safe fallback for unknown errors', () => {
  handleServerError(null)
  expect(toastError).toHaveBeenLastCalledWith(
    'Something went wrong. Try again.'
  )
})

it('deduplicates repeated background failures by query', () => {
  handleServerError(new Error('Refresh failed'), { id: 'query-error:teams' })
  expect(toastError).toHaveBeenLastCalledWith('Refresh failed', {
    id: 'query-error:teams',
  })
})

it('does not notify intentional request cancellation', () => {
  handleServerError(new DOMException('Cancelled', 'AbortError'))
  expect(toastError).not.toHaveBeenCalled()
})
