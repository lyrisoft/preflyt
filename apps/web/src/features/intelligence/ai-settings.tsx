import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BrainCircuit,
  Cable,
  Loader2,
  Pencil,
  PlugZap,
  Power,
  Save,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
} from 'lucide-react'
import { siClaude, siGooglegemini, siDeepseek } from 'simple-icons'
import { surfaceTones } from '@/lib/surface-tones'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from '../repositories/governance-api'
import {
  useNavigationSession,
  canAdminister,
} from '../workspace/navigation-session'
import { isAiSettingsTab, type AiSettingsTab } from './intelligence-search'

type Preset = {
  id: string
  name: string
  baseUrl: string
  exampleModel: string
}
type Endpoint = {
  preset?: string
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
  endpoint: Endpoint | null
  modelId: string
  enabled: boolean
  revision: number
  testStatus: string
  approved: boolean
  apiKeySet: boolean
}
type StageRoute = {
  stage: string
  primaryId: string | null
  fallbackId: string | null
  enabled: boolean
  allowSource: boolean
  automaticReviews?: boolean
  publishSummary?: boolean
  publishInline?: boolean
  revision: number
}
type Configuration = {
  enabled: boolean
  executionAvailable: boolean
  providers: Provider[]
  routes: StageRoute[]
  stages: string[]
  presets?: Preset[]
}
const providerIcons = {
  // Simple Icons v14 OpenAI mark (CC0); removed from the current icon package.
  openai: {
    path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  anthropic: siClaude,
  gemini: siGooglegemini,
  deepseek: siDeepseek,
}
function ProviderIcon({
  provider,
  tile = false,
}: {
  provider?: string
  tile?: boolean
}) {
  const icon = providerIcons[provider as keyof typeof providerIcons]
  if (!icon)
    return tile ? <SurfaceIcon icon={BrainCircuit} tone='violet' /> : null
  const mark = (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='size-5 shrink-0'
      aria-hidden='true'
      focusable='false'
    >
      <path d={icon.path} />
    </svg>
  )
  return tile ? (
    <span
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl border ${surfaceTones.violet}`}
    >
      {mark}
    </span>
  ) : (
    mark
  )
}
const stageName = (stage: string) =>
  ({
    default: 'Default',
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
const help = [
  {
    title: 'Set up AI reviews',
    content:
      'Connect a model and test the connection. Choose it as the default in Model Router. Choose a skill in Skills, approve and enable it, then add it as an AI Review in a standard. AI reviews are optional suggestions and do not change check results. Repository code is shared only when you enable it.',
  },
  {
    title: 'Models',
    content:
      'Organization admins add and approve models directly in Preflyt. Choose a built-in provider or add an OpenAI-compatible endpoint. Model name means the exact API identifier your provider accepts. Hosted providers require HTTPS; select Self-hosted for a local model server. Keys are encrypted and write-only. Testing reads model metadata; it does not send repository code or generate an explanation. Editing a connection requires another test.',
  },
  {
    title: 'Model router',
    content:
      'Choose one default model for AI reviews and workflow rewriting. Stage overrides are optional. Source sharing starts off. Saving a model tests its connection; configuration changes require another test. Connections do not expire after 24 hours. PR feedback is configured in Settings. Switching organizations separates connections and routes.',
  },
  {
    title: 'Current availability',
    content:
      'AI Reviews use saved assessment results. When source sharing is enabled, PR reviews can also use selected changes from the assessed commit. Published PR policies can run assigned reviews automatically and post summaries or comments to GitHub when those options are enabled. Comments on changed lines also require source sharing. Reviews require an enabled, tested model. AI suggestions never approve policies or count as passed checks.',
  },
]
type AiSettingsNavigation = {
  tab?: AiSettingsTab
  onTabChange?: (tab: AiSettingsTab) => void
}
export function AiSettingsPage({
  tab,
  onTabChange,
}: AiSettingsNavigation = {}) {
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
          <div className='space-y-6'>
            <PageHeader
              title='AI Intelligence'
              description='Set up optional AI reviews for your development workflow.'
              section='Intelligence'
              icon={BrainCircuit}
              tone='violet'
              actions={
                <PageHelpDrawer title='AI Intelligence' sections={help} />
              }
            />
            <div className='space-y-3 rounded-xl border p-4'>
              <p role='status' className='text-sm text-muted-foreground'>
                Only organization administrators can manage models and routing.
                Review instructions are available on the Skills page.
              </p>
              <Button size='sm' variant='outline' asChild>
                <Link to='/skills'>Open Skills</Link>
              </Button>
            </div>
          </div>
        ) : (
          <AiSettings
            key={`${session.data?.identityId}:${session.data?.organizationId}`}
            identityId={session.data?.identityId ?? ''}
            organizationId={session.data?.organizationId ?? ''}
            tab={tab}
            onTabChange={onTabChange}
          />
        )}
      </Main>
    </>
  )
}
function AiSettings({
  identityId,
  organizationId,
  tab,
  onTabChange,
}: {
  identityId: string
  organizationId: string
} & AiSettingsNavigation) {
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
  const [localTab, setLocalTab] = useState<AiSettingsTab>(tab ?? 'connections')
  const [preset, setPreset] = useState<Preset>(),
    [edit, setEdit] = useState<Provider | null | undefined>(),
    [routing, setRouting] = useState<StageRoute | undefined>(),
    [busy, setBusy] = useState(false),
    [activeAction, setActiveAction] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState('')
  const data = query.isError ? undefined : query.data
  async function action(path: string, body: unknown, done?: () => void) {
    setBusy(true)
    setActiveAction(path)
    setError('')
    setNotice('')
    try {
      const result = await governanceRequest<{ id?: string; status?: string }>(
        '/ai/configuration' + path,
        body
      )
      if (
        path.startsWith('/providers') &&
        !path.endsWith('/test') &&
        result.id
      ) {
        done?.()
        try {
          const tested = await governanceRequest<{ status: string }>(
            `/ai/configuration/providers/${result.id}/test`,
            {}
          )
          if (tested.status !== 'CONNECTED') {
            setError(
              `Model saved. ${testName(tested.status)}. Check the connection details.`
            )
            await client.invalidateQueries({ queryKey: key })
            return
          }
        } catch {
          setError(
            'Model saved. Its connection could not be tested. Use Test to retry.'
          )
          await client.invalidateQueries({ queryKey: key })
          return
        }
        await client.invalidateQueries({ queryKey: key })
        setNotice('Model saved and connection tested.')
        return
      }
      done?.()
      await client.invalidateQueries({ queryKey: key })
      if (path.endsWith('/test')) {
        if (result?.status === 'CONNECTED') setNotice('Connection tested.')
        else
          setError(
            `${testName(result?.status ?? 'UNAVAILABLE')}. Check the endpoint, model name and authentication settings, then try again.`
          )
      } else setNotice('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Try again.')
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }
  const filtered =
    data?.providers.filter((p) =>
      `${p.name} ${p.modelId}`.toLowerCase().includes(search.toLowerCase())
    ) ?? []
  return (
    <div className='space-y-6'>
      <PageHeader
        title='AI Intelligence'
        description='Set up optional AI reviews for your development workflow.'
        section='Intelligence'
        icon={BrainCircuit}
        tone='violet'
        actions={
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={query.isFetching || busy}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                aria-hidden='true'
                className={
                  query.isFetching
                    ? 'size-4 animate-spin motion-reduce:animate-none'
                    : 'size-4'
                }
              />
              Refresh
            </Button>
            <PageHelpDrawer title='AI Intelligence' sections={help} />
          </div>
        }
      />
      {query.isPending && <p role='status'>Loading settings…</p>}
      {query.isError && (
        <p role='alert' className='text-sm text-destructive'>
          {query.error.message}
        </p>
      )}
      {error && edit === undefined && !routing && (
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
        <Card>
          <CardContent className='flex items-start gap-4'>
            <SurfaceIcon icon={BrainCircuit} tone='violet' />
            <div>
              <h2 className='text-base font-semibold'>
                AI is disabled for this deployment
              </h2>
              <p className='mt-2 text-sm text-muted-foreground'>
                Your deployment administrator can enable AI settings.
                Organization admins then add models here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {data?.enabled && (
        <>
          {!data.executionAvailable && (
            <div className='flex items-center gap-3 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm'>
              <ShieldCheck className='size-4 shrink-0 text-info' />
              {data.executionAvailable
                ? 'Model connections and AI assessment reviews are available.'
                : 'Model connections are available. AI Reviews are disabled for this deployment.'}
            </div>
          )}
          <Tabs
            value={onTabChange ? (tab ?? 'connections') : localTab}
            onValueChange={(value) => {
              if (!isAiSettingsTab(value)) return
              setLocalTab(value)
              onTabChange?.(value)
            }}
          >
            <TabsList>
              <TabsTrigger value='connections'>
                <Cable className='mr-2 size-4' />
                Models
              </TabsTrigger>
              <TabsTrigger value='routing'>
                <RouteIcon className='mr-2 size-4' />
                Model router
              </TabsTrigger>
            </TabsList>
            <TabsContent value='connections' className='mt-5 space-y-6'>
              {!!data.presets?.length && (
                <section
                  aria-labelledby='built-in-providers'
                  className='space-y-3'
                >
                  <div>
                    <h2
                      id='built-in-providers'
                      className='text-base font-semibold'
                    >
                      Built-in providers
                    </h2>
                    <p className='text-sm text-muted-foreground'>
                      Connect with your API key and model name.
                    </p>
                  </div>
                  <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                    {data.presets.map((item) => {
                      const provider =
                        data.providers.find(
                          (p) => p.endpoint?.preset === item.id && p.enabled
                        ) ??
                        data.providers.find(
                          (p) => p.endpoint?.preset === item.id
                        )
                      return (
                        <Card key={item.id}>
                          <CardContent className='space-y-3'>
                            <div className='flex items-center gap-3'>
                              <ProviderIcon provider={item.id} tile />
                              <div className='min-w-0'>
                                <h3 className='text-sm font-semibold'>
                                  {item.name}
                                </h3>
                                <p
                                  className='truncate text-xs text-muted-foreground'
                                  title={provider?.modelId}
                                >
                                  {provider?.modelId ?? 'Not connected'}
                                </p>
                              </div>
                            </div>
                            <div className='flex items-center justify-between gap-2'>
                              <StatusBadge tone='neutral'>
                                {provider
                                  ? !provider.enabled
                                    ? 'Disabled'
                                    : testName(provider.testStatus)
                                  : 'Inactive'}
                              </StatusBadge>
                              <Button
                                size='sm'
                                variant={provider ? 'outline' : 'default'}
                                aria-label={`${provider ? 'Configure' : 'Activate'} ${item.name}`}
                                disabled={
                                  busy ||
                                  (!provider && data.providers.length >= 32)
                                }
                                onClick={() => {
                                  setError('')
                                  setPreset(item)
                                  setEdit(provider ?? null)
                                }}
                              >
                                {provider ? (
                                  <Pencil aria-hidden='true' />
                                ) : (
                                  <Power aria-hidden='true' />
                                )}
                                {provider ? 'Configure' : 'Activate'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </section>
              )}
              <div className='flex flex-wrap items-end justify-between gap-4'>
                <div className='space-y-3'>
                  <h2 className='text-base font-semibold'>Configured models</h2>
                  <Input
                    aria-label='Filter models'
                    placeholder='Filter models…'
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                    }}
                    className='w-full sm:w-72'
                  />
                </div>
                <Button
                  disabled={busy || data.providers.length >= 32}
                  onClick={() => {
                    setError('')
                    setPreset(undefined)
                    setEdit(null)
                  }}
                >
                  <Plus className='size-4' />
                  Add model
                </Button>
              </div>
              <div className='overflow-x-auto rounded-xl border'>
                <Table className='w-full text-left text-sm'>
                  <thead className='bg-muted/40 text-muted-foreground'>
                    <tr>
                      {['Model', 'Model name', 'Status', 'Actions'].map((t) => (
                        <th key={t} className='px-4 py-3 font-medium'>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        className='border-t transition-colors hover:bg-muted/20'
                      >
                        <td className='px-4 py-4 font-medium'>
                          <span className='flex items-center gap-2.5'>
                            <ProviderIcon provider={p.endpoint?.preset} />
                            {p.name}
                          </span>
                          <span
                            className='mt-1 block max-w-xs truncate text-xs font-normal text-muted-foreground'
                            title={p.endpoint?.baseUrl}
                          >
                            {p.endpoint?.baseUrl ?? 'Endpoint setup required'}
                          </span>
                        </td>
                        <td className='px-4 py-4'>{p.modelId}</td>
                        <td className='px-4 py-4'>
                          <div className='flex flex-wrap gap-2'>
                            {p.approved && (
                              <StatusBadge tone='success'>Approved</StatusBadge>
                            )}
                            <StatusBadge
                              tone={
                                !p.enabled
                                  ? 'neutral'
                                  : p.testStatus === 'CONNECTED'
                                    ? 'success'
                                    : [
                                          'AUTH_REJECTED',
                                          'MODEL_UNAVAILABLE',
                                          'UNAVAILABLE',
                                        ].includes(p.testStatus)
                                      ? 'error'
                                      : 'neutral'
                              }
                            >
                              {!p.enabled ? 'Disabled' : testName(p.testStatus)}
                            </StatusBadge>
                          </div>
                        </td>
                        <td className='px-4 py-4'>
                          <div className='flex items-center gap-2'>
                            <Button
                              className='min-w-20'
                              size='sm'
                              variant='outline'
                              disabled={busy}
                              onClick={() => {
                                setError('')
                                setPreset(
                                  data.presets?.find(
                                    (v) => v.id === p.endpoint?.preset
                                  )
                                )
                                setEdit(p)
                              }}
                            >
                              <Pencil aria-hidden='true' />
                              Edit
                            </Button>
                            <Button
                              className='min-w-20'
                              size='sm'
                              aria-busy={
                                busy &&
                                activeAction === `/providers/${p.id}/test`
                              }
                              variant='outline'
                              disabled={busy}
                              onClick={() =>
                                void action(`/providers/${p.id}/test`, {})
                              }
                            >
                              {busy &&
                              activeAction === `/providers/${p.id}/test` ? (
                                <Loader2
                                  aria-hidden='true'
                                  className='size-4 animate-spin motion-reduce:animate-none'
                                />
                              ) : (
                                <PlugZap aria-hidden='true' />
                              )}
                              {busy &&
                              activeAction === `/providers/${p.id}/test`
                                ? 'Testing…'
                                : 'Test'}
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
                            : 'Add your first model.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>

              <p className='text-xs text-muted-foreground'>
                {filtered.length} of {data.providers.length} models · Maximum 32
                per organization
              </p>
            </TabsContent>
            <TabsContent value='routing' className='mt-5 space-y-4'>
              <div className='flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4'>
                <div className='space-y-1'>
                  <h2 className='text-sm font-semibold'>Default model</h2>
                  <p className='text-sm text-muted-foreground'>
                    {data.providers.find(
                      (p) =>
                        p.id ===
                        data.routes.find((r) => r.stage === 'default')
                          ?.primaryId
                    )?.name ?? 'Choose a model to use across Preflyt.'}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setError('')
                    setRouting(
                      data.routes.find((r) => r.stage === 'default') ?? {
                        stage: 'default',
                        primaryId: null,
                        fallbackId: null,
                        enabled: true,
                        allowSource: false,
                        revision: 0,
                      }
                    )
                  }}
                >
                  Configure default
                </Button>
              </div>
              <details className='rounded-xl border p-4'>
                <summary className='cursor-pointer text-sm font-medium'>
                  Stage overrides (optional)
                </summary>
                <div className='mt-3 divide-y'>
                  {data.stages.map((stage) => {
                    const r = data.routes.find((r) => r.stage === stage)
                    return (
                      <div
                        key={stage}
                        className='flex flex-wrap items-center justify-between gap-3 py-3'
                      >
                        <div>
                          <p className='text-sm font-medium'>
                            {stageName(stage)}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {r
                              ? r.enabled
                                ? (data.providers.find(
                                    (p) => p.id === r.primaryId
                                  )?.name ?? 'Model unavailable')
                                : 'Disabled for this stage'
                              : 'Uses default model'}
                          </p>
                        </div>
                        <div className='flex gap-2'>
                          {r && (
                            <Button
                              size='sm'
                              variant='ghost'
                              disabled={busy}
                              onClick={() =>
                                void action(`/routes/${stage}/inherit`, {
                                  expectedRevision: r.revision,
                                })
                              }
                            >
                              Use default
                            </Button>
                          )}
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={busy}
                            onClick={() => {
                              setError('')
                              setRouting(
                                r ?? {
                                  ...data.routes.find(
                                    (r) => r.stage === 'default'
                                  ),
                                  stage,
                                  revision: 0,
                                  primaryId:
                                    data.routes.find(
                                      (r) => r.stage === 'default'
                                    )?.primaryId ?? null,
                                  fallbackId:
                                    data.routes.find(
                                      (r) => r.stage === 'default'
                                    )?.fallbackId ?? null,
                                  enabled: false,
                                  allowSource: false,
                                }
                              )
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
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
            <DialogTitle className='flex items-center gap-2.5'>
              <ProviderIcon provider={preset?.id} />
              {preset
                ? `${edit ? 'Configure' : 'Activate'} ${preset.name}`
                : edit
                  ? 'Edit model'
                  : 'Add model'}
            </DialogTitle>
            <DialogDescription>
              Saving tests and approves this model for your organization. Keys
              stay private.
            </DialogDescription>
          </DialogHeader>
          {data && edit === null && (
            <label className='block space-y-1.5 text-sm'>
              <span>Provider</span>
              <Select
                value={preset?.id ?? 'custom'}
                onValueChange={(value) =>
                  setPreset(data.presets?.find((p) => p.id === value))
                }
              >
                <SelectTrigger aria-label='Provider'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.presets?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value='custom'>
                    OpenAI-compatible endpoint
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          {data && edit !== undefined && (
            <ProviderForm
              preset={preset}
              key={`${edit?.id ?? 'new'}:${preset?.id ?? 'custom'}`}
              provider={edit}
              busy={busy}
              error={error}
              cancel={() => setEdit(undefined)}
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
              Choose the primary model, optional fallback and source sharing.
            </DialogDescription>
          </DialogHeader>
          {data && routing && (
            <RouteForm
              key={routing.stage}
              route={routing}
              providers={data.providers}
              busy={busy}
              error={error}
              cancel={() => setRouting(undefined)}
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
  preset,
  provider,
  busy,
  error,
  cancel,
  save,
}: {
  preset?: Preset
  provider: Provider | null
  busy: boolean
  error: string
  cancel: () => void
  save: (body: unknown) => void
}) {
  const [baseUrl, setBaseUrl] = useState(provider?.endpoint?.baseUrl ?? ''),
    [locality, setLocality] = useState(
      provider?.endpoint?.locality ?? 'hosted'
    ),
    [requiresKey, setRequiresKey] = useState(
      provider?.endpoint?.requiresKey ?? true
    ),
    [apiKey, setApiKey] = useState('')
  const changed =
    !preset &&
    (baseUrl !== provider?.endpoint?.baseUrl ||
      locality !== provider?.endpoint?.locality ||
      requiresKey !== provider?.endpoint?.requiresKey)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save({
      name: preset?.name ?? f.get('name'),
      baseUrl: preset?.baseUrl ?? baseUrl,
      locality: preset ? 'hosted' : locality,
      requiresKey: preset ? true : requiresKey,
      ...(preset ? { preset: preset.id } : {}),
      modelId: f.get('modelId'),
      enabled: preset && !provider ? true : f.get('enabled') === 'on',
      expectedRevision: provider?.revision ?? 0,
      ...(apiKey ? { apiKey } : {}),
    })
  }
  return (
    <form onSubmit={submit} className='space-y-4'>
      {!preset && (
        <>
          <label className='block space-y-2 text-sm'>
            <span>Display name</span>
            <Input
              name='name'
              placeholder='Code review model'
              required
              maxLength={120}
              defaultValue={provider?.name}
            />
          </label>
          <label className='block space-y-2 text-sm'>
            <span>Endpoint URL</span>
            <Input
              type='url'
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                locality === 'local'
                  ? 'http://localhost:11434/v1'
                  : 'https://api.example.com/v1'
              }
              required
              maxLength={2048}
            />
          </label>
          <label className='block space-y-2 text-sm'>
            <span>Hosting</span>
            <Select
              value={locality}
              onValueChange={(value) => {
                setLocality(value)
                setRequiresKey(value !== 'local')
              }}
            >
              <SelectTrigger aria-label='Hosting'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='hosted'>Hosted provider</SelectItem>
                <SelectItem value='local'>Self-hosted model</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </>
      )}
      <label className='block space-y-2 text-sm'>
        <span>Model name</span>
        <Input
          name='modelId'
          required
          maxLength={256}
          placeholder={preset?.exampleModel ?? 'code-review-model'}
          defaultValue={provider?.modelId}
        />
      </label>
      {!preset && (
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={requiresKey}
            onChange={(e) => setRequiresKey(e.target.checked)}
          />
          Provider requires an API key
        </label>
      )}
      <label className='block space-y-2 text-sm'>
        <span>
          API key{!preset && !requiresKey ? ' (optional)' : ''}{' '}
          {provider?.apiKeySet && !changed
            ? '(leave blank to keep saved key)'
            : ''}
        </span>
        <Input
          type='password'
          placeholder='sk-example-key'
          autoComplete='new-password'
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          maxLength={4096}
          required={
            (!!preset || requiresKey) && (!provider?.apiKeySet || changed)
          }
        />
      </label>
      {(!preset || provider) && (
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            name='enabled'
            defaultChecked={provider?.enabled ?? false}
          />
          Enable model
        </label>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </Button>
        <Button
          type='submit'
          className='min-w-32'
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2
              aria-hidden='true'
              className='size-4 animate-spin motion-reduce:animate-none'
            />
          ) : preset && !provider ? (
            <Power aria-hidden='true' />
          ) : (
            <Save aria-hidden='true' />
          )}
          {busy
            ? 'Saving…'
            : preset && !provider
              ? 'Activate model'
              : 'Save model'}
        </Button>
      </div>
    </form>
  )
}
function RouteForm({
  route,
  providers,
  busy,
  error,
  cancel,
  save,
}: {
  route: StageRoute
  providers: Provider[]
  busy: boolean
  error: string
  cancel: () => void
  save: (body: unknown) => void
}) {
  const [primaryId, setPrimaryId] = useState(route.primaryId ?? 'none')
  const [fallbackId, setFallbackId] = useState(route.fallbackId ?? 'none')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save({
      primaryId:
        f.get('primaryId') === 'none' ? null : f.get('primaryId') || null,
      fallbackId:
        f.get('fallbackId') === 'none' ? null : f.get('fallbackId') || null,
      enabled: f.get('enabled') === 'on',
      allowSource: f.get('allowSource') === 'on',
      automaticReviews: route.automaticReviews ?? false,
      publishSummary: route.publishSummary ?? false,
      publishInline: route.publishInline ?? false,
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
          <Select
            name={name}
            value={name === 'primaryId' ? primaryId : fallbackId}
            onValueChange={(value) => {
              if (name === 'primaryId') {
                setPrimaryId(value)
                if (value === fallbackId) setFallbackId('none')
              } else {
                setFallbackId(value)
              }
            }}
            disabled={busy}
          >
            <SelectTrigger
              aria-label={
                name === 'primaryId'
                  ? 'Primary connection'
                  : 'Fallback connection'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>
                {name === 'primaryId' ? 'Choose a model' : 'No fallback'}
              </SelectItem>
              {providers.map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  disabled={name === 'fallbackId' && p.id === primaryId}
                >
                  {p.name} · {testName(p.testStatus)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ))}
      <label className='flex items-center gap-2 text-sm'>
        <input type='checkbox' name='enabled' defaultChecked={route.enabled} />
        {route.stage === 'default'
          ? 'Enable AI reviews'
          : 'Enable reviews for this stage'}
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          name='allowSource'
          defaultChecked={route.allowSource}
        />
        Send repository code to the selected AI model
      </label>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </Button>
        <Button
          type='submit'
          className='min-w-32'
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2
              aria-hidden='true'
              className='size-4 animate-spin motion-reduce:animate-none'
            />
          ) : (
            <Save aria-hidden='true' />
          )}
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}
