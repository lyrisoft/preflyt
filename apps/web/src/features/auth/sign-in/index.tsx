import { useSearch } from '@tanstack/react-router'
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
      <Card className='w-full max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Sign in to Preflyt
          </CardTitle>
          <CardDescription>
            Continue with your organization’s identity provider.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {error === 'oidc' && (
            <p role='alert' className='text-sm text-destructive'>
              Sign in failed. Check your account or contact your Preflyt
              administrator.
            </p>
          )}
          <Button asChild className='w-full'>
            <a href={API_BASE_URL + '/auth/login'}>
              Continue with organization sign-in
            </a>
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
