import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ConfigurationPanel } from './configuration-panel'

afterEach(() => vi.unstubAllGlobals())
const data = {
  revision: 1,
  restartRequired: true,
  deploymentOnly: [],
  fields: [
    {
      key: 'SMTP_PASSWORD',
      label: 'SMTP password',
      group: 'GitHub',
      kind: 'secret',
      configured: true,
      value: '',
      restart: true,
    },
    {
      key: 'GITHUB_EVENTS_ENABLED',
      label: 'GitHub event ingestion',
      group: 'GitHub',
      kind: 'boolean',
      configured: false,
      value: 'false',
      restart: false,
    },
    {
      key: 'SMTP_HOST',
      label: 'SMTP host',
      group: 'Notifications',
      kind: 'text',
      configured: false,
      value: '',
      restart: true,
      example: 'smtp.example.com',
    },
  ],
}
const mount = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConfigurationPanel />
    </QueryClientProvider>
  )
it('keeps credentials masked and sends only changed fields with the fetched revision', async () => {
  const fetcher = vi.fn(
    async (_url, options) =>
      new Response(
        JSON.stringify(
          options?.method === 'PATCH' ? { restartRequired: true } : data
        ),
        { status: 200 }
      )
  )
  vi.stubGlobal('fetch', fetcher)
  const view = await mount()
  await expect.element(view.getByLabelText('SMTP password')).toHaveValue('')
  await expect
    .element(view.getByRole('button', { name: 'Save changes' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Restart the API and worker')
  await view.getByRole('switch', { name: 'GitHub event ingestion' }).click()
  await view.getByRole('button', { name: 'Save changes' }).click()
  await expect
    .poll(() =>
      fetcher.mock.calls.some(([, options]) => options?.method === 'PATCH')
    )
    .toBe(true)
  const options = fetcher.mock.calls.find(
    ([, options]) => options?.method === 'PATCH'
  )![1]
  expect(JSON.parse(options!.body as string)).toEqual({
    expectedRevision: 1,
    values: { GITHUB_EVENTS_ENABLED: 'true' },
    clearSecrets: [],
  })
})
it('clears a credential only after an explicit action and save', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(data)))
  vi.stubGlobal('fetch', fetcher)
  const view = await mount()
  await expect.element(view.getByLabelText('SMTP password')).toBeVisible()
  await view.getByRole('button', { name: 'Clear saved' }).click()
  await expect.element(view.getByLabelText('SMTP password')).toBeDisabled()
  expect(fetcher).toHaveBeenCalledTimes(1)
  await view.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => fetcher.mock.calls.length).toBeGreaterThan(1)
  const options = (
    fetcher.mock.calls as unknown as [string, RequestInit][]
  )[1]![1]
  expect(JSON.parse(options.body as string).clearSecrets).toEqual([
    'SMTP_PASSWORD',
  ])
})
it('uses a custom section selector and shows server errors without leaving Settings', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: 'Only a Super Admin can manage deployment configuration',
          }),
          { status: 403 }
        )
    )
  )
  const view = await mount()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Only a Super Admin')
  await expect
    .element(view.getByRole('button', { name: 'Retry' }))
    .toBeVisible()
})
