import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { SuperAdminLogin } from '@/features/auth/super-admin-login'

export const Route = createFileRoute('/(auth)/super-admin/login')({
  component: SuperAdminLogin,
  validateSearch: z.object({ redirect: z.string().optional() }),
})
