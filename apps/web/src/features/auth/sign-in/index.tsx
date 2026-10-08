import { useSearch } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole } from 'lucide-react'
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
          {error === 'oidc' && (
            <p
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive'
            >
              Sign-in could not be completed. Check your account or contact your
              Preflyt administrator.
            </p>
          )}
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
          <div className='flex items-center gap-3 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase'>
            <span className='h-px flex-1 bg-border' />
            Secure sign-in
            <span className='h-px flex-1 bg-border' />
          </div>
          <p className='text-center text-xs leading-relaxed text-muted-foreground'>
            Your Preflyt account and access are provisioned by your
            organization.
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
