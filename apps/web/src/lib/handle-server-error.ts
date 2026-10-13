import { AxiosError } from 'axios'
import { toast } from 'sonner'

export function handleServerError(error: unknown, options?: { id: string }) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  let errMsg =
    error instanceof Error && error.message
      ? error.message
      : 'Something went wrong. Try again.'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'No content.'
  }

  if (error instanceof AxiosError) {
    const title = error.response?.data?.message ?? error.response?.data?.title
    if (typeof title === 'string' && title.length > 0) {
      errMsg = title
    }
  }

  if (error instanceof Error && error.name === 'AbortError') return

  if (options) toast.error(errMsg, options)
  else toast.error(errMsg)
}
