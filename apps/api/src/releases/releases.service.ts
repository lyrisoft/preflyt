import { BadRequestException, ForbiddenException, Inject, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { compareVersions, parseReleases, versionParts, type ReleaseNote } from './release-policy.js'
const interval=60*60*1000
@Injectable()
export class ReleasesService implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(AuthorizationService) private readonly access:AuthorizationService){}
 onModuleInit(){ this.timer=setInterval(()=>{void this.check(false).catch(()=>{})},60000);this.timer.unref();void this.check(false).catch(()=>{}) }
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 private async state(){return this.db.releaseCheck.upsert({where:{id:'preflyt'},create:{id:'preflyt'},update:{}})}
 private async administrator(session:AuthenticatedSession){
  if(session.platformAdmin)return
  const member=await this.access.requireOrganization(session,'assessment.read',true)
  if(!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('An administrator is required to check for updates.')
 }
 async status(session:AuthenticatedSession){
  const saved=await this.state()
  const seen=await this.db.releaseRead.findUnique({where:{identityId:session.identityId}})
  const notes=(saved.payload as unknown as ReleaseNote[]).filter(n=>saved.prereleases||!n.prerelease)
  const latest=notes.find(n=>n.ready)??null
  const installed=process.env.PREFLYT_BUILD_VERSION??'development', sha=process.env.PREFLYT_BUILD_SHA??null
  return {installed,sha,development:!versionParts(installed),latest,notes,checkedAt:saved.checkedAt,error:saved.error,
   enabled:saved.enabled,prereleases:saved.prereleases,revision:saved.revision,
   nextCheckAt: saved.leaseUntil && (!saved.retryAt || saved.leaseUntil > saved.retryAt) ? saved.leaseUntil : saved.retryAt,
   updateAvailable:!!latest&&!!versionParts(installed)&&compareVersions(latest.tag,installed)>0,
   unread:!!notes[0]&&seen?.tag!==notes[0].tag,
   canCheck:!!session.platformAdmin||['OWNER','ADMIN'].includes(session.role),canConfigure:!!session.platformAdmin}
 }
 async check(manual:boolean,freshness=interval){
  const saved=await this.state(),now=new Date()
  if(!manual&&!saved.enabled)return
  if(saved.retryAt&&saved.retryAt>now)return
  if(!manual&&saved.checkedAt&&now.getTime()-saved.checkedAt.getTime()<freshness)return
  const leased=await this.db.releaseCheck.updateMany({where:{id:'preflyt',...(!manual?{enabled:true}:{}),AND:[{OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},{OR:[{retryAt:null},{retryAt:{lte:now}}]}]},data:{leaseUntil:new Date(now.getTime()+30000),retryAt:new Date(now.getTime()+60000)}})
  if(!leased.count)return
  try {
   const response=await fetch('https://api.github.com/repos/lyrisoft/preflyt/releases?per_page=30',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json','User-Agent':'Preflyt-release-checker','X-GitHub-Api-Version':'2022-11-28',...(saved.etag?{'If-None-Match':saved.etag}:{})}})
   if(response.status===304){await this.db.releaseCheck.update({where:{id:'preflyt'},data:{checkedAt:now,error:null}});return}
   if(!response.ok)throw new Error('Release service unavailable')
   const reader=response.body?.getReader();if(!reader)throw new Error('Missing response')
   const chunks:Uint8Array[]=[];let size=0
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw new Error('Response too large')}chunks.push(value)}
   const notes=parseReleases(JSON.parse(Buffer.concat(chunks).toString('utf8')))
   await this.db.releaseCheck.update({where:{id:'preflyt'},data:{payload:notes,etag:response.headers.get('etag'),checkedAt:now,error:null}})
  }catch{await this.db.releaseCheck.update({where:{id:'preflyt'},data:{error:'Could not check GitHub releases. Last saved release information is shown.',retryAt:new Date(now.getTime()+60*60*1000)}})}
  finally{await this.db.releaseCheck.update({where:{id:'preflyt'},data:{leaseUntil:null}})}
 }
 async refresh(session:AuthenticatedSession,automatic=false){await this.administrator(session);await this.check(!automatic,automatic?5*60*1000:interval);return this.status(session)}
 async settings(session:AuthenticatedSession,input:any){
  if(!session.platformAdmin)throw new ForbiddenException('Deployment administrator required')
  if(typeof input?.enabled!=='boolean'||typeof input?.prereleases!=='boolean'||!Number.isSafeInteger(input?.revision))throw new BadRequestException('Choose valid update preferences')
  await this.state()
  return this.db.$transaction(async tx=>{
   const changed=await tx.releaseCheck.updateMany({where:{id:'preflyt',revision:input.revision},data:{enabled:input.enabled,prereleases:input.prereleases,revision:{increment:1}}})
   if(!changed.count)throw new BadRequestException('Update preferences changed. Refresh and try again.')
   await tx.auditEvent.create({data:{actorId:session.identityId,event:'releases.preferences_updated',metadata:{enabled:input.enabled,prereleases:input.prereleases}}})
   return {saved:true}
  })
 }
 async read(session:AuthenticatedSession,tag:unknown){
  const saved=await this.state();if(typeof tag!=='string'||!(saved.payload as unknown as ReleaseNote[]).some(n=>n.tag===tag))throw new BadRequestException('Choose a published release')
  await this.db.releaseRead.upsert({where:{identityId:session.identityId},create:{identityId:session.identityId,tag},update:{tag}})
  return {read:true}
 }
}
