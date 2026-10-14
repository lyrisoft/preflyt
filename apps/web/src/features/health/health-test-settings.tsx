import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TestTubeDiagonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SurfaceIcon } from '@/components/surface-icon'
import { healthRequest, healthReasons, type HealthData } from './health-api'

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
  const cache = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      healthRequest(
        `repositories/${repositoryId}/health/test-settings`,
        undefined,
        { ...draft, expectedRevision: data.testSettingsRevision ?? 0 }
      ),
    meta: { successMessage: 'Test settings saved. Reassess to use them.' },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ['repository-health'] }),
  })
  const coverage = data.assessment?.report?.measurements?.coverage
  return (
    <details className='rounded-xl border bg-card p-4'>
      <summary
        aria-label='Tests and coverage'
        className='flex cursor-pointer items-center gap-3 text-sm font-semibold'
      >
        <SurfaceIcon icon={TestTubeDiagonal} tone='teal' />
        <span>
          Tests and coverage
          <span className='mt-1 block text-xs font-normal text-muted-foreground'>
            {saved.command
              ? 'Saved command override'
              : 'Detect test commands automatically'}{' '}
            · Configure
          </span>
        </span>
      </summary>
      <div className='mt-4 space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Preflyt uses existing test commands and configuration. Vitest, Jest
          and Node tests run in isolated containers at the assessed commit.
          Monorepo packages run separately; coverage combines measured lines.
        </p>
        {coverage?.packages && (
          <ul className='text-sm'>
            {coverage.packages.map((p) => (
              <li key={p.directory}>
                <code>{p.directory}</code> · {p.framework} · {p.manager}
              </li>
            ))}
          </ul>
        )}
        {data.assessment?.report?.analyses
          .find((a) => a.id === 'tests.coverage')
          ?.testResults?.map((result) => (
            <div
              key={result.directory}
              className='rounded-md border p-3 text-sm'
            >
              <p className='font-medium'>
                {result.directory} · {result.framework}
              </p>
              <p className='mt-1 text-muted-foreground'>
                {result.state === 'PASS'
                  ? 'Tests passed; coverage collected.'
                  : (healthReasons[result.reason] ??
                    'Test execution was incomplete.')}
              </p>
            </div>
          ))}
        <form
          className='space-y-3'
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
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
              <Label htmlFor='health-test-directory'>Package directory</Label>
              <Input
                id='health-test-directory'
                value={draft.directory}
                maxLength={244}
                disabled={!allowed || mutation.isPending}
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
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
            />
            <p className='text-xs text-muted-foreground'>
              Leave empty to use each package’s test script. For an override,
              choose its framework; Preflyt appends coverage and result-report
              flags. Do not include credentials.
            </p>
          </div>
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
      </div>
    </details>
  )
}
