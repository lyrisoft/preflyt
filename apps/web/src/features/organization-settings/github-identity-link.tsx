import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { SurfaceIcon } from '@/components/surface-icon'
import { githubLinkRequest as request } from '@/features/access-control/github-link-request'
import { useNavigationSession } from '@/features/workspace/navigation-session'

type Preview = {
  login: string
  previousAccessCount: number
  retainedAccessCount: number
  previewHash: string
}
export function GitHubIdentityLink() {
  const session = useNavigationSession()
  const search = useSearch({ strict: false }) as { identityLink?: string }
  const confirming = search.identityLink === 'confirm'
  const status = useQuery({
    queryKey: ['github-identity-link-status', session.data?.identityId],
    queryFn: ({ signal }) =>
      request<{ linked: boolean; canLink: boolean }>('identity/status', {
        signal,
      }),
    enabled: !session.data?.platformAdmin,
    retry: false,
    meta: { silent: true },
  })
  const preview = useQuery({
    queryKey: ['github-identity-link-preview', session.data?.identityId],
    queryFn: ({ signal }) => request<Preview>('identity/preview', { signal }),
    enabled: confirming,
    retry: false,
    gcTime: 0,
    meta: { silent: true },
  })
  const link = useMutation({
    mutationFn: (previewHash: string) =>
      request('identity/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewHash }),
      }),
    meta: { successMessage: 'GitHub account linked' },
    onSuccess: () => window.location.assign('/organization-settings'),
  })
  const cancel = useMutation({
    mutationFn: () => request('identity/cancel', { method: 'POST' }),
    onSuccess: () => window.location.assign('/organization-settings'),
  })
  if (
    session.data?.platformAdmin ||
    (!confirming &&
      search.identityLink !== 'failed' &&
      !status.data?.canLink &&
      !status.data?.linked)
  )
    return null
  return (
    <Card>
      <CardHeader className='flex flex-row items-start gap-3'>
        <SurfaceIcon icon={Link2} tone='blue' />
        <div className='space-y-1'>
          <CardTitle>GitHub sign-in</CardTitle>
          <CardDescription>
            Use GitHub to sign in to your existing Preflyt account.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {search.identityLink === 'failed' && (
          <p role='alert' className='text-sm text-destructive'>
            GitHub sign-in could not be verified. Sign in again with your
            organization account, then restart linking.
          </p>
        )}
        {confirming ? (
          <>
            {preview.isPending && (
              <p role='status' className='text-sm text-muted-foreground'>
                Verifying your accounts…
              </p>
            )}
            {preview.isError && (
              <p role='alert' className='text-sm text-destructive'>
                {preview.error.message}
              </p>
            )}
            {preview.data && (
              <div className='space-y-2 text-sm'>
                <p>
                  Link GitHub account <strong>{preview.data.login}</strong>?
                </p>
                <p className='text-muted-foreground'>
                  Your current account’s workspace roles and repository
                  permissions stay in place. Separate grants on the GitHub-only
                  account ({preview.data.previousAccessCount}) will be disabled;
                  permissions are not combined. Existing assessment and approval
                  history is preserved.
                </p>
              </div>
            )}
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending || link.isPending}
              >
                Cancel
              </Button>
              <Button
                size='sm'
                onClick={() =>
                  preview.data && link.mutate(preview.data.previewHash)
                }
                disabled={!preview.data || link.isPending || cancel.isPending}
              >
                Link account
              </Button>
            </div>
          </>
        ) : status.data?.linked ? (
          <p className='text-sm text-muted-foreground'>
            GitHub is connected to your sign-in account.
          </p>
        ) : (
          <>
            <p className='text-sm text-muted-foreground'>
              Sign in again with your organization account before linking. Both
              sign-ins must be verified within five minutes. Matching names or
              email addresses never links accounts.
            </p>
            <div className='flex justify-end'>
              <Button
                size='sm'
                onClick={() =>
                  window.location.assign(
                    API_BASE_URL +
                      '/auth/github/login?link=identity&redirect=%2Forganization-settings'
                  )
                }
              >
                <Link2 className='size-4' />
                Link GitHub account
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
