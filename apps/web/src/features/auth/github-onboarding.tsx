import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, ArrowRight, LoaderCircle } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from './auth-layout'

type Organization = {
  installationId: string
  login: string
  state:
    | 'new'
    | 'existing'
    | 'no_access'
    | 'migration_required'
    | 'link_existing'
    | 'unavailable'
}
export function GitHubOnboarding() {
  const [data, setData] = useState<{
    login: string
    linkingWorkspace: boolean
    organizations: Organization[]
  }>()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(API_BASE_URL + '/auth/github/organizations', {
      credentials: 'include',
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401
              ? 'Sign-in expired. Start again.'
              : 'Could not load your GitHub organizations. Try again.'
          )
        return r.json()
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [])
  async function enter(org: Organization) {
    setBusy(org.installationId)
    setError('')
    try {
      const r = await fetch(API_BASE_URL + '/auth/github/organizations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: org.installationId }),
      })
      const result = await r.json()
      if (!r.ok)
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : 'Could not enter this organization. Try again.'
        )
      window.location.assign(result.returnPath)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not enter this organization.'
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <AuthLayout>
      <Card className='w-full'>
        <CardHeader>
          <CardTitle>
            {data?.linkingWorkspace
              ? 'Link your GitHub organization'
              : 'Choose your organization'}
          </CardTitle>
          <CardDescription>
            {data
              ? `Signed in to GitHub as ${data.login}.`
              : 'Checking your GitHub account…'}{' '}
            {data?.linkingWorkspace
              ? 'Confirm the organization below to link it to your existing Preflyt workspace.'
              : 'GitHub organization owners can connect a new workspace. Existing workspaces require a Preflyt access grant.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {error && (
            <p
              role='alert'
              className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
            >
              {error}
            </p>
          )}
          {!data && !error && (
            <p
              role='status'
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <LoaderCircle className='size-4 animate-spin' />
              Loading organizations…
            </p>
          )}
          {data?.organizations.map((org) => (
            <div key={org.installationId} className='rounded-lg border p-4'>
              <p className='flex items-center gap-2 font-medium'>
                <Building2 className='size-4 text-primary' />
                {org.login}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {org.state === 'link_existing'
                  ? 'Link this installed GitHub organization to your current workspace. Your connected repositories and existing access records will be preserved. Both workspace and GitHub organization ownership will be verified.'
                  : org.state === 'unavailable'
                    ? 'This installation does not belong to the workspace you are linking.'
                    : org.state === 'migration_required'
                      ? 'This workspace already has connected repositories. A workspace administrator must link it to this GitHub organization before GitHub sign-in can be used. Sign in with your existing administrator account, then open Access Control → GitHub members → Link GitHub organization.'
                      : org.state === 'no_access'
                        ? 'Ask your Preflyt administrator to grant you access.'
                        : org.state === 'new'
                          ? 'An organization owner can connect this workspace. Your ownership will be verified.'
                          : 'Continue with your existing Preflyt role.'}
              </p>
              {org.state === 'migration_required' && (
                <div className='mt-3 flex flex-col gap-2'>
                  <Button asChild>
                    <Link
                      to='/super-admin/login'
                      search={{ redirect: '/access-control' }}
                    >
                      Sign in as workspace administrator
                      <ArrowRight className='size-4' />
                    </Link>
                  </Button>
                  <Link
                    to='/sign-in'
                    search={{ redirect: '/access-control' }}
                    className='text-center text-xs text-muted-foreground underline underline-offset-4'
                  >
                    Use organization sign-in instead
                  </Link>
                </div>
              )}
              {['new', 'existing', 'link_existing'].includes(org.state) && (
                <Button
                  onClick={() => void enter(org)}
                  disabled={busy !== null}
                  className='mt-3 w-full'
                >
                  {busy === org.installationId
                    ? 'Verifying access…'
                    : org.state === 'link_existing'
                      ? 'Link organization and continue'
                      : org.state === 'new'
                        ? 'Connect organization'
                        : 'Continue'}
                  <ArrowRight className='size-4' />
                </Button>
              )}
            </div>
          ))}
          {data && !data.organizations.length && (
            <p className='text-sm text-muted-foreground'>
              No supported organization installations were found. Ask a GitHub
              organization owner to install the Preflyt App, then sign in again.
              If your organization uses GitHub SAML SSO, start its SSO session
              before retrying.
            </p>
          )}
          <Link
            to='/sign-in'
            className='block text-center text-sm text-muted-foreground underline underline-offset-4'
          >
            Back to sign-in
          </Link>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
