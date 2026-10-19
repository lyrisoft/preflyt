import {
  Check,
  Clock3,
  Copy,
  GitCommitHorizontal,
  KeyRound,
  LoaderCircle,
  Plug,
  ShieldCheck,
} from 'lucide-react'
import { AgentLogo } from '@/assets/brand-icons/agent-logo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SurfaceIcon } from '@/components/surface-icon'
import type { Finding } from './finding-types'

type Credential = { id: string; token: string; expiresAt: string }
type Connection = { id: string; expiresAt: string; revokedAt: string | null }
export function FindingAgentDialog({
  open,
  onOpenChange,
  finding,
  client,
  onClientChange,
  credential,
  active,
  canConnect,
  busy,
  error,
  config,
  onCreate,
  onRevoke,
  onCopyToken,
  onCopyConfig,
  onCopyTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  finding: Finding
  client: 'codex' | 'claude'
  onClientChange: (client: 'codex' | 'claude') => void
  credential: Credential | null
  active: Connection[]
  canConnect: boolean | undefined
  busy: boolean
  error: string | null
  config: string
  onCreate: () => void
  onRevoke: (id: string) => void
  onCopyToken: () => void
  onCopyConfig: () => void
  onCopyTask: () => void
}) {
  const agents = [
    { id: 'codex', name: 'Codex', vendor: 'OpenAI' },
    { id: 'claude', name: 'Claude Code', vendor: 'Anthropic' },
  ] as const
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-[40rem]'>
        <DialogHeader className='flex-row items-center gap-3 border-b px-5 py-5 pr-12 text-start sm:px-6 sm:pr-12'>
          <SurfaceIcon icon={Plug} tone='blue' />
          <div className='min-w-0 space-y-1'>
            <DialogTitle className='text-lg leading-6'>
              Connect a coding agent
            </DialogTitle>
            <DialogDescription className='text-xs leading-5'>
              Give your agent the evidence for this finding.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className='space-y-5 px-5 py-5 sm:px-6'>
          <div
            className='grid grid-cols-1 gap-3 min-[380px]:grid-cols-2'
            aria-label='Coding agent'
          >
            {agents.map((agent) => (
              <button
                key={agent.id}
                type='button'
                aria-label={agent.name}
                aria-pressed={client === agent.id}
                disabled={busy}
                onClick={() => onClientChange(agent.id)}
                className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${client === agent.id ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40'}`}
              >
                <span className='flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background'>
                  <AgentLogo agent={agent.id} />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-semibold'>
                    {agent.name}
                  </span>
                  <span className='mt-0.5 block text-xs text-muted-foreground'>
                    {agent.vendor}
                  </span>
                </span>
                <span
                  aria-hidden='true'
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${client === agent.id ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
                >
                  {client === agent.id && <Check className='size-3' />}
                </span>
              </button>
            ))}
          </div>
          <div className='rounded-lg border bg-muted/20 px-3 py-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-[11px] font-medium tracking-wide text-muted-foreground uppercase'>
                Connection scope
              </p>
              <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                <Clock3 className='size-3.5' aria-hidden='true' />
                {credential
                  ? `Expires ${new Date(credential.expiresAt).toLocaleString()}`
                  : '24-hour access'}
              </span>
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1'>
              <span className='text-sm font-medium break-all'>
                {finding.repository}
              </span>
              <span className='inline-flex items-center gap-1 font-mono text-xs text-muted-foreground'>
                <GitCommitHorizontal className='size-3.5' aria-hidden='true' />
                {finding.sourceSha.slice(0, 12)}
              </span>
            </div>
            <p className='mt-1.5 text-xs text-muted-foreground'>
              One finding · Saved source · Review evidence · Fix PR links
            </p>
          </div>
          {!credential ? (
            <div className='flex items-start gap-2 text-xs leading-5 text-muted-foreground'>
              <ShieldCheck
                className='mt-0.5 size-4 shrink-0'
                aria-hidden='true'
              />
              <p>
                Findings stay under human review. Your agent uses its own
                repository access to propose changes.
              </p>
            </div>
          ) : (
            <ol className='space-y-5' aria-label='Agent setup steps'>
              <li className='flex min-w-0 gap-3'>
                <StepNumber number={1} />
                <div className='min-w-0 flex-1 space-y-2'>
                  <h3 className='text-sm font-semibold'>
                    Set the private token
                  </h3>
                  <p className='text-xs leading-5 text-muted-foreground'>
                    Set{' '}
                    <code className='font-mono break-all text-foreground'>
                      PREFLYT_FINDING_TOKEN
                    </code>{' '}
                    before starting your agent. Keep it out of Git.
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={onCopyToken}
                  >
                    <KeyRound />
                    Copy private token
                  </Button>
                </div>
              </li>
              <li className='flex min-w-0 gap-3'>
                <StepNumber number={2} />
                <div className='min-w-0 flex-1 space-y-2'>
                  <h3 className='text-sm font-semibold'>Add the connector</h3>
                  <div className='overflow-hidden rounded-lg border'>
                    <div className='flex flex-wrap items-center justify-between gap-1 border-b bg-muted/30 px-3 py-1.5'>
                      <code className='text-xs break-all text-muted-foreground'>
                        {client === 'codex'
                          ? '~/.codex/config.toml'
                          : '.mcp.json'}
                      </code>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={busy}
                        onClick={onCopyConfig}
                      >
                        <Copy />
                        Copy configuration
                      </Button>
                    </div>
                    <pre className='max-h-44 overflow-auto bg-muted/10 p-3 font-mono text-[11px] leading-5'>
                      {config}
                    </pre>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Merge this configuration, then restart or reconnect your
                    agent.
                  </p>
                </div>
              </li>
              <li className='flex min-w-0 gap-3'>
                <StepNumber number={3} />
                <div className='min-w-0 flex-1 space-y-1'>
                  <h3 className='text-sm font-semibold'>Start verification</h3>
                  <p className='text-xs leading-5 text-muted-foreground'>
                    Paste the verification task into your agent. Its review and
                    fix PR links will appear on this finding.
                  </p>
                </div>
              </li>
            </ol>
          )}
          {canConnect === false && (
            <p className='text-sm text-muted-foreground'>
              You need permission to run AI reviews for this repository.
            </p>
          )}
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          {!!active.length && (
            <details className='border-t pt-3'>
              <summary className='cursor-pointer text-xs font-medium text-muted-foreground'>
                Your active connections ({active.length})
              </summary>
              <div className='mt-2 space-y-2'>
                {active.map((grant) => (
                  <div
                    className='flex items-center justify-between gap-3'
                    key={grant.id}
                  >
                    <span className='text-xs text-muted-foreground'>
                      Expires {new Date(grant.expiresAt).toLocaleString()}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={busy}
                      onClick={() => onRevoke(grant.id)}
                    >
                      Revoke connection
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-5 py-3 sm:px-6'>
          <span className='text-xs text-muted-foreground'>
            {credential
              ? 'Token available only during this setup.'
              : 'Access can be revoked at any time.'}
          </span>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {credential ? 'Done' : 'Cancel'}
            </Button>
            {credential ? (
              <Button size='sm' disabled={busy} onClick={onCopyTask}>
                <Copy />
                Copy verification task
              </Button>
            ) : (
              <Button
                size='sm'
                disabled={busy || !canConnect}
                onClick={onCreate}
              >
                {busy ? (
                  <LoaderCircle className='motion-safe:animate-spin' />
                ) : (
                  <Plug />
                )}
                Create connection
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function StepNumber({ number }: { number: number }) {
  return (
    <span
      aria-hidden='true'
      className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted/30 text-[11px] font-medium text-muted-foreground'
    >
      {number}
    </span>
  )
}
