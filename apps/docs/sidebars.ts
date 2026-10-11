import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  gettingStarted: [
    'getting-started/index',
    'getting-started/quick-start',
    'getting-started/connect-github',
    'getting-started/select-repositories',
    'getting-started/first-assessment',
  ],
  selfHosting: [
    'self-hosting/index',
    'self-hosting/docker-compose',
    'self-hosting/configuration',
    'self-hosting/authentication',
    'self-hosting/github-app',
    'self-hosting/reverse-proxy',
    'self-hosting/upgrades-and-backups',
    'self-hosting/observability',
    'self-hosting/kubernetes',
    'self-hosting/troubleshooting',
  ],
  concepts: [
    'concepts/how-preflyt-works',
    'concepts/evidence-and-trust',
    'concepts/status-labels',
  ],
}

export default sidebars
