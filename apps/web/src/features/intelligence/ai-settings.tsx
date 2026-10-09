import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cable,
  Loader2,
  Pencil,
  PlugZap,
  Power,
  Save,
  Settings2,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
} from 'lucide-react'
import { siClaude, siGooglegemini, siDeepseek } from 'simple-icons'
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
import { SkillsCatalogue } from './skills-catalogue'

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
  inputPriceCentsPerMillion?: number | null
  outputPriceCentsPerMillion?: number | null
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
function ProviderIcon({ provider }: { provider?: string }) {
  const icon = providerIcons[provider as keyof typeof providerIcons]
  if (!icon) return null
  return (
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
    title: 'Markdown skill files',
    content:
      'Write instructions in Markdown and use Preview to review them. Upload SKILL.md to open an editable draft; uploading does not save, approve or enable it. The UTF-8 file must be at most 32 KiB, with name and description in a YAML header and up to 6,000 instruction characters below it. Optional header fields are source, license, stages and repositories. Enter the source and license before saving. Download SKILL.md exports the selected database version. Existing policies keep their approved version and digest; file changes require a new draft and approval. Preview does not run HTML or load linked images.',
  },
  {
    title: 'Models',
    content:
      'Organization admins add and approve models directly in Preflyt. Choose a built-in provider or add an OpenAI-compatible endpoint. Model name means the exact API identifier your provider accepts. Hosted providers require HTTPS; select Self-hosted for a local model server. Keys are encrypted and write-only. Testing reads model metadata; it does not send repository code or generate an explanation. Editing a connection requires another test.',
  },
  {
    title: 'Model routing',
    content:
      'Each stage has a primary model and an optional fallback. Source sharing starts off. A connection must be enabled and successfully tested within the last 24 hours before its route is ready. Switching organizations separates connections and routes.',
  },
  {
    title: 'Review skills',
    content:
      'Create a versioned skill or start from a first-party template. Review its instructions, source and license, then approve and enable it. Changes require a new version. Add an AI Review in Engineering Standards and assign this approved skill version to it. Choose where the review applies; up to three assigned reviews can run in one request. Model output is advisory and never changes deterministic checks. Third-party packages and scripts are not automatically imported or executed.',
  },
  {
    title: 'Current availability',
    content:
      'These settings prepare model connections. Skill reviews use saved assessment evidence only. Reviews require enabled, tested model routing and configured input/output rates. Reservations enforce the configured daily estimate budget; they are not the provider’s final bill. Source review and GitHub feedback are not available. AI never approves policies or changes deterministic checks.',
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
          <div className='space-y-6'>
            <h1 className='text-2xl font-semibold'>AI Intelligence</h1>
            <SkillsCatalogue
              key={`${session.data?.identityId}:${session.data?.organizationId}`}
            />
          </div>
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
  const [preset, setPreset] = useState<Preset>(),
    [edit, setEdit] = useState<Provider | null | undefined>(),
    [routing, setRouting] = useState<StageRoute | undefined>(),
    [busy, setBusy] = useState(false),
    [activeAction, setActiveAction] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const data = query.isError ? undefined : query.data
  async function action(path: string, body: unknown, done?: () => void) {
    setBusy(true)
    setActiveAction(path)
    setError('')
    setNotice('')
    try {
      const result = await governanceRequest<{ status?: string }>(
        '/ai/configuration' + path,
        body
      )
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
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            AI Intelligence
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Manage approved models and model choices.
          </p>
        </div>
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
            Your deployment administrator can enable AI settings. Organization
            admins then add models here.
          </p>
        </section>
      )}
      {data?.enabled && (
        <>
          <div className='flex items-center gap-2 rounded-lg border bg-info/5 p-3 text-sm'>
            <ShieldCheck className='size-4 shrink-0 text-info' />
            {data.executionAvailable
              ? 'Model connections and advisory assessment reviews are available.'
              : 'Model connections are available. Advisory reviews are disabled for this deployment.'}
          </div>
          <Tabs defaultValue='connections'>
            <TabsList>
              <TabsTrigger value='connections'>
                <Cable className='mr-2 size-4' />
                Models
              </TabsTrigger>
              <TabsTrigger value='skills'>Review skills</TabsTrigger>
              <TabsTrigger value='routing'>
                <RouteIcon className='mr-2 size-4' />
                Model routing
              </TabsTrigger>
            </TabsList>
            <TabsContent value='connections' className='mt-5 space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                {data.presets?.map((p) => {
                  const connection = data.providers.find(
                    (c) => c.endpoint?.preset === p.id
                  )
                  return (
                    <section
                      key={p.id}
                      className='flex flex-col gap-4 rounded-xl border p-5'
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex min-w-0 items-center gap-2.5'>
                          <ProviderIcon provider={p.id} />
                          <h2 className='font-semibold'>{p.name}</h2>
                        </div>
                        <StatusBadge
                          tone={connection?.enabled ? 'success' : 'neutral'}
                        >
                          {connection?.enabled ? 'Active' : 'Inactive'}
                        </StatusBadge>
                      </div>
                      <p className='min-h-10 text-sm text-muted-foreground'>
                        {connection?.modelId ??
                          'Enter your model name and API key.'}
                      </p>
                      <Button
                        variant='outline'
                        className='mt-auto self-end'
                        disabled={
                          busy || (!connection && data.providers.length >= 32)
                        }
                        onClick={() => {
                          setError('')
                          setPreset(p)
                          setEdit(connection ?? null)
                        }}
                      >
                        {connection ? (
                          <Settings2 aria-hidden='true' />
                        ) : (
                          <Power aria-hidden='true' />
                        )}
                        {connection ? 'Configure' : 'Activate'}
                      </Button>
                    </section>
                  )
                })}
              </div>
              <div className='flex flex-wrap justify-between gap-3'>
                <Input
                  aria-label='Filter models'
                  placeholder='Filter models…'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className='max-w-xs'
                />
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
                <table className='w-full text-left text-sm'>
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
                                <StatusBadge tone='success'>
                                  Approved
                                </StatusBadge>
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
                                {!p.enabled
                                  ? 'Disabled'
                                  : testName(p.testStatus)}
                              </StatusBadge>
                            </div>
                          </td>
                          <td className='px-4 py-4'>
                            <div className='flex items-center gap-2'>
                              <Button
                                className='min-w-24'
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
                                className='min-w-24'
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
                </table>
              </div>
              {filtered.length > 10 && (
                <nav
                  aria-label='Model pages'
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
                {filtered.length} of {data.providers.length} models · Maximum 32
                per organization
              </p>
            </TabsContent>
            <TabsContent value='skills' className='mt-5'>
              <SkillsCatalogue />
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
                        <StatusBadge tone={r?.enabled ? 'success' : 'neutral'}>
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
                        className='mt-auto self-end'
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
                        <Settings2 aria-hidden='true' />
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
            <DialogTitle className='flex items-center gap-2.5'>
              <ProviderIcon provider={preset?.id} />
              {preset
                ? `${edit ? 'Configure' : 'Activate'} ${preset.name}`
                : edit
                  ? 'Edit model'
                  : 'Add model'}
            </DialogTitle>
            <DialogDescription>
              Saving approves this model for your organization. Keys stay
              private.
            </DialogDescription>
          </DialogHeader>
          {data && edit !== undefined && (
            <ProviderForm
              preset={preset}
              key={edit?.id ?? 'new'}
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
      inputPriceCentsPerMillion:
        f.get('inputRate') === null || f.get('inputRate') === ''
          ? (provider?.inputPriceCentsPerMillion ?? null)
          : Number(f.get('inputRate')),
      outputPriceCentsPerMillion:
        f.get('outputRate') === null || f.get('outputRate') === ''
          ? (provider?.outputPriceCentsPerMillion ?? null)
          : Number(f.get('outputRate')),
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
            <select
              className={selectClass}
              value={locality}
              onChange={(e) => {
                setLocality(e.target.value)
                setRequiresKey(e.target.value !== 'local')
              }}
            >
              <option value='hosted'>Hosted provider</option>
              <option value='local'>Self-hosted model</option>
            </select>
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
      {provider && (
        <fieldset className='space-y-3 rounded-lg border p-3'>
          <legend className='px-1 text-sm font-medium'>
            Review budget rates
          </legend>
          <div className='grid gap-3 sm:grid-cols-2'>
            <label className='space-y-2 text-sm'>
              <span>Input · cents per million tokens</span>
              <Input
                type='number'
                name='inputRate'
                min={0}
                max={100000000}
                placeholder='200'
                defaultValue={provider.inputPriceCentsPerMillion ?? ''}
              />
            </label>
            <label className='space-y-2 text-sm'>
              <span>Output · cents per million tokens</span>
              <Input
                type='number'
                name='outputRate'
                min={0}
                max={100000000}
                placeholder='800'
                defaultValue={provider.outputPriceCentsPerMillion ?? ''}
              />
            </label>
          </div>
        </fieldset>
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
          {busy ? 'Saving…' : 'Save routing'}
        </Button>
      </div>
    </form>
  )
}
