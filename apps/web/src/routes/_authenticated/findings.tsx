import { createFileRoute, Outlet } from '@tanstack/react-router'
import { findingsSearch } from '@/features/findings/finding-search'

export const Route = createFileRoute('/_authenticated/findings')({
  validateSearch: findingsSearch,
  component: Outlet,
})
