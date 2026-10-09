import { useEffect, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { siGithub } from 'simple-icons'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'

export function SignIn() {
  const { error } = useSearch({ from: '/(auth)/sign-in' })
  const [githubEnabled, setGitHubEnabled] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [methodsError, setMethodsError] = useState('')
  const [superAdminEnabled, setSuperAdminEnabled] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE_URL}/auth/methods`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load sign-in methods')
        return (await response.json()) as {
          superAdmin?: boolean
          github?: boolean
          oidc?: boolean
        }
      })
      .then((methods) => {
        if (active) {
          setSuperAdminEnabled(methods.superAdmin === true)
          setGitHubEnabled(methods.github === true)
          setOidcEnabled(methods.oidc === true)
        }
      })
      .catch(() => {
        if (active)
          setMethodsError(
            'Sign-in options could not be loaded. Refresh the page to try again.'
          )
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <AuthLayout>
      <Card className='w-full gap-6 border-white/10 bg-card/90 py-7 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-sm'>
        <CardHeader className='gap-2 px-7'>
          <CardTitle className='text-xl tracking-tight'>Sign in</CardTitle>
          <CardDescription className='text-sm leading-relaxed'>
            Continue securely with the identity provider configured by your
            organization.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5 px-7'>
          {(error === 'oidc' || error === 'github' || methodsError) && (
            <p
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive'
            >
              {methodsError ||
                'Sign-in could not be completed. Try again, or contact your Preflyt administrator. For GitHub SAML organizations, start your organization SSO session first.'}
            </p>
          )}
          {githubEnabled && (
            <Button asChild className='h-11 w-full'>
              <a href={API_BASE_URL + '/auth/github/login'}>
                <svg
                  aria-hidden='true'
                  className='size-4 fill-current'
                  viewBox='0 0 24 24'
                >
                  <path d={siGithub.path} />
                </svg>
                Continue with GitHub
                <ArrowRight aria-hidden='true' className='ms-auto size-4' />
              </a>
            </Button>
          )}
          {oidcEnabled && (
            <Button
              asChild
              className='h-11 w-full bg-slate-100 text-slate-950 shadow-sm transition-colors hover:bg-white focus-visible:ring-sky-400 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
            >
              <a href={API_BASE_URL + '/auth/login'}>
                <LockKeyhole aria-hidden='true' className='size-4' />
                Continue with organization SSO
                <ArrowRight aria-hidden='true' className='ms-auto size-4' />
              </a>
            </Button>
          )}
          <p className='text-center text-xs leading-relaxed text-muted-foreground'>
            Your Preflyt account and access are provisioned by your
            organization.
          </p>
          {superAdminEnabled && (
            <div className='border-t border-white/10 pt-4 text-center'>
              <Link
                to='/super-admin/login'
                className='text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
              >
                Super Admin access
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
