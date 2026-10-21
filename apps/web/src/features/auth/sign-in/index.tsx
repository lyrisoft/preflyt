import { useEffect, useRef, useState } from 'react'
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
import { signInProviderHref, signInReturnPath } from '../return-path'
import { SignInLayout } from '../sign-in-layout'

export function SignIn() {
  const { error, redirect } = useSearch({ from: '/(auth)/sign-in' })
  const returnSearch = redirect
    ? { redirect: signInReturnPath(redirect) }
    : undefined
  const [githubEnabled, setGitHubEnabled] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [methodsError, setMethodsError] = useState('')
  const [superAdminEnabled, setSuperAdminEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkAttempt, setCheckAttempt] = useState(0)
  const [startingGitHub, setStartingGitHub] = useState(false)
  const githubSubmission = useRef(false)

  useEffect(() => {
    // Browsers can restore the disabled control from the back-forward cache.
    const restoreSignIn = () => {
      githubSubmission.current = false
      setStartingGitHub(false)
    }
    window.addEventListener('pageshow', restoreSignIn)
    return () => window.removeEventListener('pageshow', restoreSignIn)
  }, [])

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

  const needsSetup =
    !loading &&
    !methodsError &&
    superAdminEnabled &&
    !githubEnabled &&
    !oidcEnabled

  return (
    <SignInLayout>
      <Card className='sign-in-card w-full'>
        <CardHeader className='gap-3 px-4 sm:px-8'>
          <p className='text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase'>
            {needsSetup ? 'Get started' : 'Organization access'}
          </p>
          <CardTitle asChild className='text-2xl tracking-tight'>
            <h1>{needsSetup ? 'Set up Preflyt' : 'Sign in to Preflyt'}</h1>
          </CardTitle>
          <CardDescription className='text-sm leading-relaxed'>
            {needsSetup
              ? 'Connect GitHub and turn your repository checks into clear, actionable reviews.'
              : 'Continue with your organization’s sign-in provider.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6 px-4 sm:px-8'>
          {(error === 'oidc' || error === 'github' || methodsError) && (
            <div className='space-y-3'>
              <p
                role='alert'
                className='rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm leading-relaxed text-destructive'
              >
                {methodsError ||
                  (error === 'github'
                    ? 'Sign-in could not be completed. Try again, or contact your Preflyt administrator. For GitHub SAML organizations, start your organization SSO session first.'
                    : 'Sign-in could not be completed. Try again, or contact your Preflyt administrator.')}
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
                  <form
                    aria-label='GitHub sign-in'
                    action={`${API_BASE_URL}/auth/github/login`}
                    method='get'
                    onSubmit={(event) => {
                      if (githubSubmission.current) {
                        event.preventDefault()
                        return
                      }
                      githubSubmission.current = true
                      setStartingGitHub(true)
                    }}
                  >
                    {redirect && (
                      <input
                        type='hidden'
                        name='redirect'
                        value={signInReturnPath(redirect)}
                      />
                    )}
                    <Button
                      type='submit'
                      disabled={startingGitHub}
                      aria-busy={startingGitHub}
                      className='w-full justify-start'
                    >
                      <svg
                        aria-hidden='true'
                        className='size-4 fill-current'
                        viewBox='0 0 24 24'
                      >
                        <path d={siGithub.path} />
                      </svg>
                      {startingGitHub
                        ? 'Connecting to GitHub…'
                        : 'Continue with GitHub'}
                      {startingGitHub ? (
                        <LoaderCircle
                          aria-hidden='true'
                          className='ms-auto size-4 animate-spin motion-reduce:animate-none'
                        />
                      ) : (
                        <ArrowRight
                          aria-hidden='true'
                          className='ms-auto size-4'
                        />
                      )}
                    </Button>
                  </form>
                )}
                {oidcEnabled && (
                  <Button
                    asChild
                    variant={githubEnabled ? 'outline' : 'default'}
                    className='w-full justify-start'
                  >
                    <a
                      href={signInProviderHref(
                        API_BASE_URL,
                        '/auth/login',
                        redirect
                      )}
                    >
                      <LockKeyhole aria-hidden='true' className='size-4' />
                      Continue with SSO
                      <ArrowRight
                        aria-hidden='true'
                        className='ms-auto size-4'
                      />
                    </a>
                  </Button>
                )}
                {needsSetup && (
                  <Button asChild className='w-full justify-start'>
                    <Link to='/super-admin/login' search={returnSearch}>
                      <LockKeyhole aria-hidden='true' className='size-4' />
                      Start setup
                      <ArrowRight
                        aria-hidden='true'
                        className='ms-auto size-4'
                      />
                    </Link>
                  </Button>
                )}
                {!githubEnabled &&
                  !oidcEnabled &&
                  !methodsError &&
                  !needsSetup && (
                    <p
                      role='status'
                      className='text-sm leading-relaxed text-muted-foreground'
                    >
                      Organization sign-in is not configured. Contact your
                      Preflyt administrator.
                    </p>
                  )}
              </>
            )}
          </div>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            {needsSetup
              ? 'Sign in with the Super Admin account configured for this installation.'
              : 'Your organization manages your account and repository access.'}
          </p>
          {!needsSetup && (superAdminEnabled || !!methodsError) && (
            <div className='border-t pt-5'>
              <Link
                to='/super-admin/login'
                search={returnSearch}
                className='inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
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
