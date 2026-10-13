import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Building2, LoaderCircle, RefreshCw } from 'lucide-react'
import { siGithub } from 'simple-icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  beginOrganizationLink,
  githubLinkRequest as request,
} from './github-link-request'

type Organization = { installationId: string; login: string; state: string }
type LinkDetails = {
  login: string
  linkingWorkspace: boolean
  organizations: Organization[]
}
export function GitHubOrganizationLink({
  status,
}: {
  status: 'confirm' | 'failed' | undefined
}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('')
  const details = useQuery({
    queryKey: ['github-organization-link', status],
    queryFn: ({ signal }) => request<LinkDetails>('organizations', { signal }),
    enabled: status === 'confirm',
    retry: false,
    gcTime: 0,
  })
  const link = useMutation({
    mutationFn: (installationId: string) =>
      request<{ returnPath: string }>('organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId }),
      }),
    onSuccess: (result) => window.location.assign(result.returnPath),
  })
  const organizations = details.data?.linkingWorkspace
    ? details.data.organizations.filter((org) => org.state === 'link_existing')
    : []
  const chosen =
    organizations.find((org) => org.installationId === selected) ??
    (organizations.length === 1 ? organizations[0] : undefined)
  const error =
    status === 'failed'
      ? 'GitHub authorization was cancelled or could not be completed. Your administrator session is still active. Try linking again.'
      : (link.error?.message ?? details.error?.message)
  function close() {
    // Cancel only the pending link proof. The administrator session cookie is untouched.
    void request('link/cancel', { method: 'POST' }).catch(() => undefined)
    void navigate({
      to: '/access-control',
      search: { tab: 'github' },
      replace: true,
    })
  }
  return (
    <Sheet
      open={!!status}
      onOpenChange={(open) => {
        if (!open && !link.isPending) close()
      }}
    >
      <SheetContent
        className='flex flex-col sm:max-w-lg'
        onEscapeKeyDown={(event) => {
          if (link.isPending) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (link.isPending) event.preventDefault()
        }}
      >
        <SheetHeader className='border-b pb-5'>
          <span className='flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary'>
            <svg
              viewBox='0 0 24 24'
              aria-hidden='true'
              className='size-5 fill-current'
            >
              <path d={siGithub.path} />
            </svg>
          </span>
          <SheetTitle>Link GitHub organization</SheetTitle>
          <SheetDescription>
            Connect your existing workspace to GitHub so you can sync members
            and assign roles.
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-5 overflow-y-auto px-4 py-5'>
          {error && (
            <div
              role='alert'
              className='rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm leading-relaxed text-destructive'
            >
              {error}
            </div>
          )}
          {details.isFetching && (
            <p
              role='status'
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <LoaderCircle className='size-4 animate-spin' />
              Checking GitHub organizations…
            </p>
          )}
          {details.data &&
            !details.isFetching &&
            !details.data.linkingWorkspace && (
              <p role='alert' className='text-sm text-destructive'>
                This authorization was started for sign-in. Start linking again
                from Access Control.
              </p>
            )}
          {details.data?.linkingWorkspace && (
            <>
              <div className='rounded-xl bg-muted/40 px-4 py-3'>
                <p className='text-xs text-muted-foreground'>
                  Authorized GitHub account
                </p>
                <p className='mt-1 text-sm font-medium'>
                  @{details.data.login}
                </p>
              </div>
              <div className='space-y-2'>
                <p className='text-xs font-medium text-muted-foreground'>
                  Organization
                </p>
                {organizations.map((org) => (
                  <button
                    key={org.installationId}
                    type='button'
                    disabled={link.isPending}
                    onClick={() => setSelected(org.installationId)}
                    aria-pressed={chosen?.installationId === org.installationId}
                    className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors ${chosen?.installationId === org.installationId ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40'}`}
                  >
                    <Building2 className='size-5 text-primary' />
                    <span className='text-sm font-semibold'>{org.login}</span>
                  </button>
                ))}
                {!organizations.length && (
                  <p className='text-sm text-muted-foreground'>
                    No GitHub organization matches this workspace’s connected
                    installation. Try again with a GitHub owner of that
                    organization.
                  </p>
                )}
              </div>
              <p className='text-xs leading-relaxed text-muted-foreground'>
                Your repositories, policies and history stay in this workspace.
                GitHub organization ownership is checked before linking.
              </p>
            </>
          )}
        </div>
        <SheetFooter className='flex-row justify-end gap-2 border-t'>
          <Button variant='outline' disabled={link.isPending} onClick={close}>
            Cancel
          </Button>
          {error || !chosen ? (
            <Button
              onClick={beginOrganizationLink}
              disabled={details.isFetching || link.isPending}
            >
              <RefreshCw className='size-4' />
              Start again
            </Button>
          ) : (
            <Button
              disabled={link.isPending}
              onClick={() => link.mutate(chosen.installationId)}
            >
              {link.isPending ? (
                <LoaderCircle className='size-4 animate-spin' />
              ) : (
                <ArrowRight className='size-4' />
              )}
              {link.isPending ? 'Linking…' : 'Link organization'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
