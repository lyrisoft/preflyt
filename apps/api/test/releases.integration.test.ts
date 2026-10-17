import 'reflect-metadata'
import {beforeAll,beforeEach,afterAll,afterEach,expect,it,vi} from 'vitest'
import {NestFactory} from '@nestjs/core'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import {disposableDatabase} from './disposable-database.js'
import {ReleasesService} from '../src/releases/releases.service.js'
import {ReleasesController} from '../src/releases/releases.controller.js'
import {AuthService} from '../src/auth/auth.service.js'
import {SessionGuard} from '../src/auth/session.guard.js'
import {AuthorizationService} from '../src/auth/authorization.service.js'
import {compareVersions,parseReleases,versionParts} from '../src/releases/release-policy.js'
let fixture:Awaited<ReturnType<typeof disposableDatabase>>,service:ReleasesService,app:any,sessions:Record<string,any>
const fetched=vi.fn(),sha='a'.repeat(40)
const release=(tag='v0.2.0',extra={})=>({tag_name:tag,name:`Preflyt ${tag}`,html_url:`https://github.com/lyrisoft/preflyt/releases/tag/${tag}`,published_at:'2026-10-17T00:00:00Z',body:`Changes\n<!-- preflyt-release-ready:v1 sha=${sha} -->`,...extra})
const auth={sessionCookieName:'fixture.sid',currentSession:async(token:string)=>sessions[token]??{authenticated:false},assertOrigin:(origin:string)=>{if(origin!=='http://localhost:5173')throw new Error('Invalid origin')}}
beforeAll(async()=>{
 fixture=await disposableDatabase('release')
 const access=new AuthorizationService(fixture.prisma)
 service=new ReleasesService(fixture.prisma,access)
 vi.spyOn(service,'onModuleInit').mockImplementation(()=>{})
 app=await NestFactory.create({module:class TestModule{},controllers:[ReleasesController],providers:[SessionGuard,{provide:AuthService,useValue:auth},{provide:AuthorizationService,useValue:access},{provide:ReleasesService,useValue:service}]},{logger:false})
 app.use(cookieParser());await app.init()
})
afterAll(async()=>{await app?.close();await fixture?.close()})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
beforeEach(async()=>{
 await fixture.reset();sessions={}
 const db=fixture.prisma,org=await db.organization.create({data:{name:'release fixture'}})
 for(const [key,role] of [['owner','OWNER'],['reader','VIEWER'],['platform','OWNER']]){
  const identity=await db.identity.create({data:{issuer:'fixture',subject:key}})
  await db.organizationMembership.create({data:{identityId:identity.id,organizationId:org.id,role}})
  sessions[key]={authenticated:true,identityId:identity.id,organizationId:org.id,role,platformAdmin:key==='platform',subject:key,email:null}
 }
 vi.stubEnv('PREFLYT_BUILD_VERSION','v0.1.2');vi.stubEnv('PREFLYT_BUILD_SHA',sha)
 vi.stubGlobal('fetch',fetched.mockReset().mockImplementation(async()=>Response.json([release()],{headers:{etag:'"one"'}})))
})
const get=(user:string)=>request(app.getHttpServer()).get('/releases').set('Cookie',`fixture.sid=${user}`)
const post=(user:string,path:string,body={})=>request(app.getHttpServer()).post('/releases/'+path).set('Cookie',`fixture.sid=${user}`).set('Origin','http://localhost:5173').send(body)
it('checks a qualified release through SessionGuard, caches globally and sends no identity information',async()=>{
 await get('missing').expect(401)
 await post('reader','check').expect(403)
 const result=await post('owner','check').expect(201)
 expect(result.body).toMatchObject({installed:'v0.1.2',updateAvailable:true,latest:{tag:'v0.2.0',ready:true},unread:true})
 await post('owner','check').expect(201);expect(fetched).toHaveBeenCalledTimes(1)
 expect(fetched.mock.calls[0][0]).toBe('https://api.github.com/repos/lyrisoft/preflyt/releases?per_page=30')
 expect(JSON.stringify(fetched.mock.calls)).not.toContain(sessions.owner.identityId)
 expect(JSON.stringify(fetched.mock.calls)).not.toContain('Authorization')
 expect(await fixture.prisma.releaseCheck.count()).toBe(1)
})
it('persists per-user read state independently and rejects unknown release tags',async()=>{
 await post('owner','check').expect(201)
 await post('reader','read',{tag:'v0.2.0'}).expect(201)
 expect((await get('reader')).body.unread).toBe(false)
 expect((await get('owner')).body.unread).toBe(true)
 await post('reader','read',{tag:'v9.9.9'}).expect(400)
 expect((await new ReleasesService(fixture.prisma,{} as any).status(sessions.reader)).unread).toBe(false)
})
it('preserves cached notes during outages, bounds retries and supports conditional requests',async()=>{
 await service.check(true)
 await fixture.prisma.releaseCheck.updateMany({data:{retryAt:null,checkedAt:new Date(0)}})
 fetched.mockResolvedValueOnce(new Response(null,{status:304}))
 await service.check(false)
 expect(fetched.mock.calls[1][1].headers['If-None-Match']).toBe('"one"')
 await fixture.prisma.releaseCheck.updateMany({data:{retryAt:null}})
 fetched.mockRejectedValueOnce(new Error('private provider details'))
 await service.check(true)
 const status=await service.status(sessions.owner)
 expect(status.latest?.tag).toBe('v0.2.0');expect(status.error).toContain('Could not check')
 expect(JSON.stringify(status)).not.toContain('private provider details')
 await service.check(true);expect(fetched).toHaveBeenCalledTimes(3)
})
it('disables automatic checks with audited deployment preferences and isolates prereleases',async()=>{
 await post('owner','preferences',{enabled:false,prereleases:true,revision:1}).expect(403)
 await post('platform','preferences',{enabled:false,prereleases:true,revision:1}).expect(201)
 await service.check(false);expect(fetched).not.toHaveBeenCalled()
 fetched.mockResolvedValueOnce(Response.json([release('v0.3.0-rc.1',{prerelease:true}),release()]))
 await post('owner','check').expect(201)
 expect((await get('owner')).body.latest.tag).toBe('v0.3.0-rc.1')
 await post('platform','preferences',{enabled:true,prereleases:false,revision:2}).expect(201)
 expect((await get('owner')).body.latest.tag).toBe('v0.2.0')
 await post('platform','preferences',{enabled:true,prereleases:false,revision:1}).expect(400)
 expect(await fixture.prisma.auditEvent.count({where:{event:'releases.preferences_updated'}})).toBe(2)
})
it('does not advertise unqualified releases, drafts or development upgrade comparisons',async()=>{
 fetched.mockResolvedValueOnce(Response.json([release('v9.0.0',{draft:true}),release('v0.4.0',{body:'Images not ready'}),release()]))
 await service.check(true)
 expect((await service.status(sessions.owner)).latest?.tag).toBe('v0.2.0')
 vi.stubEnv('PREFLYT_BUILD_VERSION','development')
 expect(await service.status(sessions.owner)).toMatchObject({development:true,updateAvailable:false})
})
it('leases checks across replicas and rejects oversized or redirected responses without losing cache',async()=>{
 await fixture.prisma.releaseCheck.create({data:{id:'preflyt',leaseUntil:new Date(Date.now()+30000)}})
 await service.check(true);expect(fetched).not.toHaveBeenCalled()
 await fixture.prisma.releaseCheck.updateMany({data:{leaseUntil:null}})
 fetched.mockResolvedValueOnce(new Response('x'.repeat(2*1024*1024+1)))
 await service.check(true)
 expect((await service.status(sessions.owner)).error).toContain('Could not check')
})
it('compares semantic versions numerically and rejects unsafe release links',()=>{
 expect(compareVersions('v1.10.0','v1.9.9')).toBe(1)
 expect(compareVersions('1.0.0-rc.10','1.0.0-rc.2')).toBe(1)
 expect(compareVersions('1.0.0','1.0.0-rc.10')).toBe(1)
 expect(versionParts('01.2.3')).toBeNull();expect(versionParts('1.0.0-rc..2')).toBeNull()
 expect(parseReleases([release('v1.0.0',{html_url:'https://attacker.example'})])).toEqual([])
})

it('keeps automatic checks on a 12-hour cadence and atomically shares manual checks',async()=>{
 await Promise.all([service.check(true),service.check(true),service.check(true)])
 expect(fetched).toHaveBeenCalledTimes(1)
 await fixture.prisma.releaseCheck.updateMany({data:{retryAt:null}})
 await service.check(false);expect(fetched).toHaveBeenCalledTimes(1)
 await fixture.prisma.releaseCheck.updateMany({data:{checkedAt:new Date(Date.now()-13*60*60*1000)}})
 fetched.mockResolvedValueOnce(new Response(null,{status:304}))
 await service.check(false);expect(fetched).toHaveBeenCalledTimes(2)
})
