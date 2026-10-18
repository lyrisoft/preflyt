import { BadRequestException } from '@nestjs/common';
import { resolveWebOrigin } from '../config/web-origin.js';
import { validateConfiguration } from './configuration-store.js';
export type ManifestOptions = { organization: string; name: string; apiUrl: string; setupPullRequests?: boolean; managedProtection: boolean };
export function githubAppManifest(options: ManifestOptions) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(options.organization) ||
      !/^[a-z\d][a-z\d ._-]{2,99}$/i.test(options.name))
    throw new BadRequestException('Enter a valid GitHub organization and an App name of 3–100 characters');
  validateConfiguration({ PREFLYT_PUBLIC_API_URL: options.apiUrl });
  const api = options.apiUrl.replace(/\/$/, '');
  const web = resolveWebOrigin();
  const setupPullRequests = options.setupPullRequests !== false;
  const permissions: Record<string, string> = {
    metadata: 'read', contents: setupPullRequests ? 'write' : 'read',
    actions: 'read', checks: 'write', pull_requests: 'write', members: 'read',
    ...(setupPullRequests ? { workflows: 'write' } : {}),
    ...(options.managedProtection ? { administration: 'write', organization_administration: 'write' } : {}),
  };
  return {
    action: `https://github.com/organizations/${options.organization}/settings/apps/new`,
    manifest: { name: options.name, url: web, public: false,
      description: 'Preflyt repository checks and advisory pull request reviews',
      hook_attributes: { url: `${api}/github/webhooks`, active: true },
      setup_url: `${web}/api/github/setup/callback`,
      redirect_url: `${web}/api/configuration/github-app/callback`,
      callback_urls: [`${web}/api/auth/github/callback`, `${web}/api/github/oauth/callback`],
      default_permissions: permissions,
      default_events: ['push', 'create', 'delete', 'pull_request', 'check_run', 'check_suite', 'workflow_run', 'repository', 'pull_request_review', 'organization', 'team', 'membership', ...(options.managedProtection ? ['repository_ruleset'] : [])],
      request_oauth_on_install: false,
    },
  };
}
