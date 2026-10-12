/** Build allowlist and browser metadata for public pages only. */
export const publicPages = [
  {
    path: '/',
    title: 'Preflyt | Engineering confidence before production',
    description:
      'Understand repository health, investigate findings and review changes against your engineering standards.',
    manifest: 'src/routes/index.tsx?tsr-split=component',
  },
  {
    path: '/product',
    title: 'Product | Preflyt',
    description:
      'Explore repository health, versioned standards and evidence-backed merge reviews in Preflyt.',
    manifest: 'src/routes/product.index.tsx?tsr-split=component',
  },
  {
    path: '/product/repository-health',
    title: 'Repository health | Preflyt',
    description:
      'Investigate supported findings, compare compatible reports and follow source evidence at the assessed commit.',
    manifest: 'src/routes/product.repository-health.tsx?tsr-split=component',
  },
  {
    path: '/product/standards-and-evidence',
    title: 'Standards and evidence | Preflyt',
    description:
      'Connect versioned engineering standards, branch policies and verified CI reports to a traceable result.',
    manifest:
      'src/routes/product.standards-and-evidence.tsx?tsr-split=component',
  },
  {
    path: '/product/merge-protection',
    title: 'Merge Protection | Preflyt',
    description:
      'Review current pull request evidence and explicitly configure GitHub to require the Preflyt check.',
    manifest: 'src/routes/product.merge-protection.tsx?tsr-split=component',
  },
  {
    path: '/self-hosting',
    title: 'Self-hosting | Preflyt',
    description:
      'Deploy Preflyt in your infrastructure with Docker Compose or the Kubernetes application bundle.',
    manifest: 'src/routes/self-hosting.tsx?tsr-split=component',
  },
] as const
