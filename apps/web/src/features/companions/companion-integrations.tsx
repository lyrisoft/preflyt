import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Monitor, Plug, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AgentLogo } from '@/assets/brand-icons/agent-logo'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { FindingAgentActions } from '@/features/findings/finding-agent-actions'
import type { Finding } from '@/features/findings/finding-types'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { companionCall, companionStatus, useCompanions } from './companion-api'
import { HostedMcpIntegrations } from './hosted-mcp-integrations'

type Consent = {
  id: string
  name: string
  agents: ('codex' | 'claude')[]
  repositories: { id: string; name: string }[]
  expiresAt: string
}
export type ManualScope = {
  origin: 'ci' | 'health' | 'ai'
  repositoryId: string
  assessmentId: string
  findingId: string
}
export function CompanionIntegrations({
  requestId,
  oauthRequestId,
  manualScope,
}: {
  requestId?: string
  oauthRequestId?: string
  manualScope?: ManualScope
}) {
  const session = useNavigationSession()
  const connections = useCompanions(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([])
  const consent = useQuery({
    queryKey: [
      'companion-consent',
      session.data?.identityId,
      session.data?.organizationId,
      requestId,
    ],
    queryFn: () =>
      companionCall<Consent>(`/consent?id=${encodeURIComponent(requestId!)}`),
    enabled: !!requestId,
    retry: false,
    gcTime: 0,
  })
  const context = useQuery({
    queryKey: [
      'manual-finding-context',
      session.data?.identityId,
      session.data?.organizationId,
      manualScope,
    ],
    enabled: !!manualScope,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/finding-agents/context?${new URLSearchParams(manualScope!)}`,
        { credentials: 'include', cache: 'no-store' }
      )
      if (!response.ok)
        throw new Error(
          'This finding is unavailable. Open it from Findings and try again.'
        )
      const data = await response.json()
      return { ...data, id: data.findingId } as Finding
    },
  })
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const api = new URL(API_BASE_URL, window.location.origin).href.replace(
    /\/$/,
    ''
  )
  return (
    <section className='space-y-5' aria-label='MCP and coding agents'>
      <HostedMcpIntegrations requestId={oauthRequestId} />
      <details className='rounded-xl border bg-card p-5' open={!!requestId}>
        <summary className='cursor-pointer text-sm font-medium'>
          Optional: run local tasks with the companion
        </summary>
        <div className='mt-4 space-y-5'>
          {requestId && (
            <Card className='border-primary/30'>
              <CardContent className='space-y-4 p-5'>
                <div className='flex items-center gap-3'>
                  <SurfaceIcon icon={ShieldCheck} tone='blue' />
                  <div>
                    <h2 className='font-semibold'>Connect this computer</h2>
                    <p className='text-sm text-muted-foreground'>
                      Approve the repositories this companion can work on.
                    </p>
                  </div>
                </div>
                {consent.isPending && (
                  <p role='status'>Loading connection request…</p>
                )}
                {consent.error && (
                  <p role='alert' className='text-sm text-destructive'>
                    {consent.error.message}
                  </p>
                )}
                {consent.data && (
                  <>
                    <p className='text-sm font-medium'>{consent.data.name}</p>
                    <div className='flex flex-wrap gap-4'>
                      {consent.data.agents.map((agent) => (
                        <span
                          key={agent}
                          className='flex items-center gap-2 text-sm'
                        >
                          <AgentLogo agent={agent} className='size-5' />
                          {agent === 'codex' ? 'Codex' : 'Claude Code'}
                        </span>
                      ))}
                    </div>
                    <fieldset className='space-y-3 rounded-lg border p-4'>
                      <legend className='px-1 text-sm font-medium'>
                        Repository access
                      </legend>
                      {consent.data.repositories.length ? (
                        consent.data.repositories.map((repo) => (
                          <label
                            key={repo.id}
                            className='flex items-center gap-3 text-sm'
                          >
                            <Checkbox
                              checked={selected.includes(repo.id)}
                              onCheckedChange={(value) =>
                                setSelected((current) =>
                                  value
                                    ? [...current, repo.id]
                                    : current.filter((id) => id !== repo.id)
                                )
                              }
                            />
                            {repo.name}
                          </label>
                        ))
                      ) : (
                        <p className='text-sm text-muted-foreground'>
                          No local repositories match your access in this
                          workspace.
                        </p>
                      )}
                    </fieldset>
                    <p className='text-xs leading-5 text-muted-foreground'>
                      Tasks run only when you request them. The companion uses
                      your signed-in agent and may use its paid allowance. Fixes
                      stay in separate local worktrees for review. Access
                      expires in 30 days; you can disconnect at any time.
                    </p>
                    <Button
                      disabled={busy || !selected.length}
                      onClick={() =>
                        void run(async () => {
                          const result = await companionCall<{
                            redirect: string
                          }>('/approve', {
                            id: requestId,
                            repositories: selected,
                          })
                          const redirect = new URL(result.redirect)
                          if (
                            redirect.protocol !== 'http:' ||
                            redirect.hostname !== '127.0.0.1' ||
                            redirect.pathname !== '/callback'
                          )
                            throw new Error(
                              'The companion callback is invalid. Restart pairing.'
                            )
                          window.location.assign(redirect.href)
                        })
                      }
                    >
                      Approve connection
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className='space-y-5 p-5'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='flex gap-3'>
                  <SurfaceIcon icon={Plug} tone='blue' />
                  <div>
                    <h2 className='font-semibold'>Local companion</h2>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      Start agents on this computer from Preflyt. Hosted MCP
                      connections work independently.
                    </p>
                  </div>
                </div>
                <Button variant='outline' size='sm' asChild>
                  <a
                    href={`${API_BASE_URL}/companions/download`}
                    download='preflyt-companion.mjs'
                  >
                    <Download />
                    Download companion
                  </a>
                </Button>
              </div>
              {connections.isPending && (
                <p role='status' className='text-sm'>
                  Loading your computers…
                </p>
              )}
              {connections.error && (
                <p role='alert' className='text-sm text-destructive'>
                  {connections.error.message}
                </p>
              )}
              {connections.data?.length === 0 && (
                <div className='rounded-lg border border-dashed p-5 text-sm text-muted-foreground'>
                  No computers connected. Set up the companion below to start
                  your first review.
                </div>
              )}
              <div className='space-y-3'>
                {connections.data?.map((c) => (
                  <div
                    key={c.id}
                    className='flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4'
                  >
                    <div className='flex min-w-0 gap-3'>
                      <SurfaceIcon icon={Monitor} tone='blue' />
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='text-sm font-medium break-words'>
                            {c.name}
                          </h3>
                          <StatusBadge tone='neutral'>
                            {companionStatus(c)}
                          </StatusBadge>
                        </div>
                        <div className='mt-2 flex flex-wrap gap-3'>
                          {c.agents.map((agent) => (
                            <span
                              key={agent}
                              className='flex items-center gap-1.5 text-xs'
                            >
                              <AgentLogo agent={agent} className='size-4' />
                              {agent === 'codex' ? 'Codex' : 'Claude Code'}
                            </span>
                          ))}
                        </div>
                        <p className='mt-2 text-xs text-muted-foreground'>
                          {c.repositories.length} approved repositories · Last
                          seen {new Date(c.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {!c.revokedAt && (
                      <Button
                        variant='destructive'
                        size='sm'
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await companionCall('/revoke', { id: c.id })
                            await connections.refetch()
                            toast.success(
                              'Companion disconnected. Active tasks were cancelled.'
                            )
                          })
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <details
                className='rounded-xl border p-4'
                open={!connections.data?.some((c) => !c.revokedAt)}
              >
                <summary className='cursor-pointer text-sm font-medium'>
                  One-time setup
                </summary>
                <div className='mt-3 space-y-3 text-sm'>
                  <p className='text-muted-foreground'>
                    Requires Node.js 22+, Git, and a signed-in Codex or Claude
                    Code CLI. Download the companion and start it with your
                    trusted repository folder.
                  </p>
                  <pre className='overflow-x-auto rounded-md bg-muted p-3 text-xs'>{`node ~/Downloads/preflyt-companion.mjs --server ${api} --workspace /path/to/your/repos`}</pre>
                  <p className='text-xs text-muted-foreground'>
                    A browser window opens for approval. Keep the companion
                    running while you use Preflyt. Repository execution stays
                    subject to the agent’s permissions.
                  </p>
                </div>
              </details>
              {error && (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </details>
      <details className='rounded-xl border bg-card p-5'>
        <summary className='cursor-pointer text-sm font-medium'>
          Advanced: manual MCP connection
        </summary>
        <div className='mt-4 space-y-3'>
          <p className='text-sm text-muted-foreground'>
            For a client you manage yourself. Open a finding and choose Manage
            agent connections to create a temporary connection for that finding.
          </p>
          {context.isPending && manualScope && (
            <p role='status'>Loading finding…</p>
          )}
          {context.error && (
            <p role='alert' className='text-sm text-destructive'>
              {context.error.message}
            </p>
          )}
          {context.data && manualScope && (
            <FindingAgentActions
              finding={context.data}
              origin={manualScope.origin}
              manual
            />
          )}
          <p className='text-xs break-all text-muted-foreground'>
            MCP endpoint: {api}/mcp
          </p>
        </div>
      </details>
    </section>
  )
}
