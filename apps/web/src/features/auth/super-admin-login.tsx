import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignInLayout } from './sign-in-layout'

export function SuperAdminLogin() {
  const { redirect } = useSearch({ from: '/(auth)/super-admin/login' })
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [methodsError, setMethodsError] = useState(false)
  const [checkAttempt, setCheckAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetch(`${API_BASE_URL}/auth/methods`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to check local access')
        return (await response.json()) as { superAdmin?: boolean }
      })
      .then((methods) => {
        if (active) setEnabled(methods.superAdmin === true)
      })
      .catch(() => {
        if (active) setMethodsError(true)
      })
    return () => {
      active = false
    }
  }, [checkAttempt])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/auth/super-admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'Too many attempts. Wait a few minutes and try again.'
            : 'Sign-in failed. Check your username and password and try again.'
        )
      }

      const destination = new URL(
        redirect || '/overview',
        window.location.origin
      )
      const nextPath =
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : '/overview'
      await navigate({ to: nextPath, replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Super Admin sign-in could not be completed.'
      )
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SignInLayout
      footer={
        <p>
          Use this deployment-configured account only for emergency Preflyt
          administration.
        </p>
      }
    >
      <Card className='sign-in-card w-full'>
        <CardHeader className='gap-3 px-4 sm:px-8'>
          <p className='text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
            Deployment administration
          </p>
          <CardTitle asChild className='text-2xl tracking-tight'>
            <h1>Super Admin sign-in</h1>
          </CardTitle>
          <CardDescription className='text-sm leading-relaxed'>
            Use the administrator account configured for this Preflyt
            deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-4 sm:px-8'>
          {methodsError ? (
            <div className='space-y-3'>
              <p role='alert' className='text-sm text-destructive'>
                Cannot reach the Preflyt API to check administrator access.
                Check that the API is running, then try again.
              </p>
              <Button
                variant='outline'
                onClick={() => {
                  setEnabled(null)
                  setMethodsError(false)
                  setCheckAttempt((attempt) => attempt + 1)
                }}
              >
                Try again
              </Button>
            </div>
          ) : enabled === null ? (
            <div
              role='status'
              className='flex items-center gap-2 py-4 text-sm text-muted-foreground'
            >
              <LoaderCircle
                aria-hidden='true'
                className='size-4 animate-spin motion-reduce:animate-none'
              />
              Checking local access…
            </div>
          ) : !enabled ? (
            <p role='status' className='text-sm text-muted-foreground'>
              Super Admin access is not configured for this Preflyt deployment.
            </p>
          ) : (
            <form onSubmit={submit} className='space-y-5'>
              <div className='space-y-2'>
                <Label htmlFor='super-admin-username'>Username</Label>
                <Input
                  id='super-admin-username'
                  name='username'
                  type='text'
                  autoComplete='username'
                  required
                  minLength={1}
                  maxLength={320}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className='h-11 bg-background'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='super-admin-password'>Password</Label>
                <Input
                  id='super-admin-password'
                  name='password'
                  type='password'
                  autoComplete='current-password'
                  minLength={24}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className='h-11 bg-background'
                />
              </div>
              {error && (
                <p
                  role='alert'
                  className='rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm leading-relaxed text-destructive'
                >
                  {error}
                </p>
              )}
              <Button
                type='submit'
                disabled={submitting}
                className='h-11 w-full'
              >
                {submitting ? (
                  <LoaderCircle
                    aria-hidden='true'
                    className='size-4 animate-spin motion-reduce:animate-none'
                  />
                ) : (
                  <KeyRound aria-hidden='true' className='size-4' />
                )}
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
          <div className='mt-6 border-t pt-5'>
            <a
              href='/sign-in'
              className='inline-flex min-h-8 items-center rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
            >
              Back to organization sign-in
            </a>
          </div>
        </CardContent>
      </Card>
    </SignInLayout>
  )
}
