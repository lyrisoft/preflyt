import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  gettingStarted: [
    'getting-started/index',
    'getting-started/quick-start',
    'getting-started/connect-github',
    'getting-started/select-repositories',
    'getting-started/first-assessment',
  ],
  userGuide: [
    'user-guide/index',
    'user-guide/repository-health',
    'user-guide/standards',
    'user-guide/policies',
    'user-guide/pull-request-checks',
    'user-guide/merge-protection',
    'user-guide/findings',
    'user-guide/teams',
    'user-guide/access-control',
    'user-guide/ai-reviews',
    'user-guide/native-execution',
    'user-guide/audit-log',
    'user-guide/notifications',
    'user-guide/contributors',
  ],
  selfHosting: [
    'self-hosting/index',
    'self-hosting/docker-compose',
    'self-hosting/compose-file',
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
