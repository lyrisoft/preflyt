import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cable,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import {
  useNavigationSession,
  canAdminister,
} from '../workspace/navigation-session'

type Endpoint = {
  id: string
  name: string
  baseUrl: string
  locality: string
  requiresKey: boolean
  models: string[]
}
type Provider = {
  id: string
  name: string
  endpointId: string
  modelId: string
  enabled: boolean
  revision: number
  testStatus: string
  apiKeySet: boolean
}
type StageRoute = {
  stage: string
  primaryId: string | null
  fallbackId: string | null
  enabled: boolean
  allowSource: boolean
  maxInputTokens: number
  maxOutputTokens: number
  dailyBudgetCents: number
  revision: number
}
type Configuration = {
  enabled: boolean
  executionAvailable: boolean
  endpoints: Endpoint[]
  providers: Provider[]
  routes: StageRoute[]
  stages: string[]
}
const stageName = (stage: string) =>
  ({
    laptop: 'Local development',
    repository: 'Repository',
    pull_request: 'Pull requests',
    qa: 'QA',
    performance: 'Performance',
    production: 'Production',
  })[stage] ?? stage
const testName = (status: string) =>
  ({
    NOT_TESTED: 'Not tested',
    CONNECTED: 'Connection tested',
    AUTH_REJECTED: 'Key rejected',
    MODEL_UNAVAILABLE: 'Model unavailable',
    UNAVAILABLE: 'Connection unavailable',
  })[status] ?? 'Not tested'
const selectClass =
  'h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring'
