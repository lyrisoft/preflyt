import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { MarketingHomepage } from './features/marketing'
import {
  ProductPage,
  CapabilityPage,
  SelfHostingPage,
} from './features/marketing/capability-pages'
import { PublicNotFound } from './features/marketing/not-found'
import { PricingPage } from './features/marketing/pricing-page'

// Public components only: no application routes, session providers or API client.
export function createAppRouter() {
  const root = createRootRoute({
    component: Outlet,
    notFoundComponent: PublicNotFound,
  })
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/',
      component: MarketingHomepage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/product',
      component: ProductPage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/self-hosting',
      component: SelfHostingPage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/pricing',
      component: PricingPage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/product/repository-health',
      component: () => <CapabilityPage capability='repository-health' />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/product/standards-and-evidence',
      component: () => <CapabilityPage capability='standards-and-evidence' />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/product/merge-protection',
      component: () => <CapabilityPage capability='merge-protection' />,
    }),
  ]
  return createRouter({
    routeTree: root.addChildren(routes),
    defaultPreload: 'intent',
  })
}
