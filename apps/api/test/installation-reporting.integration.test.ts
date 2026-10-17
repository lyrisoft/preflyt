import 'reflect-metadata'
import {beforeAll,beforeEach,afterAll,afterEach,expect,it,vi} from 'vitest'
import {NestFactory} from '@nestjs/core'
import {ForbiddenException} from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import {Pool} from 'pg'
import {randomUUID} from 'node:crypto'
import {disposableDatabase} from './disposable-database.js'
import {InstallationReportingService} from '../src/installation-reporting/installation-reporting.service.js'
import {InstallationReportingController} from '../src/installation-reporting/installation-reporting.controller.js'
import {AuthService} from '../src/auth/auth.service.js'
import {SessionGuard} from '../src/auth/session.guard.js'
import {AuthorizationService} from '../src/auth/authorization.service.js'
import {createInstallationCollector,initializeCollector,pruneCollector} from '../src/installation-reporting/collector.js'
import {loadCountryLookup,publicAddress,reportCountry,trustedProxies} from '../src/installation-reporting/country.js'
import type {IncomingMessage} from 'node:http'
import {reportEndpoint,validReport} from '../src/installation-reporting/reporting-policy.js'
let fixture:Awaited<ReturnType<typeof disposableDatabase>>,pool:Pool,service:InstallationReportingService,app:any,sessions:Record<string,any>
const fetched=vi.fn(),token='collector-token-'.repeat(4),id=randomUUID()
beforeAll(async()=>{
 fixture=await disposableDatabase('installation');pool=new Pool({connectionString:process.env.DATABASE_URL});await initializeCollector(pool)
 service=new InstallationReportingService(fixture.prisma);vi.spyOn(service,'onModuleInit').mockImplementation(()=>{})
 const access=new AuthorizationService(fixture.prisma)
 app=await NestFactory.create({module:class TestModule{},controllers:[InstallationReportingController],providers:[SessionGuard,{provide:AuthService,useValue:{sessionCookieName:'fixture.sid',currentSession:async(key:string)=>sessions[key]??{authenticated:false},assertOrigin:(origin:string)=>{if(origin!=='http://localhost:5173')throw new ForbiddenException('Invalid origin')}}},{provide:AuthorizationService,useValue:access},{provide:InstallationReportingService,useValue:service}]},{logger:false})
 app.use(cookieParser());await app.init()
})
afterAll(async()=>{await app?.close();await pool?.end();await fixture?.close()})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
beforeEach(async()=>{
 await fixture.reset();sessions={}
 for(const key of ['admin','owner']){const identity=await fixture.prisma.identity.create({data:{issuer:'fixture',subject:key}});sessions[key]={authenticated:true,identityId:identity.id,role:'OWNER',subject:key,platformAdmin:key==='admin'}}
 vi.stubEnv('PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED','');vi.stubEnv('PREFLYT_INSTALLATION_REPORTING_URL','https://reports.example.com/v1/installations');vi.stubEnv('PREFLYT_INSTALLATION_REPORTING_ENABLED','true');vi.stubEnv('PREFLYT_BUILD_VERSION','v0.1.2');vi.stubEnv('PREFLYT_DEPLOYMENT_TYPE','compose')
 vi.stubGlobal('fetch',fetched.mockReset().mockResolvedValue(new Response(null,{status:202})))
})
const get=(who:string)=>request(app.getHttpServer()).get('/installation-reporting').set('Cookie',`fixture.sid=${who}`)
const post=(who:string,path:string,body:unknown)=>request(app.getHttpServer()).post('/installation-reporting/'+path).set('Cookie',`fixture.sid=${who}`).set('Origin','http://localhost:5173').send(body)
it('reports once by default with exactly the advertised payload and shares daily scheduling across replicas',async()=>{
 await Promise.all([service.report(),service.report(),new InstallationReportingService(fixture.prisma).report()])
 expect(fetched).toHaveBeenCalledTimes(1)
 const payload=JSON.parse(fetched.mock.calls[0][1].body)
 expect(Object.keys(payload).sort()).toEqual(['countryReporting','deploymentType','installationId','schemaVersion','version'])
 expect(validReport(payload)).toBe(true)
 expect(fetched.mock.calls[0][1].redirect).toBe('error')
 expect(fetched.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
 const state=await service.status(sessions.admin)
 expect(state.enabled).toBe(true);expect(state.lastReportedAt).not.toBeNull()
 expect(payload.installationId).toBe(state.payload.installationId)
 await service.report();expect(fetched).toHaveBeenCalledTimes(1)
 const again=await new InstallationReportingService(fixture.prisma).status(sessions.admin)
 expect(again.payload.installationId).toBe(payload.installationId)
})
it('stops future reports when disabled, preserves that decision after restart and allows explicit re-enabling',async()=>{
 await service.report()
 await post('admin','preferences',{enabled:false,expectedRevision:1}).expect(201)
 await fixture.prisma.installationReporting.updateMany({data:{nextAttemptAt:null}})
 await new InstallationReportingService(fixture.prisma).report()
 expect(fetched).toHaveBeenCalledTimes(1)
 expect((await get('admin')).body).toMatchObject({enabled:false,acknowledged:true,revision:2})
 await post('admin','preferences',{enabled:true,expectedRevision:2}).expect(201)
 await service.report();expect(fetched).toHaveBeenCalledTimes(2)
 expect(await fixture.prisma.auditEvent.count({where:{event:'installation_reporting.preferences_updated'}})).toBe(2)
})
it('respects an environment opt-out before the first report and never sends to a missing or invalid destination',async()=>{
 vi.stubEnv('PREFLYT_INSTALLATION_REPORTING_ENABLED','false');await service.report();expect(fetched).not.toHaveBeenCalled()
 expect(await fixture.prisma.installationReporting.count()).toBe(0)
 await post('admin','preferences',{enabled:true,expectedRevision:1}).expect(400)
 vi.stubEnv('PREFLYT_INSTALLATION_REPORTING_ENABLED','true')
 for(const url of ['', 'http://attacker.example/v1/installations','https://user:secret@host/v1/installations','https://host/v1/installations?token=secret']){
  vi.stubEnv('PREFLYT_INSTALLATION_REPORTING_URL',url);await service.report()
 }
 expect(fetched).not.toHaveBeenCalled()
 expect((await get('admin')).body.configured).toBe(false)
})
it('protects reporting controls through the real session guard and rejects stale revisions and foreign origins',async()=>{
 await get('missing').expect(401);await get('owner').expect(403)
 await post('owner','preferences',{enabled:false,expectedRevision:1}).expect(403)
 await get('admin').expect(200)
 await request(app.getHttpServer()).post('/installation-reporting/preferences').set('Cookie','fixture.sid=admin').set('Origin','https://untrusted.example').send({enabled:false,expectedRevision:1}).expect(403)
 await post('admin','preferences',{enabled:false,expectedRevision:1}).expect(201)
 await post('admin','preferences',{enabled:true,expectedRevision:1}).expect(409)
 await post('admin','acknowledge',{}).expect(201)
 expect((await get('admin')).body.acknowledged).toBe(true)
})
it('backs off on receiver failures without exposing provider errors or blocking the app',async()=>{
 fetched.mockRejectedValueOnce(new Error('private endpoint details'))
 await service.report();await service.report();expect(fetched).toHaveBeenCalledTimes(1)
 const status=await service.status(sessions.admin)
 expect(status.error).toContain('could not be delivered');expect(JSON.stringify(status)).not.toContain('private endpoint details')
 expect((await fixture.prisma.installationReporting.findFirstOrThrow()).failureCount).toBe(1)
 await fixture.prisma.installationReporting.updateMany({data:{nextAttemptAt:null}})
 await service.report();expect((await service.status(sessions.admin)).lastReportedAt).not.toBeNull()
})
it('accepts anonymous reports, deduplicates IDs and protects central adoption statistics',async()=>{
 const collector=createInstallationCollector(pool,token)
 const report={schemaVersion:1,installationId:id,version:'v0.1.2',deploymentType:'compose'}
 await request(collector).post('/v1/installations').send(report).expect(202)
 await request(collector).post('/v1/installations').send(report).expect(202)
 await request(collector).get('/v1/statistics').expect(401)
 const stats=(await request(collector).get('/v1/statistics').set('Authorization','Bearer '+token).expect(200)).body
 expect(stats).toMatchObject({knownInstallations:1,active30Days:1,firstSeenLast30Days:1,byVersion:[{version:'v0.1.2',installations:1}]})
 expect(JSON.stringify(stats)).not.toContain(id)
 const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='preflyt_installations'")).rows.map(row=>row.column_name).sort()
 expect(columns).toEqual(['country_code','deployment_type','first_seen','installation_id','last_seen','version'])
 await request(collector).post('/v1/installations').send({...report,installationId:randomUUID(),version:'development'}).expect(202)
 expect((await request(collector).get('/v1/statistics').set('Authorization','Bearer '+token)).body.active30Days).toBe(1)
})
it('rejects additional identifying fields, oversized bodies and excessive anonymous traffic',async()=>{
 const collector=createInstallationCollector(pool,token,3),report={schemaVersion:1,installationId:id,version:'v0.1.2',deploymentType:'compose'}
 await request(collector).post('/v1/installations').send({...report,email:'person@example.com'}).expect(422)
 await request(collector).post('/v1/installations').send({...report,sourceCode:'x'.repeat(3000)}).expect(413)
 await request(collector).post('/v1/installations').send(report).expect(202)
 await request(collector).post('/v1/installations').send(report).expect(429)
 expect((await pool.query('SELECT count(*)::int AS count FROM preflyt_installations')).rows[0].count).toBe(1)
})
it('prunes inactive records after 90 days and validates local-only HTTP overrides',async()=>{
 await pool.query("INSERT INTO preflyt_installations(installation_id,version,deployment_type,last_seen)VALUES($1,'v0.1.2','linux',now()-interval '91 days')",[id])
 await pruneCollector(pool);expect((await pool.query('SELECT count(*)::int AS count FROM preflyt_installations')).rows[0].count).toBe(0)
 expect(reportEndpoint({NODE_ENV:'production',PREFLYT_INSTALLATION_REPORTING_ALLOW_LOCAL_HTTP:'true',PREFLYT_INSTALLATION_REPORTING_URL:'http://localhost/v1/installations'})).toBeNull()
 expect(reportEndpoint({NODE_ENV:'development',PREFLYT_INSTALLATION_REPORTING_ALLOW_LOCAL_HTTP:'true',PREFLYT_INSTALLATION_REPORTING_URL:'http://installation-collector:3020/v1/installations'})).toBe('http://installation-collector:3020/v1/installations')
})

it('requires an administrator to opt into country reporting, persists it, and honors the environment veto',async()=>{
 expect((await get('admin')).body).toMatchObject({countryReportingEnabled:false,payload:{countryReporting:false}})
 await post('owner','preferences',{countryReportingEnabled:true,expectedRevision:1}).expect(403)
 await post('admin','preferences',{countryReportingEnabled:'true',expectedRevision:1}).expect(400)
 await post('admin','preferences',{countryReportingEnabled:true,expectedRevision:1}).expect(201)
 const restarted=new InstallationReportingService(fixture.prisma)
 expect(await restarted.status(sessions.admin)).toMatchObject({enabled:true,countryReportingEnabled:true,payload:{countryReporting:true}})
 await restarted.report();expect(JSON.parse(fetched.mock.calls[0][1].body).countryReporting).toBe(true)
 await post('admin','preferences',{countryReportingEnabled:false,expectedRevision:2}).expect(201)
 await restarted.report();expect(JSON.parse(fetched.mock.calls[1][1].body).countryReporting).toBe(false)
 vi.stubEnv('PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED','false')
 await post('admin','preferences',{countryReportingEnabled:true,expectedRevision:3}).expect(400)
 expect((await get('admin')).body.countryReportingEnvironmentDisabled).toBe(true)
 await fixture.prisma.installationReporting.updateMany({data:{countryReportingEnabled:true,nextAttemptAt:null}})
 await restarted.report();expect(JSON.parse(fetched.mock.calls[2][1].body).countryReporting).toBe(false)
})
it('resolves only consented country reports and erases the country on opt-out even inside the hourly throttle',async()=>{
 const lookup=vi.fn(()=> 'NG'),collector=createInstallationCollector(pool,token,6000,{lookup,trustedProxies:new Set(['127.0.0.1'])})
 const report={schemaVersion:1,installationId:id,version:'v0.1.2',deploymentType:'compose',countryReporting:false}
 const send=(value:unknown)=>request(collector).post('/v1/installations').set('X-Real-IP','8.8.8.8').send(value)
 await send(report).expect(202);expect(lookup).not.toHaveBeenCalled()
 await pool.query("UPDATE preflyt_installations SET last_seen=now()-interval '2 hours'")
 await send({...report,countryReporting:true}).expect(202);expect(lookup).toHaveBeenCalledWith('8.8.8.8')
 expect((await pool.query('SELECT country_code FROM preflyt_installations')).rows).toEqual([{country_code:'NG'}])
 const stats=(await request(collector).get('/v1/statistics').set('Authorization','Bearer '+token)).body
 expect(stats.byCountry).toEqual([{countryCode:'NG',installations:1}]);expect(JSON.stringify(stats)).not.toContain('8.8.8.8')
 await send(report).expect(202)
 expect((await pool.query('SELECT country_code FROM preflyt_installations')).rows).toEqual([{country_code:null}])
 // Legacy clients omit the field and never authorize geolocation.
 await pool.query("UPDATE preflyt_installations SET country_code='NG'")
 const {countryReporting,...legacy}=report
 await send(legacy).expect(202)
 expect((await pool.query('SELECT country_code FROM preflyt_installations')).rows[0].country_code).toBeNull()
})
it('does not trust spoofed forwarded IPs, skips private addresses and tolerates unknown or failed lookups',()=>{
 const lookup=vi.fn(()=> 'US')
 const req=(peer:string,header?:string)=>({socket:{remoteAddress:peer},headers:{'x-real-ip':header}} as unknown as IncomingMessage)
 expect(reportCountry(req('::ffff:127.0.0.1','8.8.8.8'),lookup,new Set())).toBeNull();expect(lookup).not.toHaveBeenCalled()
 expect(reportCountry(req('8.8.8.8','1.1.1.1'),lookup,new Set())).toBe('US');expect(lookup).toHaveBeenLastCalledWith('8.8.8.8')
 expect(reportCountry(req('::ffff:127.0.0.1','8.8.8.8'),lookup,trustedProxies('127.0.0.1'))).toBe('US')
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.1','169.254.1.1','100.64.0.1','::1','fc00::1','fe80::1','2001:db8::1','::ffff:192.168.0.1','invalid'])expect(publicAddress(ip)).toBeNull()
 expect(publicAddress('2001:4860:4860::8888')).toBe('2001:4860:4860::8888')
 expect(reportCountry(req('127.0.0.1','8.8.8.8,1.1.1.1'),lookup,trustedProxies('127.0.0.1'))).toBeNull()
 expect(reportCountry(req('8.8.8.8'),()=> 'ZZ',new Set())).toBeNull()
 expect(reportCountry(req('8.8.8.8'),()=>{throw new Error('private IP details')},new Set())).toBeNull()
 expect(()=>trustedProxies('*')).toThrow('exact IP')
})
it('accepts reports with missing country databases without inventing locations',async()=>{
 const collector=createInstallationCollector(pool,token)
 await request(collector).post('/v1/installations').send({schemaVersion:1,installationId:id,version:'v0.1.2',deploymentType:'compose',countryReporting:true}).expect(202)
 expect((await pool.query('SELECT country_code FROM preflyt_installations')).rows[0].country_code).toBeNull()
 await request(collector).post('/v1/installations').send({schemaVersion:1,installationId:id,version:'v0.1.2',deploymentType:'compose',countryReporting:'true'}).expect(422)
 expect((await request(collector).get('/v1/statistics').set('Authorization','Bearer '+token)).body.byCountry).toEqual([])
})

it('uses the real offline MMDB reader without an address cache or external requests',async()=>{
 const lookup=await loadCountryLookup('test/fixtures/country/GeoIP2-Country-Test.mmdb')
 expect(lookup('81.2.69.160')).toBe('GB')
 expect(lookup('2001:218::')).toBe('JP')
 expect(lookup('127.0.0.1')).toBeNull()
 expect(fetched).not.toHaveBeenCalled()
 await expect(loadCountryLookup('test/fixtures/country/missing.mmdb')).rejects.toThrow()
})
