import {
  createRequestHandler,
  renderRouterToString,
  RouterServer,
} from '@tanstack/react-router/ssr/server'
import { createAppRouter } from './app'

export { publicPages } from './features/marketing/public-pages'

export async function renderPublicPage(path = '/') {
  const handler = createRequestHandler({
    request: new Request(new URL(path, 'http://prerender.preflyt.invalid')),
    createRouter: createAppRouter,
  })
  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: (
        <div id='root' data-prerendered='true'>
          <RouterServer router={router} />
        </div>
      ),
    })
  )
  if (!response.ok)
    throw new Error(`Public page rendering failed: ${response.status}`)
  return (await response.text()).replace(/^<!DOCTYPE html>/i, '')
}
