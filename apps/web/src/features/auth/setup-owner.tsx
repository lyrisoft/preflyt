import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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

export function SetupOwner() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(API_BASE_URL + '/auth/bootstrap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!response.ok)
        throw new Error(
          'The bootstrap token is invalid, expired, or already used.'
        )
      await navigate({ to: '/', replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Owner setup failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Card className='w-full max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Set up the first Owner
          </CardTitle>
          <CardDescription>
            Enter the one-time bootstrap token provided by your installation
            operator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='bootstrap-token'>Bootstrap token</Label>
              <Input
                id='bootstrap-token'
                name='token'
                type='password'
                autoComplete='off'
                minLength={32}
                maxLength={512}
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <Button className='w-full' type='submit' disabled={submitting}>
              {submitting ? 'Setting up…' : 'Create Owner account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
