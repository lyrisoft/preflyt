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
import { AuthLayout } from './auth-layout'

export function SuperAdminLogin() {
  const { redirect } = useSearch({ from: '/(auth)/super-admin/login' })
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState<boolean | null>(null)
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
        if (active) setEnabled(false)
      })
    return () => {
      active = false
    }
  }, [])

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

      const destination = new URL(redirect || '/', window.location.origin)
      const nextPath =
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : '/'
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
    <AuthLayout
      footer={
        <p className='max-w-sm text-center text-xs leading-relaxed text-muted-foreground'>
          Use this deployment-configured account only for emergency Preflyt
          administration.
        </p>
      }
    >
      <Card className='w-full gap-6 border-white/10 bg-card/90 py-7 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-sm'>
        <CardHeader className='gap-2 px-7'>
          <CardTitle className='flex items-center gap-2 text-xl tracking-tight'>
            <KeyRound aria-hidden='true' className='size-5 text-sky-300' />
            Super Admin sign-in
          </CardTitle>
          <CardDescription className='text-sm leading-relaxed'>
            Local break-glass access is separate from organization SSO.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-7'>
          {enabled === null ? (
            <div className='flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground'>
              <LoaderCircle
                aria-hidden='true'
                className='size-4 animate-spin'
              />
              Checking local access…
            </div>
          ) : !enabled ? (
            <p role='status' className='text-sm text-muted-foreground'>
              Super Admin access is not configured for this Preflyt deployment.
            </p>
          ) : (
            <form onSubmit={submit} className='space-y-4'>
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
                  className='h-10 border-white/10 bg-black/20'
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
                  className='h-10 border-white/10 bg-black/20'
                />
              </div>
              {error && (
                <p
                  role='alert'
                  className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive'
                >
                  {error}
                </p>
              )}
              <Button
                type='submit'
                disabled={submitting}
                className='h-11 w-full bg-slate-100 text-slate-950 hover:bg-white dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
              >
                <KeyRound aria-hidden='true' className='size-4' />
                {submitting ? 'Signing in…' : 'Sign in as Super Admin'}
              </Button>
            </form>
          )}
          <div className='mt-5 border-t border-white/10 pt-4 text-center'>
            <a
              href='/sign-in'
              className='text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
            >
              Back to organization sign-in
            </a>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
