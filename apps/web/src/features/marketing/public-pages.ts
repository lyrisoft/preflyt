/** Build allowlist and browser metadata for public pages only. */
export const publicPages = [
  {
    path: '/',
    title: 'Preflyt | Engineering confidence before production',
    description:
      'Self-hosted engineering assurance: assess repository health, verify CI evidence against approved standards and review traceable readiness results.',
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
    path: '/self-hosting',
    title: 'Self-hosting | Preflyt',
    description:
      'Self-host your engineering assurance platform with Docker Compose or the Kubernetes application bundle and control repository access and AI connections.',
    manifest: 'src/routes/self-hosting.tsx?tsr-split=component',
  },
] as const
