import { createFileRoute } from '@tanstack/react-router'
import { FindingRoutePage } from '@/features/findings/finding-details-page'
import { findingDetailSearch } from '@/features/findings/finding-search'

export const Route = createFileRoute('/_authenticated/findings/$findingId')({
  validateSearch: findingDetailSearch,
  component: FindingRoutePage,
})
