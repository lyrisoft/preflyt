import { z } from 'zod'

export const auditSearchSchema = z.object({
  page: z.coerce.number().int().min(1).max(999999).catch(1),
  repository: z
    .union([
      z.string(),
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    ])
    .transform(String)
    .pipe(z.string().regex(/^(all|[1-9]\d{0,15})$/))
    .catch('all'),
  action: z
    .string()
    .max(160)
    .regex(/^[A-Za-z0-9._-]+$/)
    .catch('all'),
  from: z
    .string()
    .regex(/^(|\d{4}-\d{2}-\d{2})$/)
    .catch(''),
  to: z
    .string()
    .regex(/^(|\d{4}-\d{2}-\d{2})$/)
    .catch(''),
})
export type AuditSearch = z.infer<typeof auditSearchSchema>
