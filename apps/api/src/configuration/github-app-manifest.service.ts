import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigurationService } from './configuration.service.js';
import { encryptConfigurationSecrets, initializeConfiguration, unpackConfiguration, validateConfiguration } from './configuration-store.js';
import { resolveWebOrigin } from '../config/web-origin.js';
import { githubAppManifest, type ManifestOptions } from './github-app-manifest.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ttl = 30 * 60 * 1000;
@Injectable()
export class GitHubAppManifestService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ConfigurationService) private readonly configuration: ConfigurationService) {}
  private authorize(session: AuthenticatedSession, sessionToken: string) {
    if (session.platformAdmin !== true || !sessionToken) throw new ForbiddenException('Only an active Super Admin can create the deployment GitHub App');
  }
  async begin(session: AuthenticatedSession, sessionToken: string, revision: number, options: ManifestOptions) {
    this.authorize(session, sessionToken);
    const row = await initializeConfiguration(this.db);
    if (row.revision !== revision) throw new ConflictException('Configuration changed. Refresh before creating the App.');
    const values = unpackConfiguration(row);
    if (values.GITHUB_APP_ID) throw new ConflictException('A GitHub App is already connected. Manage its permissions in GitHub; do not replace it to enable setup PRs or merge protection.');
    // Validate infrastructure before GitHub creates credentials we cannot persist or use.
    encryptConfigurationSecrets({ GITHUB_APP_CLIENT_SECRET: 'preflight' });
    const tokenKey = process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY ?? '';
    if (Buffer.from(tokenKey, 'base64').length !== 32 || Buffer.from(tokenKey, 'base64').toString('base64') !== tokenKey || tokenKey === process.env.CONFIGURATION_ENCRYPTION_KEY)
      throw new ServiceUnavailableException('Configure a separate GITHUB_USER_TOKEN_ENCRYPTION_KEY in deployment secrets before creating the App.');
    if (!process.env.QUEUE_REDIS_URL) throw new ServiceUnavailableException('Configure QUEUE_REDIS_URL before creating the App so GitHub events can be processed.');
    const definition = githubAppManifest(options);
    const state = randomBytes(32).toString('base64url'), binding = randomBytes(32).toString('base64url');
    await this.db.$transaction(async tx => {
      await tx.gitHubAppManifestTransaction.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await tx.gitHubAppManifestTransaction.updateMany({ where: { actorId: session.identityId, consumedAt: null }, data: { consumedAt: new Date(), status: 'CANCELLED' } });
      await tx.gitHubAppManifestTransaction.create({ data: { stateHash: hash(state), bindingHash: hash(binding), sessionHash: hash(sessionToken), actorId: session.identityId, configurationRevision: revision, apiUrl: options.apiUrl, organization: options.organization, manifest: definition.manifest, expiresAt: new Date(Date.now() + ttl) } });
    });
    return { ...definition, action: `${definition.action}?state=${state}`, binding, expiresIn: ttl };
  }
  async complete(session: AuthenticatedSession, sessionToken: string, binding: string, state: string, code: string) {
    this.authorize(session, sessionToken);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(binding) || !/^[a-zA-Z0-9_-]{1,200}$/.test(code)) throw new BadRequestException('GitHub App confirmation is invalid. Start again.');
    const transaction = await this.db.gitHubAppManifestTransaction.findUnique({ where: { stateHash: hash(state) } });
    if (!transaction || transaction.actorId !== session.identityId || transaction.sessionHash !== hash(sessionToken) || transaction.bindingHash !== hash(binding) || transaction.expiresAt <= new Date() || transaction.consumedAt)
      throw new ForbiddenException('GitHub App confirmation expired or belongs to another session. Start again.');
    const row = await initializeConfiguration(this.db);
    if (row.revision !== transaction.configurationRevision || unpackConfiguration(row).GITHUB_APP_ID) throw new ConflictException('Configuration changed. The connected App has not been replaced.');
    const claim = await this.db.gitHubAppManifestTransaction.updateMany({ where: { id: transaction.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date(), status: 'PROCESSING' } });
    if (claim.count !== 1) throw new ConflictException('GitHub App confirmation has already been used.');
    try {
      const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', redirect: 'error', headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok || !response.body) throw new Error('conversion');
      const reader = response.body.getReader(); let text = '', bytes = 0;
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 64000) { await reader.cancel(); throw new Error('size'); } text += decoder.decode(chunk.value, { stream: true }); }
      text += decoder.decode();
      const data = JSON.parse(text);
      if (!Number.isSafeInteger(data.id) || data.id < 1 || typeof data.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(data.slug) ||
          !['client_id', 'client_secret', 'pem', 'webhook_secret'].every(key => typeof data[key] === 'string' && data[key].length > 0 && data[key].length < 16384)) throw new Error('invalid');
      const expected = transaction.manifest as { default_permissions: Record<string, string>; default_events: string[] };
      if (data.owner?.login?.toLowerCase() !== transaction.organization.toLowerCase() ||
          !expected.default_permissions || !Array.isArray(expected.default_events) ||
          !Object.entries(expected.default_permissions).every(([key, permission]) => data.permissions?.[key] === permission) ||
          Object.keys(data.permissions ?? {}).some(key => !(key in expected.default_permissions)) ||
          !Array.isArray(data.events) || !expected.default_events.every(event => data.events.includes(event))) throw new Error('definition');
      const web = resolveWebOrigin();
      const patch = { GITHUB_APP_ID: String(data.id), GITHUB_APP_CLIENT_ID: data.client_id, GITHUB_APP_CLIENT_SECRET: data.client_secret,
        GITHUB_APP_PRIVATE_KEY: data.pem, GITHUB_WEBHOOK_SECRET: data.webhook_secret, PREFLYT_PUBLIC_API_URL: transaction.apiUrl,
        GITHUB_APP_OAUTH_CALLBACK_URL: `${web}/api/github/oauth/callback`, GITHUB_LOGIN_CALLBACK_URL: `${web}/api/auth/github/callback`,
        GITHUB_LOGIN_ENABLED: 'true', GITHUB_EVENTS_ENABLED: 'true', GITHUB_CHECK_PUBLICATION_ENABLED: 'true',
        AUTOMATIC_CHECK_PUBLICATION_ENABLED: 'true', GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED: 'false' };
      validateConfiguration(patch, true);
      await this.configuration.save(session, transaction.configurationRevision, patch, [], async tx => {
        await tx.gitHubAppManifestTransaction.update({ where: { id: transaction.id }, data: { status: 'CONNECTED', appSlug: data.slug } });
      });
      // No credentials, authorization code, or webhook secret are returned to the browser.
    } catch {
      await this.db.gitHubAppManifestTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED' } });
      throw new ServiceUnavailableException('App confirmation could not be saved. Check GitHub for the newly registered App before trying again; an existing connection was not replaced.');
    }
  }
  async status(session: AuthenticatedSession, sessionToken: string) {
    this.authorize(session, sessionToken);
    const result = await this.db.gitHubAppManifestTransaction.findFirst({ where: { actorId: session.identityId, sessionHash: hash(sessionToken), expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return { status: result?.status ?? null, installationUrl: result?.status === 'CONNECTED' && result.appSlug ? `https://github.com/apps/${result.appSlug}/installations/new` : null };
  }
}
