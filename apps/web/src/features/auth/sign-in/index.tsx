import { useEffect, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react'
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
import { SignInLayout } from '../sign-in-layout'

export function SignIn() {
  const { error } = useSearch({ from: '/(auth)/sign-in' })
  const [githubEnabled, setGitHubEnabled] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [methodsError, setMethodsError] = useState('')
  const [superAdminEnabled, setSuperAdminEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkAttempt, setCheckAttempt] = useState(0)

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
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setMethodsError(
            'Sign-in options could not be loaded. Check that Preflyt is reachable, then try again.'
          )
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [checkAttempt])

  return (
    <SignInLayout>
      <Card className='sign-in-card w-full'>
        <CardHeader className='gap-3 px-6 sm:px-8'>
          <p className='text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
            Organization access
          </p>
          <CardTitle asChild className='text-2xl tracking-tight'>
            <h1>Sign in to Preflyt</h1>
          </CardTitle>
          <CardDescription className='text-sm leading-relaxed'>
            Continue with your organization’s sign-in provider.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6 px-6 sm:px-8'>
          {(error === 'oidc' || error === 'github' || methodsError) && (
            <div className='space-y-3'>
              <p
                role='alert'
                className='rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm leading-relaxed text-destructive'
              >
                {methodsError ||
                  'Sign-in could not be completed. Try again, or contact your Preflyt administrator. For GitHub SAML organizations, start your organization SSO session first.'}
              </p>
              {!!methodsError && (
                <Button
                  variant='outline'
                  onClick={() => {
                    setMethodsError('')
                    setLoading(true)
                    setCheckAttempt((attempt) => attempt + 1)
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          <div className='space-y-3'>
            {loading ? (
              <p
                role='status'
                className='flex items-center gap-2 py-3 text-sm text-muted-foreground'
              >
                <LoaderCircle
                  aria-hidden='true'
                  className='size-4 animate-spin motion-reduce:animate-none'
                />
                Loading sign-in options…
              </p>
            ) : (
              <>
                {githubEnabled && (
                  <Button asChild className='h-11 w-full justify-start px-4'>
                    <a href={API_BASE_URL + '/auth/github/login'}>
                      <svg
                        aria-hidden='true'
                        className='size-4 fill-current'
                        viewBox='0 0 24 24'
                      >
                        <path d={siGithub.path} />
                      </svg>
                      Continue with GitHub
                      <ArrowRight
                        aria-hidden='true'
                        className='ms-auto size-4'
                      />
                    </a>
                  </Button>
                )}
                {oidcEnabled && (
                  <Button
                    asChild
                    variant={githubEnabled ? 'outline' : 'default'}
                    className='h-11 w-full justify-start px-4'
                  >
                    <a href={API_BASE_URL + '/auth/login'}>
                      <LockKeyhole aria-hidden='true' className='size-4' />
                      Continue with SSO
                      <ArrowRight
                        aria-hidden='true'
                        className='ms-auto size-4'
                      />
                    </a>
                  </Button>
                )}
                {!githubEnabled && !oidcEnabled && !methodsError && (
                  <p
                    role='status'
                    className='text-sm leading-relaxed text-muted-foreground'
                  >
                    Organization sign-in is not configured. Contact your Preflyt
                    administrator.
                  </p>
                )}
              </>
            )}
          </div>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            Your organization manages your account and repository access.
          </p>
          {(superAdminEnabled || !!methodsError) && (
            <div className='border-t pt-5'>
              <Link
                to='/super-admin/login'
                className='inline-flex min-h-8 items-center gap-2 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
              >
                <LockKeyhole aria-hidden='true' className='size-3.5' />
                Super Admin access
                <ArrowRight aria-hidden='true' className='size-3.5' />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </SignInLayout>
  )
}
