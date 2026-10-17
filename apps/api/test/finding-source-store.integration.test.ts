import { GitHubRateLimitError } from '../src/github/github-rate-limit.js'
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest'
import { disposableDatabase } from './disposable-database.js'
import { FindingSourceStore } from '../src/findings/finding-source-store.service.js'
import { FindingsService } from '../src/findings/findings.service.js'
import { queueFindingSources, sourceLocation } from '../src/findings/finding-source-store.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import type { AuthenticatedSession } from '../src/auth/session.guard.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, repositoryId: string, owner: AuthenticatedSession
const sha = 'a'.repeat(40), location = { path: 'src/app.ts', line: 2, endLine: 3, ruleId: 'unsafe-query', title: 'Unsafe query' }
const provider = { readHealthSource: vi.fn() }
let store: FindingSourceStore
beforeAll(async () => { fixture = await disposableDatabase('source') })
afterAll(async () => { await fixture.close() })
beforeEach(async () => {
 await fixture.reset()
 const db = fixture.prisma, org = await db.organization.create({ data: { name: 'source fixture' } }), identity = await db.identity.create({ data: { issuer: 'fixture', subject: 'owner' } })
 await db.organizationMembership.create({ data: { identityId: identity.id, organizationId: org.id, role: 'OWNER' } })
 owner = { authenticated: true, identityId: identity.id, organizationId: org.id, subject: 'owner', role: 'OWNER', email: null }
 await db.gitHubInstallation.create({ data: { id: 1n, connectedById: identity.id, organizationId: org.id, accountLogin: 'fixture', accountType: 'Organization', repositorySelection: 'selected', permissions: {} } })
 repositoryId = (await db.gitHubRepository.create({ data: { githubId: 11n, installationId: 1n, name: 'repo', fullName: 'fixture/repo', ownerLogin: 'fixture', isPrivate: true, selected: true, defaultBranch: 'main' } })).id
 provider.readHealthSource.mockReset().mockResolvedValue('first\nunsafe();\napi_key="private-value"\nlast')
 store = new FindingSourceStore(db, provider as any)
})
it('captures only redacted excerpts and serves them after a process restart without GitHub', async () => {
 const first = await store.read(repositoryId, sha, location)
 expect(first.lines).toContainEqual({ number: 3, text: '[Sensitive source line hidden]' })
 const persisted = await fixture.prisma.findingSourceExcerpt.findFirstOrThrow()
 expect(persisted.capturedAt).not.toBeNull()
 expect(JSON.stringify(persisted.content)).not.toContain('private-value')
 provider.readHealthSource.mockRejectedValue(new Error('GitHub offline'))
 const restarted = new FindingSourceStore(fixture.prisma, provider as any)
 expect(await restarted.read(repositoryId, sha, location)).toEqual(first)
 expect(provider.readHealthSource).toHaveBeenCalledTimes(1)
})
it('isolates snapshots by repository, revision and reported block', async () => {
 await store.read(repositoryId, sha, location)
 const other = await fixture.prisma.gitHubRepository.create({ data: { githubId: 12n, installationId: 1n, name: 'other', fullName: 'fixture/other', ownerLogin: 'fixture', isPrivate: true, selected: true } })
 await store.read(other.id, sha, location)
 await store.read(repositoryId, 'b'.repeat(40), location)
 await store.read(repositoryId, sha, { ...location, line: 1, endLine: 1 })
 expect(await fixture.prisma.findingSourceExcerpt.count()).toBe(4)
 expect(provider.readHealthSource).toHaveBeenCalledTimes(4)
})
it('queues capture transactionally, deduplicates and prepares new findings before they are opened', async () => {
 const db = fixture.prisma
 await expect(db.$transaction(async tx => { await queueFindingSources(tx, repositoryId, sha, [location]); throw new Error('rollback') })).rejects.toThrow('rollback')
 expect(await db.findingSourceExcerpt.count()).toBe(0)
 await db.$transaction(tx => queueFindingSources(tx, repositoryId, sha, [location, location, { ...location, line: 1, endLine: 1 }]))
 await store.reconcile()
 expect(provider.readHealthSource).toHaveBeenCalledTimes(1)
 expect(await db.findingSourceExcerpt.count({ where: { capturedAt: { not: null } } })).toBe(2)
 await store.read(repositoryId, sha, location)
 expect(provider.readHealthSource).toHaveBeenCalledTimes(1)
})
it('queues redacted secret excerpts, rejects unsafe paths and bounds stored code', async () => {
 const db = fixture.prisma
 await db.$transaction(tx => queueFindingSources(tx, repositoryId, sha, [{ ...location, checkId: 'secrets.scan' }, { ...location, ruleId: 'gitleaks' }, { ...location, path: '../private' }]))
 expect(await db.findingSourceExcerpt.count()).toBe(1)
 provider.readHealthSource.mockResolvedValue(Array.from({length: 200}, () => 'x'.repeat(3000)).join('\n'))
 const result = await store.read(repositoryId, sha, { ...location, line: 10, endLine: 180 })
 expect(result.lines).toHaveLength(60)
 expect(result.lines.every(line => line.text.length <= 2000)).toBe(true)
 expect(result.truncated).toBe(true)
})
it('keeps transient failure retryable and fails closed on altered stored excerpts', async () => {
 provider.readHealthSource.mockRejectedValueOnce(new Error('private-provider-error'))
 const failed = await store.read(repositoryId, sha, location)
 expect(failed.lines).toEqual([])
 expect(JSON.stringify(failed)).not.toContain('private-provider-error')
 expect((await fixture.prisma.findingSourceExcerpt.findFirstOrThrow()).contentHash).toBeNull()
 await fixture.prisma.findingSourceExcerpt.updateMany({ data: { retryAfter: new Date(0) } })
 await store.read(repositoryId, sha, location)
 await fixture.prisma.findingSourceExcerpt.updateMany({ data: { content: { lines: [{number: 2,text: 'altered'}], reason: null, truncated: false } } })
 await expect(store.read(repositoryId, sha, location)).rejects.toThrow('integrity')
})
it('still denies stored code after a user grant or repository access is revoked', async () => {
 const db = fixture.prisma, access = new AuthorizationService(db), service = new FindingsService(db, access, store)
 vi.spyOn(service as any, 'finding').mockResolvedValue({ ...location, repositoryId: '11', sourceSha: sha, category: 'security' })
 await service.source(owner, 'f'.repeat(64))
 await db.organizationMembership.updateMany({ where: { identityId: owner.identityId }, data: { active: false } })
 await expect(service.source(owner, 'f'.repeat(64))).rejects.toThrow()
 expect(provider.readHealthSource).toHaveBeenCalledTimes(1)
 await db.organizationMembership.updateMany({ where: { identityId: owner.identityId }, data: { active: true } })
 await db.gitHubRepository.update({ where: { id: repositoryId }, data: { selected: false } })
 await expect(service.source(owner, 'f'.repeat(64))).rejects.toThrow()
 const row = await db.findingSourceExcerpt.findUniqueOrThrow({ where: { id: sourceLocation(repositoryId, sha, location)!.id } })
 expect(row.capturedAt).not.toBeNull()
})
it('does not retain source when repository access changes during capture', async () => {
 provider.readHealthSource.mockImplementationOnce(async () => { await fixture.prisma.gitHubRepository.update({ where: { id: repositoryId }, data: { available: false } }); return 'private source' })
 await expect(store.read(repositoryId, sha, location)).rejects.toThrow('access')
 expect((await fixture.prisma.findingSourceExcerpt.findFirstOrThrow()).content).toBeNull()
})