const help = [
  {
    title: 'Connections',
    content:
      'Choose a deployment-approved model endpoint. Keys are encrypted and write-only. Testing reads the model list; it does not send repository code or generate an explanation. Editing a connection requires another test.',
  },
  {
    title: 'Model routing',
    content:
      'Each stage has a primary model and an optional fallback. Source sharing starts off. A connection must be enabled and successfully tested within the last 24 hours before its route is ready. Switching organizations separates connections and routes.',
  },
  {
    title: 'Current availability',
    content:
      'These settings prepare model connections. AI explanations and usage enforcement are still being built. Saving a budget does not start requests or enforce spending yet. AI never approves policies or changes deterministic checks.',
  },
]
export function AiSettingsPage() {
  const session = useNavigationSession(),
    allowed = canAdminister(session.data?.role)
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'AI Intelligence' }]} />
      <Main>
        {session.isPending ? (
          <p role='status'>Checking access…</p>
        ) : session.isError ? (
          <p role='alert'>Access details unavailable. Refresh and try again.</p>
        ) : !allowed ? (
          <p role='alert'>Owner or Admin access is required.</p>
        ) : (
          <AiSettings
            key={`${session.data?.identityId}:${session.data?.organizationId}`}
            identityId={session.data?.identityId ?? ''}
            organizationId={session.data?.organizationId ?? ''}
          />
        )}
      </Main>
    </>
  )
}
function AiSettings({
  identityId,
  organizationId,
}: {
  identityId: string
  organizationId: string
}) {
  const client = useQueryClient(),
    key = ['ai-configuration', identityId, organizationId],
    query = useQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        governanceRequest<Configuration>(
          '/ai/configuration',
          undefined,
          signal
        ),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: false,
    })
  const [edit, setEdit] = useState<Provider | null | undefined>(),
    [routing, setRouting] = useState<StageRoute | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const data = query.isError ? undefined : query.data
  async function action(path: string, body: unknown, done?: () => void) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await governanceRequest('/ai/configuration' + path, body)
      done?.()
      await client.invalidateQueries({ queryKey: key })
      setNotice('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const filtered =
    data?.providers.filter((p) =>
      `${p.name} ${p.modelId}`.toLowerCase().includes(search.toLowerCase())
    ) ?? []
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            AI Intelligence
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Manage AI connections and model choices.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching || busy}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          <PageHelpDrawer title='AI Intelligence' sections={help} />
        </div>
      </div>
      {query.isPending && <p role='status'>Loading settings…</p>}
      {query.isError && (
        <p role='alert' className='text-sm text-destructive'>
          {query.error.message}
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {notice && (
        <p role='status' className='text-sm text-success'>
          {notice}
        </p>
      )}
      {data && !data.enabled && (
        <section className='rounded-xl border p-6'>
          <h2 className='font-semibold'>AI is disabled for this deployment</h2>
          <p className='mt-2 text-sm text-muted-foreground'>
            Your deployment administrator can enable AI settings and approve
            model endpoints.
          </p>
        </section>
      )}
      {data?.enabled && (
        <>
          <div className='flex items-center gap-2 rounded-lg border bg-info/5 p-3 text-sm'>
            <ShieldCheck className='size-4 shrink-0 text-info' />
            Connection setup is available. AI explanations are still being
            built.
          </div>
          <Tabs defaultValue='connections'>
            <TabsList>
              <TabsTrigger value='connections'>
                <Cable className='mr-2 size-4' />
                Connections
              </TabsTrigger>
              <TabsTrigger value='routing'>
                <RouteIcon className='mr-2 size-4' />
                Model routing
              </TabsTrigger>
            </TabsList>
            <TabsContent value='connections' className='mt-5 space-y-4'>
              <div className='flex flex-wrap justify-between gap-3'>
                <Input
                  aria-label='Filter connections'
                  placeholder='Filter connections…'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className='max-w-xs'
                />
                <Button
                  disabled={
                    busy ||
                    !data.endpoints.length ||
                    data.providers.length >= 32
                  }
                  onClick={() => {
                    setError('')
                    setEdit(null)
                  }}
                >
                  <Plus className='size-4' />
                  Add connection
                </Button>
              </div>
              {!data.endpoints.length && (
                <p className='text-sm text-muted-foreground'>
                  No model endpoints have been approved for this deployment.
                </p>
              )}
              <div className='overflow-x-auto rounded-xl border'>
                <table className='w-full text-left text-sm'>
                  <thead className='bg-muted/40 text-muted-foreground'>
                    <tr>
                      {['Connection', 'Model', 'Status', 'Actions'].map((t) => (
                        <th key={t} className='px-4 py-3 font-medium'>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice(
                        (Math.min(
                          page,
                          Math.max(1, Math.ceil(filtered.length / 10))
                        ) -
                          1) *
                          10,
                        Math.min(
                          page,
                          Math.max(1, Math.ceil(filtered.length / 10))
                        ) * 10
                      )
                      .map((p) => (
                        <tr key={p.id} className='border-t'>
                          <td className='px-4 py-4 font-medium'>
                            {p.name}
                            <span className='mt-1 block text-xs font-normal text-muted-foreground'>
                              {data.endpoints.find((e) => e.id === p.endpointId)
                                ?.name ?? 'Endpoint no longer approved'}
                            </span>
                          </td>
                          <td className='px-4 py-4'>{p.modelId}</td>
                          <td className='px-4 py-4'>
                            <StatusBadge
                              tone={
                                !p.enabled
                                  ? 'neutral'
                                  : p.testStatus === 'CONNECTED'
                                    ? 'success'
                                    : 'info'
                              }
                            >
                              {!p.enabled ? 'Disabled' : testName(p.testStatus)}
                            </StatusBadge>
                          </td>
                          <td className='px-4 py-4'>
                            <div className='flex gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busy}
                                onClick={() => {
                                  setError('')
                                  setEdit(p)
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busy}
                                onClick={() =>
                                  void action(
                                    `/providers/${p.id}/test`,
                                    {},
                                    () => setNotice('Connection tested.')
                                  )
                                }
                              >
                                Test
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {!filtered.length && (
                      <tr>
                        <td
                          colSpan={4}
                          className='p-8 text-center text-muted-foreground'
                        >
                          {data.providers.length
                            ? 'No matching connections.'
                            : 'Add your first model connection.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > 10 && (
                <nav
                  aria-label='Connection pages'
                  className='flex items-center justify-end gap-3 text-sm'
                >
                  <span>
                    Page {Math.min(page, Math.ceil(filtered.length / 10))} of{' '}
                    {Math.ceil(filtered.length / 10)}
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1 || busy}
                    onClick={() => setPage(Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= Math.ceil(filtered.length / 10) || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
              <p className='text-xs text-muted-foreground'>
                {filtered.length} of {data.providers.length} connections ·
                Maximum 32 per organization
              </p>
            </TabsContent>
            <TabsContent value='routing' className='mt-5'>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {data.stages.map((stage) => {
                  const r = data.routes.find((r) => r.stage === stage)
                  return (
                    <section
                      key={stage}
                      className='flex flex-col rounded-xl border p-5'
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <h2 className='font-semibold'>{stageName(stage)}</h2>
                        <StatusBadge tone={r?.enabled ? 'info' : 'neutral'}>
                          {r?.enabled ? 'Configured' : 'Disabled'}
                        </StatusBadge>
                      </div>
                      <dl className='my-5 space-y-3 text-sm'>
                        <div className='flex justify-between gap-3'>
                          <dt className='text-muted-foreground'>Primary</dt>
                          <dd className='truncate'>
                            {data.providers.find((p) => p.id === r?.primaryId)
                              ?.name ?? 'Not selected'}
                          </dd>
                        </div>
                        <div className='flex justify-between gap-3'>
                          <dt className='text-muted-foreground'>Fallback</dt>
                          <dd className='truncate'>
                            {data.providers.find((p) => p.id === r?.fallbackId)
                              ?.name ?? 'None'}
                          </dd>
                        </div>
                        <div className='flex justify-between gap-3'>
                          <dt className='text-muted-foreground'>
                            Source sharing
                          </dt>
                          <dd>{r?.allowSource ? 'Allowed' : 'Off'}</dd>
                        </div>
                      </dl>
                      <Button
                        variant='outline'
                        className='mt-auto'
                        disabled={busy}
                        onClick={() => {
                          setError('')
                          setRouting(
                            r ?? {
                              stage,
                              primaryId: null,
                              fallbackId: null,
                              enabled: false,
                              allowSource: false,
                              maxInputTokens: 8000,
                              maxOutputTokens: 1000,
                              dailyBudgetCents: 1000,
                              revision: 0,
                            }
                          )
                        }}
                      >
                        Configure
                      </Button>
                    </section>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      <Dialog
        open={edit !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) setEdit(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit ? 'Edit connection' : 'Add connection'}
            </DialogTitle>
            <DialogDescription>
              Choose an approved endpoint and model. Keys stay private.
            </DialogDescription>
          </DialogHeader>
          {data && edit !== undefined && (
            <ProviderForm
              key={edit?.id ?? 'new'}
              provider={edit}
              endpoints={data.endpoints}
              busy={busy}
              error={error}
              save={(body) =>
                void action(
                  `/providers${edit ? '/' + edit.id : ''}`,
                  body,
                  () => setEdit(undefined)
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!routing}
        onOpenChange={(open) => {
          if (!open && !busy) setRouting(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stageName(routing?.stage ?? '')} model routing
            </DialogTitle>
            <DialogDescription>
              Choose models and limits for this stage.
            </DialogDescription>
          </DialogHeader>
          {data && routing && (
            <RouteForm
              key={routing.stage}
              route={routing}
              providers={data.providers}
              busy={busy}
              error={error}
              save={(body) =>
                void action(`/routes/${routing.stage}`, body, () =>
                  setRouting(undefined)
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
function ProviderForm({
  provider,
  endpoints,
  busy,
  error,
  save,
}: {
  provider: Provider | null
  endpoints: Endpoint[]
  busy: boolean
  error: string
  save: (body: unknown) => void
}) {
  const [endpointId, setEndpointId] = useState(
      provider?.endpointId ?? endpoints[0]?.id ?? ''
    ),
    [model, setModel] = useState(
      provider?.modelId ?? endpoints[0]?.models[0] ?? ''
    ),
    [apiKey, setApiKey] = useState('')
  const endpoint = endpoints.find((e) => e.id === endpointId)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save({
      name: f.get('name'),
      endpointId,
      modelId: model,
      enabled: f.get('enabled') === 'on',
      expectedRevision: provider?.revision ?? 0,
      ...(apiKey ? { apiKey } : {}),
    })
  }
  return (
    <form onSubmit={submit} className='space-y-4'>
      <label className='block space-y-2 text-sm'>
        <span>Connection name</span>
        <Input
          name='name'
          required
          maxLength={120}
          defaultValue={provider?.name}
        />
      </label>
      <label className='block space-y-2 text-sm'>
        <span>Endpoint</span>
        <select
          className={selectClass}
          value={endpointId}
          onChange={(e) => {
            setEndpointId(e.target.value)
            setModel(
              endpoints.find((p) => p.id === e.target.value)?.models[0] ?? ''
            )
            setApiKey('')
          }}
          required
        >
          <option value='' disabled>
            Select endpoint
          </option>
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.locality}
            </option>
          ))}
        </select>
      </label>
      <label className='block space-y-2 text-sm'>
        <span>Model</span>
        <select
          className={selectClass}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
        >
          <option value='' disabled>
            Select model
          </option>
          {endpoint?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className='block space-y-2 text-sm'>
        <span>
          Provider key{' '}
          {provider?.apiKeySet ? '(leave blank to keep saved key)' : ''}
        </span>
        <Input
          type='password'
          autoComplete='new-password'
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          maxLength={4096}
          required={
            !!endpoint?.requiresKey &&
            (!provider?.apiKeySet || provider.endpointId !== endpointId)
          }
        />
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          name='enabled'
          defaultChecked={provider?.enabled ?? false}
        />
        Enable connection
      </label>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <Button className='w-full' disabled={busy || !endpoint}>
        {busy ? 'Saving…' : 'Save connection'}
      </Button>
    </form>
  )
}
function RouteForm({
  route,
  providers,
  busy,
  error,
  save,
}: {
  route: StageRoute
  providers: Provider[]
  busy: boolean
  error: string
  save: (body: unknown) => void
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save({
      primaryId: f.get('primaryId') || null,
      fallbackId: f.get('fallbackId') || null,
      enabled: f.get('enabled') === 'on',
      allowSource: f.get('allowSource') === 'on',
      maxInputTokens: Number(f.get('maxInputTokens')),
      maxOutputTokens: Number(f.get('maxOutputTokens')),
      dailyBudgetCents: Number(f.get('dailyBudgetCents')),
      expectedRevision: route.revision,
    })
  }
  return (
    <form onSubmit={submit} className='space-y-4'>
      {(['primaryId', 'fallbackId'] as const).map((name) => (
        <label key={name} className='block space-y-2 text-sm'>
          <span>
            {name === 'primaryId'
              ? 'Primary connection'
              : 'Fallback connection'}
          </span>
          <select
            className={selectClass}
            name={name}
            defaultValue={route[name] ?? ''}
          >
            <option value=''>None</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {testName(p.testStatus)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className='grid grid-cols-2 gap-3'>
        {(
          [
            {
              name: 'maxInputTokens',
              label: 'Input token limit',
              min: 100,
              max: 32000,
            },
            {
              name: 'maxOutputTokens',
              label: 'Output token limit',
              min: 128,
              max: 8192,
            },
            {
              name: 'dailyBudgetCents',
              label: 'Daily budget (US cents)',
              min: 1,
              max: 5000,
            },
          ] as const
        ).map((f) => (
          <label key={f.name} className='block space-y-2 text-sm'>
            <span>{f.label}</span>
            <Input
              type='number'
              name={f.name}
              min={f.min}
              max={f.max}
              step={1}
              required
              defaultValue={route[f.name]}
            />
          </label>
        ))}
      </div>
      <label className='flex items-center gap-2 text-sm'>
        <input type='checkbox' name='enabled' defaultChecked={route.enabled} />
        Enable route
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          name='allowSource'
          defaultChecked={route.allowSource}
        />
        Allow repository source sharing
      </label>
      <p className='text-xs text-muted-foreground'>
        Requests remain unavailable while AI execution is being built.
      </p>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <Button className='w-full' disabled={busy}>
        {busy ? 'Saving…' : 'Save routing'}
      </Button>
    </form>
  )
}
