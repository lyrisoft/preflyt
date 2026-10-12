import { AxiosError } from 'axios'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { AppProviders } from './app-providers'
// Generated Routes
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // eslint-disable-next-line no-console
          if (import.meta.env.DEV) console.log({ failureCount, error })

          if (failureCount >= 0 && import.meta.env.DEV) return false
          if (failureCount > 3 && import.meta.env.PROD) return false

          return !(
            error instanceof AxiosError &&
            [401, 403].includes(error.response?.status ?? 0)
          )
        },
        refetchOnWindowFocus: import.meta.env.PROD,
        staleTime: 10 * 1000, // 10s
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.options.onError && mutation.meta?.silent !== true)
          handleServerError(error)
      },
      onSuccess: (_data, _variables, _context, mutation) => {
        if (typeof mutation.meta?.successMessage === 'string')
          toast.success(mutation.meta.successMessage)
      },
    }),
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Initial failures remain visible in the page; notify failed background refreshes.
        if (
          query.state.data !== undefined &&
          query.meta?.silent !== true &&
          !(error instanceof AxiosError && error.response?.status === 401)
        )
          handleServerError(error, { id: `query-error:${query.queryHash}` })
        if (error instanceof AxiosError) {
          if (error.response?.status === 401) {
            toast.error('Session expired. Sign in again.', {
              id: 'session-expired',
            })
            const redirect = `${router.history.location.href}`
            router.navigate({ to: '/sign-in', search: { redirect } })
          }
          if (error.response?.status === 500) {
            if (query.state.data === undefined)
              toast.error(
                'The server could not complete the request. Try again.',
                { id: 'server-error' }
              )
            // Only navigate to error page in production to avoid disrupting HMR in development
            if (import.meta.env.PROD) {
              router.navigate({ to: '/500' })
            }
          }
          if (error.response?.status === 403) {
            // router.navigate("/forbidden", { replace: true });
          }
        }
      },
    }),
  })

  // Create a new router instance
  const router = createRouter({
    routeTree,
    Wrap: ({ children }) => (
      <AppProviders queryClient={queryClient}>{children}</AppProviders>
    ),
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
