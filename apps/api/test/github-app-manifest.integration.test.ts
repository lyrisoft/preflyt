import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ForbiddenException, ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { disposableDatabase } from './disposable-database.js';
import { ConfigurationService } from '../src/configuration/configuration.service.js';
import { GitHubAppManifestService } from '../src/configuration/github-app-manifest.service.js';
import { GitHubAppManifestController } from '../src/configuration/github-app-manifest.controller.js';
import { githubAppManifest } from '../src/configuration/github-app-manifest.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import { SessionGuard } from '../src/auth/session.guard.js';
import { decryptConfigurationSecrets } from '../src/configuration/configuration-store.js';
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, app: INestApplication;
const options = { organization: 'fixture-org', name: 'Preflyt fixture', apiUrl: 'https://preflyt.example.test/api', setupPullRequests: false, managedProtection: false };
const actor = { authenticated: true as const, identityId: 'admin', subject: 'admin', email: null, role: 'OWNER', platformAdmin: true };
const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
let conversion: Record<string, any>;
const begin = (token = 'super', origin = 'http://localhost:5173') => request(app.getHttpServer()).post('/configuration/github-app').set('Cookie', `sid=${token}`).set('Origin', origin).send({ expectedRevision: 1, ...options });
async function prepared() { const result = await begin(); expect(result.status).toBe(201); return { state: new URL(result.body.action).searchParams.get('state')!, cookie: result.headers['set-cookie'][0].split(';')[0] }; }
const complete = (state: string, cookie: string, token = 'super') => request(app.getHttpServer()).get('/configuration/github-app/callback').query({ state, code: 'test-code' }).set('Cookie', `sid=${token}; ${cookie}`);
beforeAll(async () => {
  fixture = await disposableDatabase('manifest');
  const configuration = new ConfigurationService(fixture.prisma);
  const manifest = new GitHubAppManifestService(fixture.prisma, configuration);
  app = await NestFactory.create({ module: class TestModule {}, controllers: [GitHubAppManifestController], providers: [SessionGuard,
    { provide: GitHubAppManifestService, useValue: manifest },
    { provide: AuthorizationService, useValue: new AuthorizationService(fixture.prisma) },
    { provide: AuthService, useValue: { sessionCookieName: 'sid', currentSession: async (token: string) => ['super', 'other-super', 'owner'].includes(token) ? { ...actor, platformAdmin: token !== 'owner' } : { authenticated: false }, assertOrigin: (value: string) => { if (value !== 'http://localhost:5173') throw new ForbiddenException(); } } },
  ] }, { logger: false });
  app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
});
beforeEach(async () => {
  await fixture.reset();
  vi.stubEnv('CONFIGURATION_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('GITHUB_USER_TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('QUEUE_REDIS_URL', 'redis://127.0.0.1:6379');
  await fixture.prisma.deploymentConfiguration.create({ data: { id: 'primary', values: {}, revision: 1 } });
  conversion = { id: 111, slug: 'preflyt-fixture', owner: { login: options.organization }, permissions: githubAppManifest(options).manifest.default_permissions, events: githubAppManifest(options).manifest.default_events,
    client_id: 'Iv1.fixture', client_secret: 'test-client-secret', webhook_secret: 'a'.repeat(40), pem };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(conversion, { status: 201 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await app.close(); await fixture.close(); });
it('uses useful PR defaults, with setup and administration permissions only when selected', () => {
  const standard = githubAppManifest(options).manifest;
  expect(standard.default_permissions).toEqual({ metadata: 'read', contents: 'read', actions: 'read', checks: 'write', pull_requests: 'write', members: 'read' });
  expect(standard.default_events).not.toContain('installation');
  const optional = githubAppManifest({ ...options, setupPullRequests: true, managedProtection: true }).manifest;
  expect(optional.default_permissions).toMatchObject({ contents: 'write', workflows: 'write', administration: 'write' });
  expect(standard.callback_urls).toHaveLength(2); expect(standard.hook_attributes.url).toBe('https://preflyt.example.test/api/github/webhooks');
});
it('rejects invalid GitHub targets and unreachable local webhook URLs', () => {
  expect(() => githubAppManifest({ ...options, organization: '../evil' })).toThrow();
  expect(() => githubAppManifest({ ...options, apiUrl: 'http://localhost:3000' })).toThrow();
  expect(() => githubAppManifest({ ...options, apiUrl: 'https://a.test/api?secret=1' })).toThrow();
});
it('requires Super Admin, an active session and the exact POST origin', async () => {
  expect((await begin('owner')).status).toBe(403);
  expect((await begin('missing')).status).toBe(401);
  expect((await begin('super', 'https://attacker.test')).status).toBe(403);
  expect(await fixture.prisma.gitHubAppManifestTransaction.count()).toBe(0);
});
it('requires encryption and event infrastructure before creating a registration', async () => {
  vi.stubEnv('GITHUB_USER_TOKEN_ENCRYPTION_KEY', ''); expect((await begin()).status).toBe(503);
  vi.stubEnv('GITHUB_USER_TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64')); vi.stubEnv('QUEUE_REDIS_URL', ''); expect((await begin()).status).toBe(503);
  expect(await fixture.prisma.gitHubAppManifestTransaction.count()).toBe(0);
});
it('binds confirmation to both the original session and browser, and rejects expiry and replay', async () => {
  const value = await prepared();
  await complete(value.state, value.cookie, 'other-super'); expect(fetch).not.toHaveBeenCalled();
  await complete(value.state, 'preflyt.manifest=' + 'x'.repeat(43)); expect(fetch).not.toHaveBeenCalled();
  await complete(value.state, value.cookie); await complete(value.state, value.cookie); expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify((await request(app.getHttpServer()).get('/configuration/github-app/status').set('Cookie', 'sid=super')).body)).not.toContain('test-client-secret');
});
it('stores generated credentials encrypted and atomically records completion without enabling protection', async () => {
  const value = await prepared(); const result = await complete(value.state, value.cookie);
  expect(result.status).toBe(302); expect(result.headers.location).toBe('http://localhost:5173/api/github/connection');
  const row = (await fixture.prisma.deploymentConfiguration.findUnique({ where: { id: 'primary' } }))!;
  expect(row.revision).toBe(2); expect(row.encryptedSecrets).not.toContain('test-client-secret');
  expect(decryptConfigurationSecrets(row.encryptedSecrets)).toMatchObject({ GITHUB_APP_CLIENT_SECRET: 'test-client-secret', GITHUB_APP_PRIVATE_KEY: pem });
  expect(row.values).toMatchObject({ GITHUB_APP_ID: '111', GITHUB_LOGIN_ENABLED: 'true', GITHUB_EVENTS_ENABLED: 'true', GITHUB_CHECK_PUBLICATION_ENABLED: 'true', AUTOMATIC_CHECK_PUBLICATION_ENABLED: 'true', GITHUB_RULESET_ACTIVATION_ENABLED: 'false' });
  expect((await fixture.prisma.gitHubAppManifestTransaction.findFirst())?.status).toBe('CONNECTED');
  const audit = await fixture.prisma.auditEvent.findFirst(); expect(JSON.stringify(audit)).not.toContain('test-client-secret'); expect(JSON.stringify(audit)).not.toContain(pem);
});
it('does not overwrite an existing App or a concurrently changed configuration', async () => {
  const value = await prepared(); await fixture.prisma.deploymentConfiguration.update({ where: { id: 'primary' }, data: { revision: 2, values: { GITHUB_APP_ID: '999' } } });
  await complete(value.state, value.cookie); expect(fetch).not.toHaveBeenCalled(); expect((await begin()).status).toBe(409);
});
it('rejects expired registration before the provider call', async () => {
  const value = await prepared(); await fixture.prisma.gitHubAppManifestTransaction.updateMany({ data: { expiresAt: new Date(0) } });
  await complete(value.state, value.cookie); expect(fetch).not.toHaveBeenCalled();
});
it.each(['wrong-owner', 'unexpected-permission', 'missing-events', 'invalid-key', 'provider-failure'])('fails closed for %s without reflecting provider data', async mode => {
  const value = await prepared();
  if (mode === 'wrong-owner') conversion.owner.login = 'attacker';
  if (mode === 'unexpected-permission') conversion.permissions = { ...conversion.permissions, administration: 'write' };
  if (mode === 'missing-events') conversion.events = [];
  if (mode === 'invalid-key') conversion.pem = 'bad-key';
  if (mode === 'provider-failure') vi.stubGlobal('fetch', vi.fn(async () => new Response('private-provider-error', { status: 422 })));
  await complete(value.state, value.cookie);
  const row = await fixture.prisma.deploymentConfiguration.findUnique({ where: { id: 'primary' } }); expect(row?.revision).toBe(1); expect(row?.encryptedSecrets).toBeNull();
  const result = await request(app.getHttpServer()).get('/configuration/github-app/status').set('Cookie', 'sid=super'); expect(result.body).toEqual({ status: 'FAILED', installationUrl: null });
});
it('consumes concurrent confirmations once', async () => { const value = await prepared(); await Promise.all([complete(value.state, value.cookie), complete(value.state, value.cookie)]); expect(fetch).toHaveBeenCalledTimes(1); });
