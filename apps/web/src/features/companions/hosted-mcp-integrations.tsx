import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Plug, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AgentLogo } from '@/assets/brand-icons/agent-logo'
import { API_BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { mcpCall, useMcpConnections } from './hosted-mcp-api'

type Consent = {
  id: string
  clientName: string
  redirectUri: string
  scopes: string[]
  repositories: { id: string; name: string }[]
  expiresAt: string
}
export function HostedMcpIntegrations({ requestId }: { requestId?: string }) {
  const session = useNavigationSession(),
    connections = useMcpConnections(),
    [agent, setAgent] = useState<'codex' | 'claude'>('codex'),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const consent = useQuery({
    queryKey: [
      'mcp-oauth-consent',
      session.data?.identityId,
      session.data?.organizationId,
      requestId,
    ],
    queryFn: () =>
      mcpCall<Consent>(`/consent?id=${encodeURIComponent(requestId!)}`),
    enabled: !!requestId,
    retry: false,
    gcTime: 0,
  })
  const endpoint = `${new URL(API_BASE_URL, window.location.origin).href.replace(/\/$/, '')}/mcp`
  const command =
    agent === 'codex'
      ? `codex mcp add preflyt --url ${endpoint}\ncodex mcp login preflyt`
      : `claude mcp add --transport http --scope user preflyt ${endpoint}`
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
  async function decide(deny = false) {
    await run(async () => {
      const result = await mcpCall<{ redirect: string }>('/approve', {
        id: requestId,
        ...(deny ? { deny: true } : { repositories: selected }),
      })
      const target = new URL(result.redirect),
        expected = consent.data && new URL(consent.data.redirectUri)
      if (
        !expected ||
        target.origin !== expected.origin ||
        target.pathname !== expected.pathname
      )
        throw new Error(
          'The return address changed. Start login from your agent again.'
        )
      window.location.assign(target.href)
    })
  }
  return (
    <section aria-label='Hosted MCP connection' className='space-y-5'>
      {requestId && (
        <Card className='border-primary/30'>
          <CardContent className='space-y-4 p-5'>
            <div className='flex gap-3'>
              <SurfaceIcon icon={ShieldCheck} tone='blue' />
              <div>
                <h2 className='font-semibold'>Approve agent access</h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Choose the repositories this MCP client can access.
                </p>
              </div>
            </div>
            {consent.isPending && <p role='status'>Loading access request…</p>}
            {consent.error && (
              <p role='alert' className='text-sm text-destructive'>
                {consent.error.message}
              </p>
            )}
            {consent.data && (
              <>
                <div className='space-y-1 rounded-lg border p-3'>
                  <p className='text-sm font-medium'>
                    {consent.data.clientName}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Client-provided name. Approve only if you started this login
                    in your agent.
                  </p>
                  <p className='text-xs break-all text-muted-foreground'>
                    Return address: {consent.data.redirectUri}
                  </p>
                </div>
                <fieldset className='space-y-3 rounded-lg border p-4'>
                  <legend className='px-1 text-sm font-medium'>
                    Repository access
                  </legend>
                  {consent.data.repositories.map((repo) => (
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
                  ))}
                  {!consent.data.repositories.length && (
                    <p className='text-sm text-muted-foreground'>
                      No repositories are available with your current
                      permissions.
                    </p>
                  )}
                </fieldset>
                <p className='text-sm text-muted-foreground'>
                  {consent.data.scopes.includes('findings:review')
                    ? 'Read saved findings and source excerpts, submit review evidence, and link proposed fix PRs.'
                    : 'Read saved findings and source excerpts.'}{' '}
                  Access expires in 30 days. You can disconnect at any time.
                </p>
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => void decide(true)}
                  >
                    Decline
                  </Button>
                  <Button
                    disabled={busy || !selected.length}
                    onClick={() => void decide()}
                  >
                    Approve access
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className='space-y-5 p-5'>
          <div className='flex gap-3'>
            <SurfaceIcon icon={Plug} tone='blue' />
            <div>
              <h2 className='font-semibold'>Connect your agent</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Add Preflyt once in your agent, then approve repository access
                in the browser.
              </p>
            </div>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {(
              [
                { id: 'codex', name: 'Codex', vendor: 'OpenAI' },
                { id: 'claude', name: 'Claude Code', vendor: 'Anthropic' },
              ] as const
            ).map((a) => (
              <button
                key={a.id}
                type='button'
                aria-pressed={agent === a.id}
                aria-label={a.name}
                onClick={() => setAgent(a.id)}
                className={cn(
                  'flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  agent === a.id && 'border-primary/50 bg-primary/5'
                )}
              >
                <span className='flex size-10 items-center justify-center rounded-xl border bg-muted/30'>
                  <AgentLogo agent={a.id} />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-semibold'>{a.name}</span>
                  <span className='text-xs text-muted-foreground'>
                    {a.vendor}
                  </span>
                </span>
                {agent === a.id && (
                  <Check className='size-4' aria-hidden='true' />
                )}
              </button>
            ))}
          </div>
          <div className='rounded-xl border'>
            <div className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2'>
              <h3 className='text-sm font-medium'>One-time connection</h3>
              <Button
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(command)
                    toast.success('Connection command copied.')
                  })
                }
              >
                <Copy />
                Copy command
              </Button>
            </div>
            <pre className='overflow-x-auto p-4 text-xs'>{command}</pre>
          </div>
          <p className='text-xs text-muted-foreground'>
            {agent === 'claude'
              ? 'Then run /mcp in Claude Code and choose Authenticate for Preflyt.'
              : 'Your agent opens the Preflyt approval page.'}{' '}
            Your agent stores and refreshes its credentials.
          </p>
          <div className='flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3'>
            <span className='text-xs font-medium'>Hosted MCP endpoint</span>
            <code className='min-w-0 flex-1 text-xs break-all'>{endpoint}</code>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(endpoint)
                  toast.success('MCP endpoint copied.')
                })
              }
            >
              <Copy />
              Copy URL
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className='space-y-4 p-5'>
          <h2 className='text-sm font-semibold'>Your agent connections</h2>
          {connections.isPending && (
            <p role='status' className='text-sm'>
              Loading agent connections…
            </p>
          )}
          {connections.error && (
            <p role='alert' className='text-sm text-destructive'>
              {connections.error.message}
            </p>
          )}
          {connections.data?.length === 0 && (
            <p className='text-sm text-muted-foreground'>
              No agents connected yet. Complete the one-time connection above.
            </p>
          )}
          {connections.data?.map((c) => (
            <div
              key={c.id}
              className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'
            >
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='text-sm font-medium break-words'>
                    {c.clientName}
                  </p>
                  <StatusBadge tone='neutral'>
                    {c.revokedAt
                      ? 'Disconnected'
                      : new Date(c.expiresAt) <= new Date()
                        ? 'Expired'
                        : 'Connected'}
                  </StatusBadge>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {c.repositories.length} approved repositories · Last used{' '}
                  {new Date(c.lastUsedAt).toLocaleString()}
                </p>
              </div>
              {!c.revokedAt && (
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mcpCall('/revoke', { id: c.id })
                      await connections.refetch()
                      toast.success('MCP connection disconnected.')
                    })
                  }
                >
                  Disconnect agent
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
    </section>
  )
}
