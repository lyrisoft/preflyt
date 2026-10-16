/** Build allowlist and browser metadata for public pages only. */
export const publicPages = [
  {
    path: '/',
    title: 'Preflyt | Engineering assurance for GitHub',
    description:
      'Know what passed and what needs attention. Bring repository health, engineering standards and verified CI results into one self-hosted workspace.',
    manifest: 'src/routes/index.tsx?tsr-split=component',
  },
  {
    path: '/product',
    title: 'Product | Preflyt',
    description:
      'Connect repository health, approved engineering standards, verified CI evidence and advisory AI in one engineering assurance platform.',
    manifest: 'src/routes/product.index.tsx?tsr-split=component',
  },
  {
    path: '/product/repository-health',
    title: 'Repository health | Preflyt',
    description:
      'Identify supported security and quality risks early, investigate findings and compare repository health evidence at the assessed commit.',
    manifest: 'src/routes/product.repository-health.tsx?tsr-split=component',
  },
  {
    path: '/product/standards-and-evidence',
    title: 'Standards and evidence | Preflyt',
    description:
      'Verify code changes against approved engineering standards with versioned branch policies, current CI evidence and traceable readiness results.',
    manifest:
      'src/routes/product.standards-and-evidence.tsx?tsr-split=component',
  },
  {
    path: '/product/merge-protection',
    title: 'Merge Protection | Preflyt',
    description:
      'Connect evidence-backed readiness results to GitHub merge protection through an explicit, reviewed activation.',
    manifest: 'src/routes/product.merge-protection.tsx?tsr-split=component',
  },
  {
    path: '/pricing',
    title: 'Pricing | Preflyt Community and Cloud',
    description:
      'Self-host Preflyt Community Edition for free under Apache-2.0. Explore what is included and the planned managed Cloud service, coming soon.',
    manifest: 'src/routes/pricing.tsx?tsr-split=component',
  },
  {
    path: '/self-hosting',
    title: 'Self-hosting | Preflyt',
    description:
      'Explore Preflyt Community Edition: Apache-2.0, no repository cap and optional AI. Start with Docker Compose; public release preparation is in progress.',
    manifest: 'src/routes/self-hosting.tsx?tsr-split=component',
  },
] as const
