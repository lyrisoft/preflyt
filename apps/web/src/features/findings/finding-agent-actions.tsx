import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Plug, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AgentLogo } from '@/assets/brand-icons/agent-logo'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { FindingCompanionActions } from '@/features/companions/finding-companion-actions'
import { useMcpConnections } from '@/features/companions/hosted-mcp-api'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { agentLaunchUrl, connectedLaunchAgents } from './agent-launch'
import { FindingAgentDialog } from './finding-agent-dialog'
import type { Finding } from './finding-types'

type Scope = {
  origin: 'health' | 'ci' | 'ai'
  repositoryId: string
  assessmentId: string
  findingId: string
}
type Connection = { id: string; expiresAt: string; revokedAt: string | null }
type History = {
  canConnect: boolean
  grants: Connection[]
  evidence: {
    id: string
    kind: string
    createdAt: string
    content: Record<string, string>
  }[]
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/finding-agents${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'The finding connection could not be updated. Try again.'
    )
  }
  return response.json()
}
export function FindingAgentActions({
  finding,
  origin,
  manual = false,
}: {
  finding: Finding
  origin: Scope['origin']
  manual?: boolean
}) {
  const session = useNavigationSession()
  const scope: Scope = {
    origin,
    repositoryId: finding.repositoryId,
    assessmentId: finding.assessmentId,
    findingId: finding.id,
  }
  const query = new URLSearchParams(scope).toString()
  const [open, setOpen] = useState(false),
    [client, setClient] = useState<'codex' | 'claude'>('codex')
  const [credential, setCredential] = useState<{
    id: string
    token: string
    expiresAt: string
  } | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const history = useQuery({
    queryKey: [
      'finding-agent-history',
      session.data?.identityId,
      session.data?.organizationId,
      query,
    ],
    queryFn: () => call<History>(`?${query}`),
    gcTime: 0,
    retry: false,
    refetchInterval: 10000,
  })
  const connections = useMcpConnections(!manual)
  const agents = connectedLaunchAgents(
    Array.isArray(connections.data) ? connections.data : [],
    scope.repositoryId
  )
  const launchTask = useQuery({
    queryKey: [
      'finding-agent-launch',
      session.data?.identityId,
      session.data?.organizationId,
      query,
    ],
    queryFn: () =>
      call<{ prompt: string; repository: string }>(`/launch-task?${query}`),
    enabled: !manual && agents.length > 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const active =
    history.data?.grants.filter(
      (grant) => !grant.revokedAt && new Date(grant.expiresAt) > new Date()
    ) ?? []
  const mcpUrl = `${new URL(API_BASE_URL, window.location.origin).href.replace(/\/$/, '')}/mcp`
  const config =
    client === 'codex'
      ? `[mcp_servers.preflyt_finding]\nurl = ${JSON.stringify(mcpUrl)}\nbearer_token_env_var = "PREFLYT_FINDING_TOKEN"`
      : JSON.stringify(
          {
            mcpServers: {
              preflyt_finding: {
                type: 'http',
                url: mcpUrl,
                headers: { Authorization: 'Bearer ${PREFLYT_FINDING_TOKEN}' },
              },
            },
          },
          null,
          2
        )
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'This action failed. Try again.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function copy(text: string, message: string) {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  }
  if (['check', 'evidence'].includes(finding.category ?? '')) return null
  return (
    <Card>
      <CardContent className='space-y-4 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='blue' />
            <div>
              <h2 className='text-sm font-semibold'>External verification</h2>
              <p className='mt-1 text-xs text-muted-foreground'>
                Review this finding with a connected coding agent.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {agents.map((agent) =>
              launchTask.data?.prompt ? (
                <Button key={agent.id} variant='outline' size='sm' asChild>
                  <a
                    href={agentLaunchUrl(
                      agent.id,
                      launchTask.data.prompt,
                      launchTask.data.repository
                    )}
                    aria-label={`Open in ${agent.name}`}
                  >
                    <AgentLogo agent={agent.id} className='size-4' />
                    Open in {agent.name}
                  </a>
                </Button>
              ) : (
                <Button
                  key={agent.id}
                  variant='outline'
                  size='sm'
                  disabled
                  aria-label={`Open in ${agent.name}`}
                >
                  <AgentLogo agent={agent.id} className='size-4' />
                  Open in {agent.name}
                </Button>
              )
            )}
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await call<{ task: string }>(`/task?${query}`)
                  await copy(result.task, 'Verification task copied.')
                })
              }
            >
              <Copy />
              Copy verification task
            </Button>
            {manual && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setError(null)
                  setOpen(true)
                }}
              >
                <Plug />
                Connect agent
              </Button>
            )}
          </div>
        </div>
        {!manual && (
          <p className='text-xs text-muted-foreground'>
            {agents.length
              ? 'Opens your desktop app with the task filled in. Send it to start.'
              : 'Connect a supported coding agent in Integrations, or copy the task into your agent.'}
          </p>
        )}
        {connections.isError && !manual && (
          <p role='alert' className='text-sm text-destructive'>
            Agent connections could not be loaded.{' '}
            <button
              className='underline'
              onClick={() => void connections.refetch()}
            >
              Try again
            </button>
          </p>
        )}
        {launchTask.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {launchTask.error.message}{' '}
            <button
              className='underline'
              onClick={() => void launchTask.refetch()}
            >
              Retry agent links
            </button>
          </p>
        )}
        {!manual && (
          <FindingCompanionActions
            scope={scope}
            canRun={history.data?.canConnect ?? false}
            onChanged={() => void history.refetch()}
          />
        )}
        {error && !open && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
        {history.isError && (
          <p role='alert' className='text-sm text-destructive'>
            External review history could not be loaded.{' '}
            <button
              className='underline'
              onClick={() => void history.refetch()}
            >
              Try again
            </button>
          </p>
        )}
        {!!history.data?.evidence.length && (
          <div className='space-y-3 border-t pt-4'>
            <p className='text-xs text-muted-foreground'>
              External reports require review. Scan results and merge rules are
              unchanged.
            </p>
            {history.data.evidence.map((item) => (
              <article
                key={item.id}
                className='space-y-2 rounded-lg border p-3'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge tone='info'>External report</StatusBadge>
                  <span className='text-sm font-medium'>
                    {item.content.agent}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                {item.kind === 'fix_pr' ? (
                  <>
                    <p className='text-sm'>{item.content.summary}</p>
                    <a
                      className='text-sm underline'
                      href={item.content.url}
                      target='_blank'
                      rel='noreferrer'
                    >
                      View proposed fix PR
                    </a>
                    <p className='font-mono text-xs break-all text-muted-foreground'>
                      Reported patch commit: {item.content.patchSha}
                    </p>
                  </>
                ) : (
                  <>
                    <p className='text-sm font-medium'>
                      {
                        (
                          {
                            SUPPORTED: 'Issue supported by external review',
                            NOT_REPRODUCED: 'Issue not reproduced',
                            INCONCLUSIVE: 'Review inconclusive',
                          } as Record<string, string>
                        )[item.content.outcome]
                      }
                    </p>
                    <p className='text-sm leading-relaxed whitespace-pre-wrap'>
                      {item.content.reasoning}
                    </p>
                    <details className='text-sm'>
                      <summary className='cursor-pointer'>
                        Commands and results
                      </summary>
                      <pre className='mt-2 rounded-md bg-muted p-3 text-xs break-words whitespace-pre-wrap'>
                        {item.content.commands}
                        {'\n\n'}
                        {item.content.results}
                      </pre>
                    </details>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
        {manual && (
          <FindingAgentDialog
            open={open}
            onOpenChange={(value) => {
              if (busy && !value) return
              setOpen(value)
              setCredential(null)
              setError(null)
            }}
            finding={finding}
            client={client}
            onClientChange={setClient}
            credential={credential}
            active={active}
            canConnect={history.data?.canConnect}
            busy={busy}
            error={error}
            config={config}
            onCreate={() =>
              void run(async () => {
                setCredential(await call('/connections', scope))
                await history.refetch()
                toast.success('Finding connection created.')
              })
            }
            onRevoke={(id) =>
              void run(async () => {
                await call('/revoke', { id })
                if (credential?.id === id) setCredential(null)
                await history.refetch()
                toast.success('Finding connection revoked.')
              })
            }
            onCopyToken={() =>
              void run(() =>
                copy(credential!.token, 'Private finding token copied.')
              )
            }
            onCopyConfig={() =>
              void run(() => copy(config, 'Agent configuration copied.'))
            }
            onCopyTask={() =>
              void run(async () => {
                const result = await call<{ task: string }>(`/task?${query}`)
                await copy(result.task, 'Verification task copied.')
              })
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
