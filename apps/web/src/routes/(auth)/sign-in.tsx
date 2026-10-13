import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@/features/auth/sign-in'

export const Route = createFileRoute('/(auth)/sign-in')({
  component: SignIn,
  validateSearch: z.object({
    error: z.string().optional(),
    redirect: z.string().optional(),
  }),
})
