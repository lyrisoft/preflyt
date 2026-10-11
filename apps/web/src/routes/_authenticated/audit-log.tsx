import { createFileRoute } from '@tanstack/react-router'
import { AuditLogPage } from '@/features/audit-log/audit-log-page'
import { auditSearchSchema } from '@/features/audit-log/audit-search'

export const Route = createFileRoute('/_authenticated/audit-log')({
  validateSearch: (search) => auditSearchSchema.parse(search),
  component: AuditLogPage,
})
