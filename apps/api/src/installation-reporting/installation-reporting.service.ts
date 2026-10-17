import {randomUUID} from 'node:crypto'
import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common'
import {PrismaService} from '../prisma/prisma.service.js'
import type {AuthenticatedSession} from '../auth/session.guard.js'
import {reportEndpoint,reportPayload,validReport} from './reporting-policy.js'
const day=24*60*60*1000
@Injectable()
export class InstallationReportingService implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>
 private active?:AbortController
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 onModuleInit(){this.timer=setInterval(()=>{void this.report().catch(()=>{})},60000);this.timer.unref();void this.report().catch(()=>{})}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);this.active?.abort()}
 private async state(){
  // Use INSERT ON CONFLICT so first-start replicas cannot race a read-then-create upsert.
  await this.db.installationReporting.createMany({data:{id:'preflyt',installationId:randomUUID()},skipDuplicates:true})
  return this.db.installationReporting.findUniqueOrThrow({where:{id:'preflyt'}})
 }
 private administrator(session:AuthenticatedSession){if(!session.platformAdmin)throw new ForbiddenException('Deployment administrator required')}
 async status(session:AuthenticatedSession){
  this.administrator(session)
  const saved=await this.state(),endpoint=reportEndpoint(),environmentDisabled=process.env.PREFLYT_INSTALLATION_REPORTING_ENABLED==='false'
  return {countryReportingEnabled:saved.countryReportingEnabled&&process.env.PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED!=='false',countryReportingEnvironmentDisabled:process.env.PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED==='false',enabled:saved.enabled&&!environmentDisabled,environmentDisabled,revision:saved.revision,acknowledged:!!saved.acknowledgedAt,
   destination:endpoint?new URL(endpoint).origin:null,configured:!!endpoint,lastReportedAt:saved.lastReportedAt,nextAttemptAt:saved.nextAttemptAt,error:saved.error,
   payload:reportPayload(saved.installationId,process.env,saved.countryReportingEnabled)}
 }
 async preferences(session:AuthenticatedSession,input:unknown){
  this.administrator(session)
  const data=input as {enabled?:unknown;countryReportingEnabled?:unknown;expectedRevision?:unknown}
  if(!data||(typeof data.enabled!=='boolean'&&typeof data.countryReportingEnabled!=='boolean')||(data.enabled!==undefined&&typeof data.enabled!=='boolean')||(data.countryReportingEnabled!==undefined&&typeof data.countryReportingEnabled!=='boolean')||!Number.isSafeInteger(data.expectedRevision))throw new BadRequestException('Choose valid installation reporting preferences')
  if(process.env.PREFLYT_INSTALLATION_REPORTING_ENABLED==='false'&&data.enabled)throw new BadRequestException('Reporting is disabled by the environment setting')
  if(process.env.PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED==='false'&&data.countryReportingEnabled===true)throw new BadRequestException('Country reporting is disabled by the environment setting')
  await this.state()
  const preferences={...(typeof data.enabled==='boolean'?{enabled:data.enabled}:{}),...(typeof data.countryReportingEnabled==='boolean'?{countryReportingEnabled:data.countryReportingEnabled}:{})}
  await this.db.$transaction(async tx=>{
   const updated=await tx.installationReporting.updateMany({where:{id:'preflyt',revision:data.expectedRevision as number},data:{...preferences,revision:{increment:1},acknowledgedAt:new Date(),nextAttemptAt:null}})
   if(!updated.count)throw new ConflictException('Reporting preferences changed. Refresh and try again.')
   await tx.auditEvent.create({data:{actorId:session.identityId,event:'installation_reporting.preferences_updated',metadata:{...preferences,revision:(data.expectedRevision as number)+1}}})
  })
  if(data.enabled===false||data.countryReportingEnabled===false)this.active?.abort()
  return this.status(session)
 }
 async acknowledge(session:AuthenticatedSession){this.administrator(session);await this.state();await this.db.installationReporting.update({where:{id:'preflyt'},data:{acknowledgedAt:new Date()}});return {acknowledged:true}}
 async report(){
  // Do not queue a hidden first report when no destination exists or the environment has opted out.
  if(process.env.PREFLYT_INSTALLATION_REPORTING_ENABLED==='false')return
  const endpoint=reportEndpoint();if(!endpoint)return
  const saved=await this.state(),now=new Date()
  if(!saved.enabled||(saved.nextAttemptAt&&saved.nextAttemptAt>now))return
  const token=randomUUID()
  const lease=await this.db.installationReporting.updateMany({where:{id:'preflyt',enabled:true,AND:[{OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},{OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now}}]}]},data:{leaseToken:token,leaseUntil:new Date(now.getTime()+30000)}})
  if(!lease.count)return
  const controller=new AbortController();this.active=controller
  const timeout=setTimeout(()=>controller.abort(),8000);timeout.unref()
  try{
   const current=await this.db.installationReporting.findUniqueOrThrow({where:{id:'preflyt'}})
   if(!current.enabled||current.leaseToken!==token)return
   const payload=reportPayload(current.installationId,process.env,current.countryReportingEnabled)
   if(!validReport(payload))throw new Error('Unsupported report metadata')
   const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','User-Agent':'Preflyt-installation-reporting/1'},body:JSON.stringify(payload)})
   await response.body?.cancel()
   if(response.status!==202)throw new Error('Report not accepted')
   await this.db.installationReporting.updateMany({where:{id:'preflyt',leaseToken:token},data:{lastReportedAt:now,nextAttemptAt:new Date(now.getTime()+day+Math.floor(Math.random()*15*60*1000)),failureCount:0,error:null}})
  }catch{
   const delay=Math.min(60*60*1000,60000*2**Math.min(saved.failureCount,6))
   await this.db.installationReporting.updateMany({where:{id:'preflyt',leaseToken:token,enabled:true},data:{failureCount:{increment:1},nextAttemptAt:new Date(Date.now()+delay),error:'Installation report could not be delivered. Preflyt continues to work; delivery will retry.'}})
  }finally{
   clearTimeout(timeout);if(this.active===controller)this.active=undefined
   await this.db.installationReporting.updateMany({where:{id:'preflyt',leaseToken:token},data:{leaseToken:null,leaseUntil:null}})
  }
 }
}
