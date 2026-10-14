import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { healthRequest, type HealthData } from './health-api'

export function HealthTestSettings({
  repositoryId,
  data,
  allowed,
}: {
  repositoryId: string
  data: HealthData
  allowed: boolean
}) {
  const saved = data.testSettings ?? {
    command: '',
    directory: '.',
    framework: 'auto',
  }
  const [draft, setDraft] = useState(saved)
  const [open, setOpen] = useState(false)
  const cache = useQueryClient()
  const session = useNavigationSession()
  const apps = useQuery({
    queryKey: [
      'repository-health-test-apps',
      session.data?.organizationId,
      session.data?.identityId,
      repositoryId,
      data.branch,
    ],
    enabled: session.isSuccess,
    retry: false,
    queryFn: ({ signal }) =>
      healthRequest<{
        apps: Array<{ directory: string; name: string; framework: string }>
        complete: boolean
      }>(
        `repositories/${repositoryId}/health/test-apps?${new URLSearchParams(data.branch ? { branch: data.branch } : {})}`,
        signal
      ),
    staleTime: 60000,
  })
  const mutation = useMutation({
    mutationFn: () =>
      healthRequest(
        `repositories/${repositoryId}/health/test-settings`,
        undefined,
        { ...draft, expectedRevision: data.testSettingsRevision ?? 0 }
      ),
    meta: {
      successMessage: 'Test settings saved. Run test coverage to use them.',
    },
    onSuccess: () => {
      setOpen(false)
      void cache.invalidateQueries({ queryKey: ['repository-health'] })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(saved)
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button
          size='icon'
          variant='outline'
          aria-label='Test coverage settings'
        >
          <Settings2 aria-hidden='true' />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Test coverage settings</DialogTitle>
          <DialogDescription>
            {saved.command
              ? 'A command override is saved for this repository.'
              : 'Test commands are detected automatically.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='health-test-app'>App to test</Label>
            {apps.isPending ? (
              <p
                role='status'
                className='flex items-center gap-2 text-sm text-muted-foreground'
              >
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
                Detecting apps…
              </p>
            ) : apps.isError ? (
              <div role='alert' className='space-y-2 text-sm'>
                <p>
                  Could not detect apps. Retry to load the repository’s test
                  setup.
                </p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void apps.refetch()}
                >
                  Retry detection
                </Button>
              </div>
            ) : (
              <>
                <select
                  id='health-test-app'
                  className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                  disabled={!allowed || mutation.isPending}
                  value={draft.packageDirectory ?? '__all'}
                  onChange={(e) => {
                    const rest = { ...draft }
                    delete rest.packageDirectory
                    setDraft(
                      e.target.value === '__all'
                        ? { ...rest, command: '', framework: 'auto' }
                        : {
                            ...rest,
                            packageDirectory: e.target.value,
                            directory: e.target.value,
                            command: '',
                            framework: 'auto',
                          }
                    )
                  }}
                >
                  <option value='__all'>All detected apps</option>
                  {(apps.data?.apps ?? []).map((app) => (
                    <option key={app.directory} value={app.directory}>
                      {app.name} — {app.directory} ·{' '}
                      {app.framework === 'node' ? 'Node tests' : app.framework}
                    </option>
                  ))}
                  {draft.packageDirectory &&
                    !apps.data?.apps?.some(
                      (app) => app.directory === draft.packageDirectory
                    ) && (
                      <option value={draft.packageDirectory}>
                        {draft.packageDirectory} — not detected on this branch
                      </option>
                    )}
                </select>
                {!apps.data?.apps?.length && (
                  <p className='text-sm text-muted-foreground'>
                    No test apps detected. Add a test script to package.json, or
                    use Advanced settings.
                  </p>
                )}
                {apps.data?.complete === false && (
                  <p className='text-sm text-muted-foreground'>
                    Some repository files could not be read. This list may be
                    incomplete.
                  </p>
                )}
                <p className='text-xs text-muted-foreground'>
                  Uses the selected app’s existing test command. This choice is
                  saved for future assessments.
                </p>
              </>
            )}
          </div>
          <details className='rounded-lg border p-3'>
            <summary className='cursor-pointer text-sm font-medium'>
              Advanced settings
            </summary>
            <div className='mt-3 space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='health-test-framework'>Test framework</Label>
                  <select
                    id='health-test-framework'
                    className='h-9 w-full rounded-md border bg-background px-3 text-sm'
                    disabled={!allowed || mutation.isPending}
                    value={draft.framework}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        framework: e.target.value as typeof draft.framework,
                        ...(e.target.value === 'auto' ? { command: '' } : {}),
                      })
                    }
                  >
                    <option value='auto'>Detect automatically</option>
                    <option value='vitest'>Vitest</option>
                    <option value='jest'>Jest</option>
                    <option value='node'>Node test runner</option>
                  </select>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='health-test-directory'>
                    Package directory
                  </Label>
                  <Input
                    id='health-test-directory'
                    value={draft.directory}
                    maxLength={244}
                    disabled={
                      !allowed ||
                      mutation.isPending ||
                      draft.packageDirectory !== undefined
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, directory: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='health-test-command'>
                  Command override (optional)
                </Label>
                <Input
                  id='health-test-command'
                  value={draft.command}
                  maxLength={2000}
                  placeholder='npm run test:unit --'
                  disabled={
                    !allowed || draft.framework === 'auto' || mutation.isPending
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, command: e.target.value })
                  }
                />
                <p className='text-xs text-muted-foreground'>
                  Leave empty to use each package’s test script. For an
                  override, choose its framework; Preflyt appends coverage and
                  result-report flags. Do not include credentials.
                </p>
              </div>
            </div>
          </details>
          {mutation.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {mutation.error.message}
            </p>
          )}
          {allowed && (
            <div className='flex justify-end'>
              <Button size='sm' type='submit' disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save test settings'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
