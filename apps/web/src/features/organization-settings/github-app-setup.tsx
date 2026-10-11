import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { GitBranch, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/status-badge'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/configuration/github-app${path}`,
    { credentials: 'include', cache: 'no-store', ...options }
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : 'GitHub App setup is unavailable. Try again.'
    )
  }
  return response.json() as Promise<T>
}
export function GitHubAppSetup({
  revision,
  connected,
  publicApiUrl,
  disabled,
}: {
  revision: number
  connected: boolean
  publicApiUrl: string
  disabled: boolean
}) {
  const [organization, setOrganization] = useState('')
  const [name, setName] = useState('Preflyt')
  const [apiUrl, setApiUrl] = useState(publicApiUrl)
  const [setupPullRequests, setSetupPullRequests] = useState(false)
  const [managedProtection, setManagedProtection] = useState(false)
  const [review, setReview] = useState(false)
  const status = useQuery({
    queryKey: ['github-app-registration', revision],
    queryFn: ({ signal }) =>
      request<{ status: string | null; installationUrl: string | null }>(
        '/status',
        { signal }
      ),
    retry: false,
    gcTime: 0,
  })
  const create = useMutation({
    mutationFn: () =>
      request<{ action: string; manifest: object }>('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: revision,
          organization,
          name,
          apiUrl,
          setupPullRequests,
          managedProtection,
        }),
      }),
    onSuccess: ({ action, manifest }) => {
      const destination = new URL(action)
      if (
        destination.origin !== 'https://github.com' ||
        !/^\/organizations\/[a-z\d-]+\/settings\/apps\/new$/i.test(
          destination.pathname
        )
      )
        throw new Error('Invalid GitHub registration destination')
      // GitHub requires a browser POST. Only the public manifest leaves this page.
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = action
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'manifest'
      input.value = JSON.stringify(manifest)
      form.append(input)
      document.body.append(form)
      form.submit()
      form.remove()
    },
  })
  return (
    <section className='space-y-4 border-b p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h4 className='flex items-center gap-2 font-semibold'>
          <GitBranch className='size-4' />
          {connected ? 'One GitHub App' : 'Create your GitHub App'}
        </h4>
        {connected && <StatusBadge tone='success'>Connected</StatusBadge>}
      </div>
      {connected ? (
        <>
          <p className='text-sm text-muted-foreground'>
            Use this App for repository access, PR reviews and check
            publication. Add Contents and Workflows write permissions to create
            setup PRs, or Repository Administration and Organization Administration
            write permissions for
            Preflyt-managed protection, then approve the updated installation in
            GitHub.
          </p>
          <p className='text-xs text-muted-foreground'>
            A separate governance App is optional. Existing policies and model
            routing are preserved.
          </p>
        </>
      ) : (
        <>
          <p className='text-sm text-muted-foreground'>
            Preflyt supplies permissions, callbacks and webhook settings.
            Confirm the App in GitHub; generated credentials are saved encrypted
            automatically.
          </p>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='manifest-organization'>GitHub organization</Label>
              <Input
                id='manifest-organization'
                value={organization}
                onChange={(e) => {
                  const next = e.target.value.trim()
                  if (name === 'Preflyt' || name === `Preflyt ${organization}`)
                    setName(`Preflyt ${next}`.trim())
                  setOrganization(next)
                  setReview(false)
                }}
                placeholder='your-organization'
                disabled={create.isPending || disabled}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='manifest-name'>App name</Label>
              <Input
                id='manifest-name'
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setReview(false)
                }}
                disabled={create.isPending || disabled}
              />
            </div>
            <div className='space-y-2 md:col-span-2'>
              <Label htmlFor='manifest-api'>Public HTTPS API URL</Label>
              <Input
                id='manifest-api'
                value={apiUrl}
                onChange={(e) => {
                  setApiUrl(e.target.value.trim())
                  setReview(false)
                }}
                placeholder='https://preflyt.example.com/api'
                disabled={create.isPending || disabled}
              />
              <p className='text-xs text-muted-foreground'>
                GitHub must reach this URL for webhook and Action requests. A
                local installation needs a tunnel exposing these endpoints.
              </p>
            </div>
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
              <Label htmlFor='manifest-setup'>Create setup PRs</Label>
              <Switch
                id='manifest-setup'
                checked={setupPullRequests}
                disabled={create.isPending || disabled}
                onCheckedChange={(v) => {
                  setSetupPullRequests(v)
                  setReview(false)
                }}
              />
            </div>
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
              <Label htmlFor='manifest-protection'>
                Manage GitHub rulesets
              </Label>
              <Switch
                id='manifest-protection'
                checked={managedProtection}
                disabled={create.isPending || disabled}
                onCheckedChange={(v) => {
                  setManagedProtection(v)
                  setReview(false)
                }}
              />
            </div>
          </div>
          {review && (
            <div className='space-y-2 rounded-lg border bg-muted/20 p-4 text-sm'>
              <h5 className='font-semibold'>Review App permissions</h5>
              <p>
                Read repository code, workflow results and organization
                membership. Publish checks and advisory PR reviews.
              </p>
              {setupPullRequests && (
                <p>
                  Also write repository contents and workflow files for setup
                  PRs.
                </p>
              )}
              {managedProtection && (
                <p>
                  Also administer repository and organization rulesets. Merge
                  protection remains off until explicitly activated.
                </p>
              )}
              <p className='text-muted-foreground'>
                After GitHub confirmation, install the App and select
                repositories. Selecting repositories inspects files only; it
                does not execute code or replace policies.
              </p>
            </div>
          )}
          {disabled && (
            <p className='text-sm text-muted-foreground'>
              Save or discard your configuration changes before creating the
              App.
            </p>
          )}
          {create.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {create.error.message}
            </p>
          )}
          <div className='flex justify-end'>
            <Button
              type='button'
              size='sm'
              disabled={
                disabled ||
                create.isPending ||
                !organization ||
                !name ||
                !apiUrl
              }
              onClick={() => (review ? create.mutate() : setReview(true))}
            >
              {create.isPending
                ? 'Preparing…'
                : review
                  ? 'Confirm in GitHub'
                  : 'Review App setup'}
              <ExternalLink className='size-4' />
            </Button>
          </div>
        </>
      )}
      {status.data?.status === 'PENDING' && (
        <p role='status' className='text-sm text-muted-foreground'>
          App registration has not completed. Finish confirmation in GitHub or
          start again.
        </p>
      )}
      {status.isError && (
        <p role='alert' className='text-sm text-destructive'>
          Could not check App registration status.{' '}
          <button
            type='button'
            className='underline'
            onClick={() => void status.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {status.data?.status === 'FAILED' && (
        <p role='alert' className='text-sm text-destructive'>
          GitHub App confirmation could not be saved. Check GitHub for the
          registered App before retrying. Existing settings were preserved.
        </p>
      )}
      {status.data?.status === 'CONNECTED' && status.data.installationUrl && (
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
          <p className='text-sm'>
            App saved. Install it in your organization, then open Integrations
            to connect and select repositories.
          </p>
          <Button type='button' size='sm' variant='outline' asChild>
            <a href={status.data.installationUrl}>
              Install App
              <ExternalLink className='size-4' />
            </a>
          </Button>
        </div>
      )}
    </section>
  )
}
