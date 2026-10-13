import { createFileRoute } from '@tanstack/react-router'
import { ProductPage } from '@/features/marketing/capability-pages'

export const Route = createFileRoute('/product/')({ component: ProductPage })
