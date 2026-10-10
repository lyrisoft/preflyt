import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
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

it('keeps configuration fields and secret controls within the mobile layout', async () => {
  const visualData = {
    ...data,
    fields: [
      {
        key: 'GITHUB_APP_ID',
        label: 'App ID',
        group: 'GitHub',
        kind: 'number',
        configured: true,
        value: '123456',
        restart: true,
      },
      {
        key: 'GITHUB_APP_CLIENT_ID',
        label: 'Client ID',
        group: 'GitHub',
        kind: 'text',
        configured: true,
        value: 'Iv1.example',
        restart: true,
      },
      {
        key: 'GITHUB_APP_CLIENT_SECRET',
        label: 'Client secret',
        group: 'GitHub',
        kind: 'secret',
        configured: true,
        value: '',
        restart: true,
      },
      {
        key: 'GITHUB_WEBHOOK_SECRET',
        label: 'Webhook secret',
        group: 'GitHub',
        kind: 'secret',
        configured: true,
        value: '',
        restart: true,
      },
      {
        key: 'GITHUB_APP_PRIVATE_KEY',
        label: 'Private key',
        group: 'GitHub',
        kind: 'secret',
        configured: true,
        value: '',
        restart: true,
      },
      {
        key: 'GITHUB_LOGIN_CALLBACK_URL',
        label: 'Login callback URL',
        group: 'GitHub',
        kind: 'url',
        configured: true,
        value: 'https://preflyt.example.com/auth/github/callback',
        restart: true,
      },
      {
        key: 'GITHUB_LOGIN_ENABLED',
        label: 'GitHub sign-in',
        group: 'GitHub',
        kind: 'boolean',
        configured: false,
        value: 'true',
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
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(visualData)))
  )
  await page.viewport(1440, 1000)
  const view = await mount()
  await expect.element(view.getByLabelText('App ID')).toBeVisible()
  try {
    for (const mobile of [false, true]) {
      await page.viewport(mobile ? 390 : 1440, mobile ? 844 : 1000)
      for (const dark of [false, true]) {
        if (mobile) await page.viewport(390, 844)
        document.documentElement.classList.toggle('dark', dark)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            )
            .map((animation) => animation.finished.catch(() => undefined))
        )
        await expect
          .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
          .toBe(true)
        if (mobile) {
          // Extend the fixture frame after checking the phone viewport so Playwright
          // captures the complete narrow layout without iframe clipping.
          await page.viewport(
            390,
            Math.max(844, document.documentElement.scrollHeight)
          )
        }
        await page.screenshot({
          path: `__screenshots__/configuration-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}.png`,
        })
      }
    }
  } finally {
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})
