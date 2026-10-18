import 'reflect-metadata'
import {beforeAll, afterAll, beforeEach, it, expect, vi} from 'vitest'
import {disposableDatabase} from './disposable-database.js'
import {GitHubDisplayReads} from '../src/github/github-display-read.js'
import {GitHubRateLimitError} from '../src/github/github-rate-limit.js'
import {GitHubWebhookService} from '../src/github-events/github-webhook.service.js'
import {createHmac, randomUUID} from 'node:crypto'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
let store: GitHubDisplayReads
const load = vi.fn()
let fingerprint = 'connection1'
beforeAll(async () => {fixture = await disposableDatabase('displayreads')})
afterAll(async () => {await fixture.close(); vi.unstubAllEnvs()})
beforeEach(async () => {
  await fixture.reset(); load.mockReset().mockResolvedValue({branches:['main'],hasMore:false}); fingerprint='connection1'
  const db=fixture.prisma
  const actor=await db.identity.create({data:{issuer:'test',subject:'display'}})
  const org=await db.organization.create({data:{name:'Display fixture'}})
  await db.gitHubInstallation.create({data:{id:41n,organizationId:org.id,accountLogin:'fixture',accountType:'Organization',repositorySelection:'all',permissions:{contents:'read'},connectedById:actor.id}})
  await db.gitHubRepository.create({data:{githubId:42n,installationId:41n,name:'repo',fullName:'fixture/repo',ownerLogin:'fixture',selected:true,isPrivate:true}})
  store=new GitHubDisplayReads(db,()=>fingerprint,load)
})
const read = (refresh=false) => store.read('branches',41n,42n,[1],refresh)
it('cold page reads queue one durable job without calling GitHub; replicas share saved data',async()=>{
  const results=await Promise.allSettled(Array.from({length:20},()=>read()))
  expect(results.every(r=>r.status==='rejected')).toBe(true)
  expect(load).not.toHaveBeenCalled(); expect(await fixture.prisma.gitHubDisplayRead.count()).toBe(1)
  await Promise.all([store.reconcile(),new GitHubDisplayReads(fixture.prisma,()=>fingerprint,load).reconcile()])
  expect(load).toHaveBeenCalledTimes(1)
  expect(await read()).toEqual({branches:['main'],hasMore:false})
})
it('serves the saved result through throttling and retains the retry deadline on refresh',async()=>{
  await read().catch(()=>{});await store.reconcile()
  await read(true);load.mockRejectedValue(new GitHubRateLimitError(300000));await store.reconcile()
  const prior=await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()
  expect(prior.state).toBe('PENDING');expect(prior.errorCode).toBe('GITHUB_RATE_LIMITED')
  await read(true);await store.reconcile()
  expect(load).toHaveBeenCalledTimes(2)
  expect((await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()).nextAttemptAt).toEqual(prior.nextAttemptAt)
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{nextAttemptAt:new Date(0)}})
  load.mockResolvedValue({branches:['main','new'],hasMore:false});await store.reconcile()
  expect(await read()).toMatchObject({branches:['main','new']})
})
it('revocation, access revision and connection changes cannot expose an older snapshot',async()=>{
  await read().catch(()=>{});await store.reconcile()
  await fixture.prisma.gitHubInstallation.update({where:{id:41n},data:{accessRevision:{increment:1}}})
  await expect(read()).rejects.toMatchObject({response:{code:'GITHUB_SYNC_PENDING'}})
  fingerprint='connection2';await expect(read()).rejects.toMatchObject({response:{code:'GITHUB_SYNC_PENDING'}})
  await fixture.prisma.gitHubInstallation.update({where:{id:41n},data:{active:false}})
  await expect(read()).rejects.toThrow('Repository access is unavailable')
})
it('a revision change while a worker loads prevents publication',async()=>{
  await read().catch(()=>{})
  load.mockImplementation(async()=>{await fixture.prisma.gitHubInstallation.update({where:{id:41n},data:{accessRevision:{increment:1}}});return {branches:['secret'],hasMore:false}})
  await store.reconcile()
  expect(await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()).toMatchObject({state:'INVALID',value:null})
})
it('signed webhook invalidation is replay-safe and cannot erase a throttle deadline',async()=>{
  await read().catch(()=>{});await store.reconcile();await read(true)
  load.mockRejectedValue(new GitHubRateLimitError(300000));await store.reconcile()
  const prior=await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()
  const secret='display-test-secret-'.repeat(3);vi.stubEnv('GITHUB_EVENTS_ENABLED','true');vi.stubEnv('GITHUB_WEBHOOK_SECRET',secret)
  const body={installation:{id:41},repository:{id:42},ref_type:'branch',ref:'new'}
  const raw=Buffer.from(JSON.stringify(body)), id=randomUUID(), signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex')
  const hooks=new GitHubWebhookService(fixture.prisma)
  await hooks.receive(raw,signature,id,'create',body);await hooks.receive(raw,signature,id,'create',body)
  const after=await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()
  expect(after.generation).toBe(prior.generation+1);expect(after.nextAttemptAt).toEqual(prior.nextAttemptAt)
  await expect(hooks.receive(raw,'sha256='+'0'.repeat(64),randomUUID(),'create',body)).rejects.toThrow()
})
it('webhook generation changes during a load cannot publish obsolete data',async()=>{
  await read().catch(()=>{});load.mockImplementation(async()=>{await fixture.prisma.gitHubDisplayRead.updateMany({data:{generation:{increment:1}}});return {branches:['obsolete']}})
  await store.reconcile();expect(await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()).toMatchObject({state:'PENDING',value:null,leaseToken:null})
})
it('distinguishes queued, running, stalled, failed and throttled cold refreshes', async()=>{
  vi.stubEnv('GITHUB_DISPLAY_STALL_SECONDS','30')
  await expect(read()).rejects.toMatchObject({response:{code:'GITHUB_SYNC_PENDING',message:expect.stringContaining('Waiting for')}})
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{nextAttemptAt:new Date(Date.now()-31000)}})
  await expect(read(true)).rejects.toMatchObject({response:{code:'GITHUB_SYNC_STALLED'}})
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{leaseToken:'busy',leaseUntil:new Date(Date.now()+60000)}})
  await expect(read()).rejects.toMatchObject({response:{code:'GITHUB_SYNC_PENDING',message:expect.stringContaining('fetching')}})
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{leaseToken:null,leaseUntil:null}})
  load.mockRejectedValueOnce(new Error('private upstream details'))
  await store.reconcile()
  const failure=await read().catch(error=>error.getResponse())
  expect(failure.code).toBe('GITHUB_SYNC_FAILED');expect(JSON.stringify(failure)).not.toContain('private upstream')
  const retry=await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()
  await read(true).catch(()=>{});expect((await fixture.prisma.gitHubDisplayRead.findFirstOrThrow()).nextAttemptAt).toEqual(retry.nextAttemptAt)
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{nextAttemptAt:new Date(0)}})
  load.mockRejectedValueOnce(new GitHubRateLimitError(300000));await store.reconcile()
  const limited=await read().catch(error=>error.getResponse())
  expect(limited.code).toBe('GITHUB_RATE_LIMITED');expect(Date.parse(limited.retryAt)).toBeGreaterThan(Date.now()+290000)
  await fixture.prisma.gitHubDisplayRead.updateMany({data:{nextAttemptAt:new Date(0)}})
  load.mockResolvedValue({branches:['recovered']});await store.reconcile()
  expect(await read()).toEqual({branches:['recovered']})
  vi.unstubAllEnvs()
})