it('separates secret excerpts from ordinary cached source and masks unknown detector ranges before storage', async () => {
 provider.readHealthSource.mockResolvedValue('before();\nopaque-sensitive-value\nsecond-sensitive-line\nafter();')
 const normal = await store.read(repositoryId, sha, location)
 expect(normal.lines[1].text).toBe('opaque-sensitive-value')
 const secret = {...location, checkId:'secrets.scan', ruleId:'unrecognized-detector'}
 const result = await store.read(repositoryId, sha, secret)
 expect(result.lines).toEqual([{number:1,text:'before();'},{number:2,text:'[Potential credential redacted]'},{number:3,text:'[Potential credential redacted]'},{number:4,text:'after();'}])
 const saved = await fixture.prisma.findingSourceExcerpt.findUniqueOrThrow({where:{id:sourceLocation(repositoryId,sha,secret)!.id}})
 expect(JSON.stringify(saved.content)).not.toContain('sensitive-value')
 expect(JSON.stringify(saved.content)).not.toContain('second-sensitive-line')
 provider.readHealthSource.mockRejectedValue(new Error('offline'))
 expect(await new FindingSourceStore(fixture.prisma,provider as any).read(repositoryId,sha,secret)).toEqual(result)
 expect(sourceLocation(repositoryId,sha,{...secret,line:null,endLine:null})).toBeNull()
})

it('preserves the background capture allowance across rate limits and honors cooldown after restart',async()=>{
 for(let attempt=0;attempt<4;attempt++) {
  provider.readHealthSource.mockRejectedValueOnce(new GitHubRateLimitError(3600000))
  await store.read(repositoryId,sha,location)
  const row=await fixture.prisma.findingSourceExcerpt.findFirstOrThrow()
  expect(row.attempts).toBe(0)
  expect(row.retryAfter.getTime()).toBeGreaterThan(Date.now()+3500000)
  store=new FindingSourceStore(fixture.prisma,provider as any)
  await store.reconcile()
  expect(provider.readHealthSource).toHaveBeenCalledTimes(attempt+1)
  await fixture.prisma.findingSourceExcerpt.updateMany({data:{retryAfter:new Date(0)}})
 }
 await store.reconcile()
 expect((await fixture.prisma.findingSourceExcerpt.findFirstOrThrow()).capturedAt).not.toBeNull()
 expect(provider.readHealthSource).toHaveBeenCalledTimes(5)
})
