import { HealthGitSourceError } from './health-git-source.js'
import { verifiedHealthCiCoverage } from './health-ci-coverage.js'
import { findingReferenceGuidance } from './finding-guidance.js'
import { overallHealth } from './health-overall.js'
import { healthPolicyContext } from './health-policy-context.js'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { FindingSourceStore } from '../findings/finding-source-store.service.js'
import { queueFindingSources } from '../findings/finding-source-store.js'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import {hotspotDispositionId,hotspotStates,hotspotSummary} from './hotspot-review.js'
import { AuthorizationService, rolePermissions } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { GitHubRateLimitError } from '../github/github-rate-limit.js'
import { GitHubProviderService } from '../github/github-provider.service.js'
import { discoverRepositoryProfile, validProfileBranch } from '../github/repository-profile.js'
import { NativeStatusService } from '../execution/native-status.service.js'
import { buildNativePlan } from '../execution/native-plan.js'
import { HealthScannerClient } from './health-scanner-client.js'
import { healthScannerAuthority, healthScannerPlan } from './health-scanner-package.js'
import type { NativeReceiptExpected } from '../execution/native-receipt.js'
import { verifiedNativeEvidence } from '../execution/native-evidence.js'
import { nativeRequestIntegrity } from '../execution/native-request-integrity.js'
import { digest } from '../assessments/assessment-digest.js'
import { notificationsEnabled } from '../notifications/notification-event.js'
import type { Prisma, RepositoryHealthAssessment } from '../generated/prisma/client.js'
import { healthReport, comparableHealthTrend, healthTimeline, type HealthReport, healthAssessmentResult } from './health-report.js'
import { healthCategories, healthCategoryMetric, selectedHealthAnalyses, type HealthCategory } from './health-categories.js'
const activeStates = ['QUEUED', 'RUNNING']
const json = (value: unknown) => value as Prisma.InputJsonValue
const sessionFor = (row: { actorId: string; organizationId: string }): AuthenticatedSession => ({ authenticated: true, identityId: row.actorId, organizationId: row.organizationId, subject: 'repository-health', email: null, role: 'WORKER' })
const validRetryAt = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const dto = (row: RepositoryHealthAssessment) => ({ overallHealth:overallHealth(row.report as HealthReport|null,row.state), id: row.id, branch: row.branch, state: row.state, sourceSha: row.sourceSha, progress: row.state === 'RUNNING' ? ((row.plan as any)?.stage ?? (row.sourceSha ? 'FETCHING_SOURCE' : 'INSPECTING')) : null, category: (row.plan as any)?.requestedCategory ?? null, includeCoverage: row.includeCoverage, report: row.report ? { ...(row.report as unknown as HealthReport), findings: (row.report as unknown as HealthReport).findings.map(f => ({...f,referenceGuidance:findingReferenceGuidance(f.ruleId)})) } : null, retryAt:validRetryAt((row.plan as any)?.failure?.retryAt), reason: row.reason, cancelled: !!row.cancelledAt, createdAt: row.createdAt, startedAt: row.startedAt, finishedAt: row.finishedAt })
const markSelection = (report: HealthReport, category?: HealthCategory) => {
 if (category) {
  report.selection = category
  report.completeness = 'PARTIAL'
  report.limits.push('Only the selected category ran. Other categories are not part of this assessment; repository-wide readiness remains incomplete.')
 }
 return report
}
@Injectable()
export class RepositoryHealthService {
 constructor(@Inject(PrismaService) private db: PrismaService, @Inject(AuthorizationService) private access: AuthorizationService,
  @Inject(GitHubProviderService) private github: GitHubProviderService, @Inject(NativeStatusService) private runtime: NativeStatusService, @Inject(FindingSourceStore) private sources: FindingSourceStore,
  @Inject(HealthScannerClient) private scanner?: HealthScannerClient) {}
 async start(session: AuthenticatedSession, githubId: string, input: { branch?: string; requestKey?: string; includeCoverage?: boolean; category?: HealthCategory } = {}, initial = false) {
  const repo = await this.access.requireRepository(session, githubId, 'execution.run')
  if(input.includeCoverage !== undefined && typeof input.includeCoverage !== 'boolean') throw new BadRequestException('Coverage requires an explicit boolean choice')
  if (input.category && !healthCategories.includes(input.category)) throw new BadRequestException('Choose a supported Health category')
  if (input.category === 'coverage' || input.includeCoverage === true) throw new BadRequestException('Repository Health does not run tests. Submit test results and coverage from CI.')
  const includeCoverage=false
  const branch = input.branch ?? (await this.db.repositoryHealthTarget.findUnique({ where: { repositoryId: repo.id } }))?.branch ?? repo.defaultBranch
  if (!branch || !validProfileBranch(branch)) throw new BadRequestException('Choose an accessible assessment branch')
  if (!initial && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestKey ?? '')) throw new BadRequestException('Use a valid reassessment request key')
  for (let attempt = 0; attempt < 3; attempt++) try {
   return await this.db.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "GitHubRepository" WHERE "id" = ${repo.id} FOR UPDATE`
    await new AuthorizationService(tx as PrismaService).requireRepository(session, githubId, 'execution.run')
    const old = await tx.repositoryHealthTarget.findUnique({ where: { repositoryId: repo.id } })
    const target = old?.branch === branch ? old : await tx.repositoryHealthTarget.upsert({ where: { repositoryId: repo.id },
     create: { repositoryId: repo.id, organizationId: session.organizationId!, actorId: session.identityId, branch },
     update: { branch, revision: { increment: 1 }, actorId: session.identityId, headSha: null, headCheckedAt: null } })
    const key = initial ? 'initial:' + target.revision : input.requestKey!
    const duplicate = await tx.repositoryHealthAssessment.findUnique({ where: { repositoryId_requestKey: { repositoryId: repo.id, requestKey: key } } })
    if (duplicate) {
     if (duplicate.includeCoverage !== includeCoverage || ((duplicate.plan as any)?.requestedCategory ?? null) !== (input.category ?? null) || duplicate.branch !== branch || duplicate.organizationId !== session.organizationId || (!initial && duplicate.actorId !== session.identityId)) throw new ConflictException('This request key belongs to a different assessment scope')
     return dto(duplicate)
    }
    const pending = await tx.repositoryHealthAssessment.findFirst({ where: { repositoryId: repo.id, branch, state: { in: activeStates }, cancelledAt: null }, orderBy: { createdAt: 'desc' } })
    if (pending) {if(pending.includeCoverage!==includeCoverage || ((pending.plan as any)?.requestedCategory ?? null)!==(input.category??null)) throw new ConflictException('An assessment with a different category is already running');return dto(pending)}
    const count = await tx.repositoryHealthAssessment.count({ where: { repositoryId: repo.id, createdAt: { gte: new Date(Date.now() - 3600000) } } })
    const recent = await tx.repositoryHealthAssessment.findFirst({ where: { repositoryId: repo.id, branch, createdAt: { gte: new Date(Date.now() - 60000) } } })
    if (count >= 10 || (!initial && !input.category && recent)) throw new ConflictException('Wait a minute before reassessing; at most 10 assessments per repository per hour')
    const row = await tx.repositoryHealthAssessment.create({ data: { repositoryId: repo.id, organizationId: session.organizationId!, actorId: session.identityId,
     branch, includeCoverage, plan: input.category ? json({requestedCategory:input.category}) : undefined, targetRevision: target.revision, requestKey: key } })
    await tx.auditEvent.create({ data: { event: 'repository.health.requested', actorId: session.identityId, metadata: { repositoryId: githubId, branch, category: input.category??'all', assessmentId: row.id } } })
    return dto(row)
   }, { isolationLevel: 'Serializable' })
  } catch (error) { if (attempt < 2 && ['P2034', 'P2002'].includes((error as any)?.code)) continue; throw error }
  throw new ConflictException('Assessment admission changed; try again')
 }
 async initial(identityId: string, githubId: string) {
  const repo = await this.db.gitHubRepository.findUniqueOrThrow({ where: { githubId: BigInt(githubId) }, include: { installation: true } })
  return this.start(sessionFor({ actorId: identityId, organizationId: repo.installation.organizationId }), githubId, {}, true)
 }
 async get(session: AuthenticatedSession, githubId: string, id?: string, page = 1, selectedBranch?: string) {
  const repo = await this.access.requireRepository(session, githubId, 'assessment.read')
  if (id && !/^[a-f0-9-]{36}$/.test(id)) throw new BadRequestException('Choose a valid health assessment')
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new BadRequestException('Choose a valid history page')
  if (selectedBranch !== undefined && !validProfileBranch(selectedBranch)) throw new BadRequestException('Choose a valid assessment branch')
  const target = await this.db.repositoryHealthTarget.findUnique({ where: { repositoryId: repo.id } })
  const requestedBranch = selectedBranch ?? target?.branch ?? repo.defaultBranch
  // Browsing another branch is a read, not a change to the shared scan target.
  // Explicit report links retain their own branch unless a branch filter is supplied.
  const reportScope = id
   ? { id, ...(selectedBranch !== undefined ? { branch: selectedBranch } : {}) }
   : { branch: requestedBranch ?? '' }
  const row = await this.db.repositoryHealthAssessment.findFirst({
   where: { repositoryId: repo.id, organizationId: session.organizationId!, ...reportScope },
   orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  const branch = selectedBranch ?? row?.branch ?? requestedBranch
  const checkedAt = target?.branch === branch ? target.headCheckedAt : null
  const recent = checkedAt && Date.now() - checkedAt.getTime() <= 60000
  const head = recent ? target?.headSha : null
  const freshness = row && row.branch === target?.branch && head && row.sourceSha ? head === row.sourceSha ? 'CURRENT' : 'STALE' : 'UNVERIFIED'
  const [history, total] = await Promise.all([
   this.db.repositoryHealthAssessment.findMany({ where: { repositoryId: repo.id, organizationId: session.organizationId!, branch: row?.branch ?? branch ?? '' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, skip: (page - 1) * 10 }),
   this.db.repositoryHealthAssessment.count({ where: { repositoryId: repo.id, organizationId: session.organizationId!, branch: row?.branch ?? branch ?? '' } })])
  // Chart data is independent of the history page and bounded to the latest 30 reports at this revision.
  const timelineRows = row?.report ? await this.db.repositoryHealthAssessment.findMany({
   where: { repositoryId: repo.id, organizationId: session.organizationId!, branch: row.branch, createdAt: { lte: row.createdAt } },
   orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30,
   select: { id: true, state: true, sourceSha: true, finishedAt: true, report: true }
  }) : []
  const timeline = healthTimeline(row?.report as HealthReport | null, timelineRows.map(h => ({ ...h, report: h.report as HealthReport | null })))
  const prior = row && await this.db.repositoryHealthAssessment.findFirst({ where: { repositoryId: repo.id, branch: row.branch, state: 'COMPLETED', createdAt: { lt: row.createdAt } }, orderBy: { createdAt: 'desc' } })
  const hotspotFindings=(row?.report as HealthReport|null)?.findings.filter(f=>f.category==='hotspot')??[]
  const reviews=row && hotspotFindings.length ? await this.db.repositoryHealthHotspotReview.findMany({where:{organizationId:session.organizationId!,repositoryId:repo.id,assessmentId:row.id,sourceSha:row.sourceSha!,id:{in:hotspotFindings.map(f=>hotspotDispositionId(row.id,f.fingerprint))}}}) : []
  const categoryRows = row?.sourceSha ? await this.db.repositoryHealthAssessment.findMany({where:{repositoryId:repo.id,organizationId:session.organizationId!,branch:row.branch,sourceSha:row.sourceSha,state:'COMPLETED'},orderBy:[{createdAt:'desc'},{id:'desc'}],take:40,select:{id:true,finishedAt:true,report:true}}) : []
  const categoryResults = Object.fromEntries(healthCategories.map(category=>{
   const source=categoryRows.find(candidate=>{const report=candidate.report as HealthReport|null;return report?.mode==='EXECUTED' && (!report.selection||report.selection==='all'||report.selection===category) && report.analyses.some(a=>category==='security'?['secrets.scan','security.sast','security.dependencies','iac.policy'].includes(a.id):a.id===({reliability:'quality.reliability',maintainability:'quality.maintainability',duplication:'quality.duplication',coverage:'tests.coverage'} as Record<string,string>)[category])})
   return [category,source?{assessmentId:source.id,finishedAt:source.finishedAt,value:healthCategoryMetric(source.report as HealthReport,category)}:null]
  }))
  await this.access.requireRepository(session, githubId, 'assessment.read')
  const ciCoverage=await verifiedHealthCiCoverage(this.db,repo,row?.sourceSha??null)
  await this.access.requireRepository(session, githubId, 'assessment.read')
  return {ciCoverage, categoryResults, hotspotReview:row?hotspotSummary(row.report as HealthReport|null,reviews,row.id):null, repository: repo.fullName, branch, assessment: row ? dto(row) : null, freshness, checkedAt, history: history.map(h => ({ ...dto(h), report: undefined })), total, page, timeline,
   trend: row?.report ? comparableHealthTrend(row.report as HealthReport, prior?.report as HealthReport | null) : null }
 }
 /** Upstream head verification is separate from loading immutable saved reports. */
 async freshness(session: AuthenticatedSession, githubId: string, id: string) {
  const repo = await this.access.requireRepository(session, githubId, 'assessment.read')
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new BadRequestException('Choose a valid health assessment')
  const [target, row] = await Promise.all([
   this.db.repositoryHealthTarget.findUnique({ where: { repositoryId: repo.id } }),
   this.db.repositoryHealthAssessment.findFirst({ where: { id, repositoryId: repo.id, organizationId: session.organizationId! } })])
  if (!row) throw new NotFoundException('Health assessment is unavailable')
  if (target?.branch !== row.branch) {
   await this.access.requireRepository(session, githubId, 'assessment.read')
   return {assessmentId:row.id,sourceSha:row.sourceSha,branch:row.branch,checkedAt:null,freshness:'UNVERIFIED'}
  }
  let head = target?.headSha ?? null, checkedAt = target?.headCheckedAt ?? null
  if (target && (!checkedAt || Date.now() - checkedAt.getTime() > 60000)) {
   head = await this.github.verifyReadinessBranch(repo.installationId, repo.githubId, target.branch).catch(() => null)
   await this.access.requireRepository(session, githubId, 'assessment.read')
   checkedAt = new Date()
   const changed = await this.db.repositoryHealthTarget.updateMany({ where: { repositoryId: repo.id, revision: target.revision, branch: target.branch }, data: { headSha: head, headCheckedAt: checkedAt } })
   if (!changed.count) { head = null; checkedAt = null }
  }
  await this.access.requireRepository(session, githubId, 'assessment.read')
  return { assessmentId: row.id, sourceSha: row.sourceSha, branch: row.branch, checkedAt,
   freshness: row.branch === target?.branch && head && row.sourceSha ? head === row.sourceSha ? 'CURRENT' : 'STALE' : 'UNVERIFIED' }
 }
 async portfolio(session: AuthenticatedSession, page = 1, query = '', repository?: string, pageSize = 25) {
  await this.access.requireOrganization(session, 'assessment.read')
  if (!Number.isInteger(page) || page < 1 || page > 1000 || query.length > 100 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new BadRequestException('Choose valid health filters')
  if (repository !== undefined && !/^[1-9]\d{0,15}$/.test(repository)) throw new BadRequestException('Choose a valid repository')
  const selected = repository ? await this.access.requireRepository(session, repository, 'assessment.read') : null
  const scope = await this.access.repositoryScope(session.identityId, session.organizationId, 'assessment.read')
  const selectedScope = selected ? scope.filter(r => r.id === selected.id) : scope
  // Scope before reading reports. Large installations get an explicit bounded summary, never invented totals.
  const repos = await this.db.gitHubRepository.findMany({ where: { id: { in: selectedScope.slice(0,1000).map(r => r.id) } }, include: { healthTarget: true,
   healthAssessments: { where: { organizationId: session.organizationId! }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } }, orderBy: { fullName: 'asc' } })
  // Usually the latest report is on the selected branch. Fetch only mismatches
  // with the existing repository/branch index; never blend branches or history.
  const chosenRows = await Promise.all(repos.map(async repo => {
   const branch=repo.healthTarget?.branch??repo.defaultBranch
   const latest=repo.healthAssessments[0]
   return latest?.branch===branch?latest:await this.db.repositoryHealthAssessment.findFirst({where:{repositoryId:repo.id,organizationId:session.organizationId!,branch:branch??''},orderBy:[{createdAt:'desc'},{id:'desc'}]})
  }))
  const items = repos.map((repo,index) => {
   const row = chosenRows[index], report = row?.report as HealthReport | null
   const branch = repo.healthTarget?.branch ?? repo.defaultBranch
   const head = repo.healthTarget?.headSha, checked = repo.healthTarget?.headCheckedAt
   const fresh = row?.branch === branch && row.sourceSha && head && checked && Date.now() - checked.getTime() < 60000
   return { repositoryId: repo.githubId.toString(), name: repo.fullName, branch, id: row?.id ?? null, state: row?.state ?? 'NOT_ASSESSED',
    overallHealth: overallHealth(report,row?.state??'NOT_ASSESSED'), result: healthAssessmentResult(report,row?.state ?? 'NOT_ASSESSED'), completeness: report?.completeness ?? null, mode: report?.mode ?? null, freshness: fresh ? head === row.sourceSha ? 'CURRENT' : 'STALE' : 'UNVERIFIED',
    finishedAt: row?.finishedAt ?? null, findings: report?.analyses.some(a => a.findingsRetained !== undefined) ? report.findings.length : null,
    severity: report?.analyses.some(a => a.findingsRetained !== undefined) ? Object.fromEntries(['critical','high','medium','low','unknown'].map(s => [s, report.findings.filter(f => f.severity === s).length])) : null }
  })
  const visible = items.filter(r => !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.branch?.toLowerCase().includes(query.toLowerCase()))
  const summary = { repositories: items.length, analyzed: items.filter(r => r.mode === 'EXECUTED' && r.findings !== null).length, assessed: items.filter(r => r.state === 'COMPLETED').length, active: items.filter(r => activeStates.includes(r.state)).length,
   incomplete: items.filter(r => r.completeness === 'PARTIAL' || r.state === 'FAILED').length,
   high: items.reduce((n,r) => n + (r.severity?.critical ?? 0) + (r.severity?.high ?? 0),0), notAssessed: items.filter(r => r.state === 'NOT_ASSESSED').length }
  const live = await this.access.repositoryScope(session.identityId, session.organizationId, 'assessment.read')
  if (digest(live.map(r => r.id).sort()) !== digest(scope.map(r => r.id).sort())) throw new ConflictException('Repository access changed; refresh health')
  const statuses = {
   complete: items.filter(r => r.state === 'COMPLETED' && r.completeness === 'COMPLETE').length,
   partial: items.filter(r => r.state === 'COMPLETED' && r.completeness !== 'COMPLETE').length,
   failed: items.filter(r => r.state === 'FAILED').length,
   cancelled: items.filter(r => r.state === 'CANCELLED').length,
  }
  const priorityFindings = repos.flatMap((repo,index) => {
   const row = chosenRows[index], report = row?.report as HealthReport | null
   if (row?.state !== 'COMPLETED' || report?.mode !== 'EXECUTED') return []
   return report.findings.filter(f => ['critical', 'high'].includes(f.severity) && report.analyses.some(a => a.id === f.checkId && a.findingsRetained !== undefined)).map(f => ({
    repositoryId: repo.githubId.toString(), repositoryName: repo.fullName, assessmentId: row.id, branch: row.branch,
    fingerprint: f.fingerprint, title: f.title, severity: f.severity, path: f.path, line: f.line,
    assessedAt: row.finishedAt?.toISOString() ?? null,
   }))
  }).sort((a,b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || a.repositoryName.localeCompare(b.repositoryName) || a.fingerprint.localeCompare(b.fingerprint)).slice(0,5)
  return { summary, statuses, priorityFindings, bounded: selectedScope.length > 1000, items: visible.slice((page-1)*pageSize,page*pageSize), total: visible.length, page }
 }
 async cancel(session: AuthenticatedSession, githubId: string, id: string) {
  const repo = await this.access.requireRepository(session, githubId, 'execution.run')
  await this.db.$transaction(async tx => {
   await new AuthorizationService(tx as PrismaService).requireRepository(session, githubId, 'execution.run')
   const row = await tx.repositoryHealthAssessment.findFirst({ where: { id, repositoryId: repo.id, organizationId: session.organizationId! } })
   if (!row) throw new NotFoundException('Health assessment is unavailable')
   if (!activeStates.includes(row.state)) return
   await tx.repositoryHealthAssessment.updateMany({ where: { id, state: row.state }, data: { cancelledAt: new Date() } })
   if (row.nativeRequestId) {
    await tx.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: 'QUEUED' }, data: { state: 'CANCELLED', cancelledById: session.identityId, reason: 'EXECUTION_CANCELLED', finishedAt: new Date(), leaseUntil: null } })
    await tx.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: { in: ['QUEUED','PREPARING','RUNNING'] } },
    data: { state: 'CANCEL_REQUESTED', cancelledById: session.identityId, reason: 'EXECUTION_CANCELLED', leaseUntil: null } })
   }
  })
  return { cancelled: true }
 }
 async hotspotReview(session: AuthenticatedSession, githubId:string, id:string, fingerprint:string) {
  const repo=await this.access.requireRepository(session,githubId,'assessment.read')
  if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(fingerprint)) throw new BadRequestException('Choose a valid hotspot')
  const row=await this.db.repositoryHealthAssessment.findFirst({where:{id,repositoryId:repo.id,organizationId:session.organizationId!}})
  const finding=(row?.report as HealthReport|null)?.findings.find(f=>f.fingerprint===fingerprint&&f.category==='hotspot')
  if(!row?.sourceSha||!finding) throw new NotFoundException('Hotspot is unavailable in this assessment')
  const saved=await this.db.repositoryHealthHotspotReview.findFirst({where:{id:hotspotDispositionId(id,fingerprint),organizationId:session.organizationId!,repositoryId:repo.id,assessmentId:id,sourceSha:row.sourceSha}})
  const member=await this.access.requireOrganization(session,'assessment.read',true)
  await this.access.requireRepository(session,githubId,'assessment.read')
  return {state:saved?.state??'TO_REVIEW',note:saved?.note??'',revision:saved?.revision??0,updatedAt:saved?.updatedAt??null,updatedById:saved?.updatedById??null,canReview:rolePermissions[member.role]?.includes('findings.manage')??false}
 }
 async saveHotspotReview(session:AuthenticatedSession,githubId:string,id:string,fingerprint:string,input:{state:string;note:string;expectedRevision:number}) {
  await this.access.requireOrganization(session,'findings.manage',true)
  const repo=await this.access.requireRepository(session,githubId,'findings.manage')
  if(!input||!hotspotStates.includes(input.state as any)||typeof input.note!=='string'||input.note.trim().length>1000||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>2147483646||/-----BEGIN|Bearer\s|(?:api[_-]?key|password|secret|token)\s*[:=]/i.test(input.note)) throw new BadRequestException('Choose a review status and a note without credentials')
  if(['SAFE','FIX_REQUIRED'].includes(input.state)&&!input.note.trim()) throw new BadRequestException('Explain the review decision')
  await this.hotspotReview(session,githubId,id,fingerprint)
  return this.db.$transaction(async tx=>{
   const access=new AuthorizationService(tx as PrismaService)
   await access.requireOrganization(session,'findings.manage',true)
   await access.requireRepository(session,githubId,'findings.manage')
   const row=await tx.repositoryHealthAssessment.findFirst({where:{id,repositoryId:repo.id,organizationId:session.organizationId!}})
   if(!row?.sourceSha||(row.report as HealthReport|null)?.findings.some(f=>f.fingerprint===fingerprint&&f.category==='hotspot')!==true) throw new NotFoundException('Hotspot is unavailable')
   const key=hotspotDispositionId(id,fingerprint)
   const data={state:input.state,note:input.note.trim(),updatedById:session.identityId}
   const scope={organizationId:session.organizationId!,repositoryId:repo.id,assessmentId:id,sourceSha:row.sourceSha,fingerprint}
   const changed=input.expectedRevision===0 ? await tx.repositoryHealthHotspotReview.createMany({data:[{id:key,...scope,...data}],skipDuplicates:true}) : await tx.repositoryHealthHotspotReview.updateMany({where:{id:key,...scope,revision:input.expectedRevision},data:{...data,revision:{increment:1}}})
   if(changed.count!==1) throw new ConflictException('Hotspot review changed. Refresh and try again.')
   const saved=await tx.repositoryHealthHotspotReview.findUniqueOrThrow({where:{id:key}})
   await tx.auditEvent.create({data:{event:'repository.health.hotspot_reviewed',actorId:session.identityId,metadata:{repositoryId:githubId,assessmentId:id,sourceSha:row.sourceSha,fingerprint,state:saved.state,revision:saved.revision,noteHash:digest(saved.note)}}})
   return {state:saved.state,note:saved.note,revision:saved.revision,updatedAt:saved.updatedAt,updatedById:saved.updatedById,canReview:true}
  })
 }
 async source(session: AuthenticatedSession, githubId: string, id: string, fingerprint: string) {
  const repo = await this.access.requireRepository(session, githubId, 'assessment.read')
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new BadRequestException('Choose a valid finding')
  const row = await this.db.repositoryHealthAssessment.findFirst({ where: { id, repositoryId: repo.id, organizationId: session.organizationId! } })
  const finding = (row?.report as HealthReport | null)?.findings.find(f => f.fingerprint === fingerprint)
  if (!row?.sourceSha || !finding) throw new NotFoundException('Finding is unavailable')
  const base = { path: finding.path, line: finding.line, endLine: finding.endLine ?? finding.line, sourceSha: row.sourceSha, lines: [] as Array<{ number: number; text: string }>, reason: null as string | null }
  if (!finding.path || !finding.line) return { ...base, reason: 'The analyzer did not provide an exact source location' }
  const excerpt = await this.sources.read(repo.id, row.sourceSha, finding, 5)
  await this.access.requireRepository(session, githubId, 'assessment.read')
  return { ...base, ...excerpt }

 }
 /** Durable inbox recovery. BullMQ transports IDs only; PostgreSQL owns immutable job scope. */
 async pending() {
  return this.db.repositoryHealthAssessment.findMany({ where: { state: { in: activeStates }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 20 })
 }
 async process(id: string) {
  const token = randomUUID(), now = new Date()
  const claimed = await this.db.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('preflyt-health-admission'))`
   const row = await tx.repositoryHealthAssessment.findUnique({ where: { id } })
   if (!row || !activeStates.includes(row.state) || row.leaseUntil && row.leaseUntil > now) return null
   if (row.state === 'QUEUED') {
    const running = await tx.repositoryHealthAssessment.findMany({ where: { state: 'RUNNING' }, select: { organizationId: true }, take: 3 })
    if (running.length >= 2 || running.some(r => r.organizationId === row.organizationId)) return null
   }
   const changed = await tx.repositoryHealthAssessment.updateMany({ where: { id, state: row.state, leaseUntil: row.leaseUntil },
    data: { state: 'RUNNING', startedAt: row.startedAt ?? now, leaseToken: token, leaseUntil: new Date(Date.now()+120000), attempts: { increment: 1 } } })
   return changed.count ? tx.repositoryHealthAssessment.findUniqueOrThrow({ where: { id } }) : null
  })
  if (!claimed) return
  let row = claimed
  const session = sessionFor(row)
  try {
   const repo = await this.access.requireRepository(session, (await this.db.gitHubRepository.findUniqueOrThrow({ where: { id: row.repositoryId } })).githubId.toString(), 'execution.run')
   if (row.cancelledAt) {
    if ((row.plan as any)?.kind==='AUTOMATIC_HEALTH' && (row.plan as any)?.expected) { await this.automaticScan(row,token,session,repo); return }
    const native = row.nativeRequestId ? await this.db.nativeExecutionRequest.findUnique({ where: { id: row.nativeRequestId } }) : null
    if (native && ['QUEUED','PREPARING','RUNNING','CANCEL_REQUESTED'].includes(native.state)) { await this.defer(id,token); return }
    await this.finish(row,token,'CANCELLED',null,'EXECUTION_CANCELLED'); return
   }
   const legacyPlan=row.plan as any
   if(legacyPlan?.requestedCategory==='coverage'||legacyPlan?.ruleIds?.includes('tests.coverage')||legacyPlan?.steps?.some((step:any)=>step.ruleId==='tests.coverage')){
    await this.finish(row,token,'FAILED',row.report as HealthReport|null,'HEALTH_TEST_EXECUTION_REMOVED');return
   }
   if (!row.sourceSha) {
    const snapshot = await this.github.readRepositorySnapshot(repo.installationId, repo.githubId, row.branch)
    await this.access.requireRepository(session, repo.githubId.toString(), 'execution.run')
    const requestedCategory=(row.plan as any)?.requestedCategory as HealthCategory|undefined
    const profile = discoverRepositoryProfile(snapshot), analyses = selectedHealthAnalyses(snapshot,requestedCategory)
    const plan = this.scanner ? { kind:'AUTOMATIC_HEALTH', stage:'FETCHING_SOURCE', planHash:'automatic-health-v1', requestedCategory, ruleIds:analyses.map(a=>a.id), steps:[] as Array<{ruleId:string;reason:string}> } : buildNativePlan({ organizationId: row.organizationId, repositoryId: repo.githubId.toString(), sourceSha: snapshot.sourceSha,
     selectionId: 'health:' + row.id, rules: analyses.map(a => ({ id: a.id, title: a.title, required: false, capability: 'execution' })) })
    if (requestedCategory && !analyses.length) throw new Error('NO_APPLICABLE_ANALYSIS')
    const { planHash, ...frozenPlan } = plan
    if(requestedCategory) (frozenPlan as any).requestedCategory=requestedCategory
    const inspection = { complete: snapshot.complete && profile.complete, fileCount: snapshot.files.length, languages: profile.signals.find(s => s.id === 'languages')?.observations ?? [] }
    const report = markSelection(healthReport(inspection, analyses.map(a => ({ id: a.id, title: a.title, state: 'UNAVAILABLE', reason: this.scanner?'SCANNER_PENDING':plan.steps.find(s => s.ruleId === a.id)?.reason ?? 'ADAPTER_UNAVAILABLE' }))),requestedCategory)
    report.policyContext = await healthPolicyContext(this.db, repo.id, row.organizationId, snapshot.sourceSha, row.branch)
    await this.db.$transaction(async tx => {
     const updated = await tx.repositoryHealthAssessment.updateMany({ where: { id, leaseToken: token, state: 'RUNNING', cancelledAt: null, sourceSha: null }, data: { sourceSha: snapshot.sourceSha, plan: json(frozenPlan), report: json(report) } })
     if (!updated.count) throw new ConflictException('Health attempt changed')
     const saved = await tx.repositoryProfile.create({ data: { repositoryId: repo.id, sourceSha: snapshot.sourceSha, treeSha: snapshot.treeSha, branch: snapshot.branch, fullName: snapshot.fullName, version: profile.version, complete: profile.complete, report: json(profile) } })
     await tx.repositoryHealthAssessment.update({ where: { id }, data: { profileId: saved.id } })
     await tx.repositoryHealthTarget.updateMany({ where: { repositoryId: repo.id, revision: row.targetRevision, branch: row.branch }, data: { headSha: snapshot.sourceSha, headCheckedAt: new Date() } })
    })
    row = await this.db.repositoryHealthAssessment.findUniqueOrThrow({ where: { id } })
   }
   if ((row.plan as any)?.kind === 'AUTOMATIC_HEALTH') {
    await this.automaticScan(row, token, session, repo)
    return
   }
   if (Date.now() - row.startedAt!.getTime() > 2100000) {
    if (row.nativeRequestId) {
     await this.db.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: 'QUEUED' }, data: { state: 'TIMED_OUT', reason: 'EXECUTION_UNAVAILABLE', finishedAt: new Date(), leaseUntil: null } })
     await this.db.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: { in: ['PREPARING','RUNNING'] } }, data: { state: 'CANCEL_REQUESTED', reason: 'EXECUTION_INTERRUPTED', leaseUntil: null } })
     const outstanding = await this.db.nativeExecutionRequest.findUniqueOrThrow({ where: { id: row.nativeRequestId } })
     if (['PREPARING','RUNNING','CANCEL_REQUESTED'].includes(outstanding.state)) { await this.defer(id,token); return }
    }
    await this.finish(row,token,'FAILED',row.report as HealthReport,'ASSESSMENT_TIMED_OUT'); return
   }
   if (!row.nativeRequestId) {
    const status = await this.runtime.status(session, repo.githubId.toString()), plan = row.plan as any
    const runnable = plan.steps.filter((s: any) => s.adapterId).map((s: any) => s.ruleId).sort()
    if (!status.executionAvailable || !runnable.length) {
     const report = row.report as HealthReport
     const next = markSelection(healthReport(report.inspection, report.analyses.map(a => ({ ...a, reason: a.reason==='SUPPORTED_TESTS_REQUIRED' ? a.reason : !status.executionAvailable ? status.reason : a.reason }))),report.selection==='all'?undefined:report.selection)
     next.policyContext = report.policyContext
     await this.finish(row,token,'COMPLETED',next,!status.executionAvailable ? status.reason : 'TOOL_REVIEW_REQUIRED'); return
    }
    const requestKey = randomUUID(), nativeId = randomUUID(), planHash = digest(plan), sourceSha = row.sourceSha!, selectionId = 'health:' + row.id
    const inputHash = digest({ organizationId: row.organizationId, repositoryId: repo.githubId.toString(), actorId: row.actorId,
     input: { requestKey, expectedSourceSha: sourceSha, expectedSelectionId: selectionId, expectedPlanHash: planHash, ruleIds: runnable } })
    await this.access.requireRepository(session, repo.githubId.toString(), 'execution.run')
    await this.db.$transaction(async tx => {
     await new AuthorizationService(tx as PrismaService).requireRepository(session, repo.githubId.toString(), 'execution.run')
     const live = await tx.repositoryHealthAssessment.findUniqueOrThrow({ where: { id } })
     if (live.leaseToken !== token || live.cancelledAt || live.nativeRequestId) throw new ConflictException('Health attempt changed')
     await tx.nativeExecutionRequest.create({ data: { id: nativeId, healthAssessmentId: id, organizationId: row.organizationId, repositoryId: repo.id,
      repositoryGithubId: repo.githubId.toString(), actorId: row.actorId, requestKey, inputHash, sourceSha, selectionId, planHash, plan: json(plan), ruleIds: runnable, state: 'QUEUED' } })
     await tx.repositoryHealthAssessment.update({ where: { id }, data: { nativeRequestId: nativeId, leaseToken: null, leaseUntil: new Date(Date.now()+5000) } })
    }); return
   }
   const native = await this.db.nativeExecutionRequest.findUniqueOrThrow({ where: { id: row.nativeRequestId } })
   if (['QUEUED','PREPARING','RUNNING','CANCEL_REQUESTED'].includes(native.state)) { await this.defer(id,token); return }
   const receipt = nativeRequestIntegrity(native) ? verifiedNativeEvidence(native) : null
   const initial = row.report as HealthReport
   const report = markSelection(healthReport(initial.inspection, initial.analyses, receipt?.checks ?? [], digest({ version: 1, plan: (row.plan as any)?.toolReviewHash, scope: initial.analyses.map(a => a.id) })),initial.selection==='all'?undefined:initial.selection)
   report.policyContext = initial.policyContext
   if (!receipt) report.analyses = report.analyses.map(a => ({ ...a, state: 'UNAVAILABLE', reason: a.reason==='SUPPORTED_TESTS_REQUIRED' ? a.reason : native.reason ?? 'RECEIPT_UNVERIFIED' }))
   await this.finish(row,token,receipt && !receipt.cancelled && receipt.checks.every(c => c.cleanupConfirmed && c.state !== 'INCOMPLETE') ? 'COMPLETED' : 'FAILED', report, receipt ? null : native.reason ?? 'RECEIPT_UNVERIFIED')
  } catch (error) {
   if (this.scanner && (row.plan as any)?.kind==='AUTOMATIC_HEALTH' && (row.plan as any)?.expected) {
    // Access revocation also stops the exact admitted job; never fetch more source.
    try {
     const stopped=await this.scanner.call('cancel',(row.plan as any).expected)
     if(stopped.state!=='COMPLETE'||!stopped.cleanupConfirmed){await this.defer(id,token);return}
    } catch {await this.defer(id,token);return}
   }
   // No source/log/provider message is exposed. Admitted jobs remain tracked until cleanup is acknowledged.
   if (row.nativeRequestId) {
    await this.db.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: 'QUEUED' }, data: { state: 'CANCELLED', reason: 'EXECUTION_INTERRUPTED', finishedAt: new Date(), leaseUntil: null } })
    await this.db.nativeExecutionRequest.updateMany({ where: { id: row.nativeRequestId, state: { in: ['PREPARING','RUNNING'] } }, data: { state: 'CANCEL_REQUESTED', reason: 'EXECUTION_INTERRUPTED', leaseUntil: null } })
    const native = await this.db.nativeExecutionRequest.findUnique({ where: { id: row.nativeRequestId } })
    if (native && ['QUEUED','PREPARING','RUNNING','CANCEL_REQUESTED'].includes(native.state)) { await this.defer(id,token); return }
   }
   await this.finish(row,token,'FAILED',row.report as HealthReport | null, error instanceof GitHubRateLimitError ? 'GITHUB_RATE_LIMITED' : (error as Error)?.message === 'NO_APPLICABLE_ANALYSIS' ? 'NO_APPLICABLE_ANALYSIS' : (error as any)?.status === 403 ? 'ACCESS_REVOKED' : 'SOURCE_OR_ANALYSIS_UNAVAILABLE', error instanceof GitHubRateLimitError ? validRetryAt((error.getResponse() as any)?.retryAt) : null)
  }
 }
 private async automaticScan(row: any, token: string, session: AuthenticatedSession, repo: any) {
  if (!this.scanner) throw new Error('Scanner client unavailable')
  const saved=row.plan as any
  let preparingSource=false
  try {
   let pkg=saved.package??await this.scanner.package(row.organizationId)
   let expected=saved.expected as NativeReceiptExpected|undefined
   let source: Awaited<ReturnType<GitHubProviderService['readHealthScanSource']>>|undefined
   if (!expected) {
    // The export is bounded but can take longer than an ordinary worker lease.
    await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token,cancelledAt:null},data:{leaseUntil:new Date(Date.now()+12*60000)}})
    preparingSource=true
    console.info(JSON.stringify({event:'health.worker.fetching_source',assessmentId:row.id}))
    source=await this.github.readHealthScanSource(repo.installationId,repo.githubId,row.sourceSha,AbortSignal.timeout(600000),false)
    await this.access.requireRepository(session,repo.githubId.toString(),'execution.run')
    preparingSource=false
    pkg=await this.scanner.package(row.organizationId)
    const {planHash,...plan}=healthScannerPlan(pkg,{organizationId:row.organizationId,repositoryId:repo.githubId.toString(),sourceSha:row.sourceSha,selectionId:'health:'+row.id,ruleIds:saved.ruleIds})
    const rules=plan.steps.filter(step=>'adapterId' in step).map(step=>step.ruleId)
    if (!rules.length) throw new Error('No applicable scanner images available')
    expected={requestId:row.id,attemptId:row.id,organizationId:row.organizationId,repositoryId:repo.githubId.toString(),sourceSha:row.sourceSha,sourceHash:source.source.sourceHash,selectionId:'health:'+row.id,planHash,plan,ruleIds:rules,approvalHash:healthScannerAuthority(pkg,row.organizationId).reviewed.approvalHash}
    const changed=await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token,cancelledAt:null},data:{plan:json({...saved,package:pkg,expected,stage:'WAITING_SCANNER',excludedFiles:source.excludedFiles,originalTreeSha:source.originalTreeSha})}})
    if (!changed.count) throw new Error('Health attempt changed')
    row=await this.db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
   }
   let result=await this.scanner.call('status',expected)
   if (result.state==='NOT_FOUND' && (row.cancelledAt || Date.now()-row.startedAt.getTime()>3600000)) {await this.finish(row,token,row.cancelledAt?'CANCELLED':'FAILED',row.cancelledAt?null:row.report as HealthReport,row.cancelledAt?'EXECUTION_CANCELLED':'ASSESSMENT_TIMED_OUT');return}
   if (result.state==='NOT_FOUND') {
    pkg=await this.scanner.package(row.organizationId)
    if(expected.approvalHash!==healthScannerAuthority(pkg,row.organizationId).reviewed.approvalHash){
     const {planHash,...plan}=healthScannerPlan(pkg,{organizationId:row.organizationId,repositoryId:repo.githubId.toString(),sourceSha:row.sourceSha,selectionId:expected.selectionId,ruleIds:saved.ruleIds})
     expected={...expected,planHash,plan,ruleIds:plan.steps.filter(step=>'adapterId' in step).map(step=>step.ruleId),approvalHash:healthScannerAuthority(pkg,row.organizationId).reviewed.approvalHash}
     const updated=await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token,cancelledAt:null},data:{plan:json({...row.plan as any,expected,package:pkg})}})
     if(!updated.count)throw new Error('Health scope changed')
     row=await this.db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
    }
    await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token,cancelledAt:null},data:{leaseUntil:new Date(Date.now()+12*60000)}})
    source ??= await this.github.readHealthScanSource(repo.installationId,repo.githubId,row.sourceSha,AbortSignal.timeout(600000),false)
    await this.access.requireRepository(session,repo.githubId.toString(),'execution.run')
    const live=await this.db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
    if (live.cancelledAt || live.leaseToken!==token || source.source.sourceHash!==expected.sourceHash) throw new Error('Health scope changed')
    result=await this.scanner.call('admit',expected,source.source)
   }
   const live=await this.db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
   if ((live.cancelledAt || Date.now()-row.startedAt.getTime()>3600000) && result.state!=='COMPLETE') result=await this.scanner.call('cancel',expected)
   if (result.state!=='COMPLETE') {
    await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token},data:{plan:json({...row.plan as any,stage:result.state==='RUNNING'?'SCANNING':'WAITING_SCANNER'})}})
    await this.defer(row.id,token);return
   }
   await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token},data:{plan:json({...row.plan as any,stage:'VERIFYING_RESULTS'})}})
   const receipt=this.scanner.verify((row.plan as any).package??pkg,expected,result.signature)
   if (!receipt) {
    if(result.cleanupConfirmed) {await this.finish(row,token,'FAILED',row.report as HealthReport,'SCANNER_RESULT_UNVERIFIED');return}
    throw new Error('Scanner result could not be verified')
   }
   await this.access.requireRepository(session,repo.githubId.toString(),'execution.run')
   const initial=row.report as HealthReport, excluded=(row.plan as any).excludedFiles??0
   const report=markSelection(healthReport({...initial.inspection,complete:initial.inspection.complete&&excluded===0},initial.analyses.map(a=>a.id==='tests.coverage'&&!expected.ruleIds.includes('tests.coverage')?{...a,state:'UNAVAILABLE' as const,reason:'TEST_ENVIRONMENT_UNAVAILABLE'}:a),receipt.checks,digest({kind:'automatic-health-v1',tools:receipt.toolReviewHash,scope:initial.analyses.map(a=>a.id)})),initial.selection==='all'?undefined:initial.selection)
   report.policyContext=initial.policyContext
   if(excluded)report.limits.push(`${excluded} binary, oversized, generated or linked files were excluded from the scanned source scope. Findings and metrics apply to retained files only.`)
   await this.finish(row,token,receipt.cancelled?'CANCELLED':receipt.checks.some(c=>!c.cleanupConfirmed)?'FAILED':'COMPLETED',report,receipt.cancelled?'EXECUTION_CANCELLED':null)
  } catch (error) {
   // An uncertain admit/status response cannot abandon an owned scanner job.
   const current=await this.db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
   if ((current.plan as any)?.expected) {
    await this.db.repositoryHealthAssessment.updateMany({where:{id:row.id,leaseToken:token},data:{plan:json({...current.plan as any,stage:'RECONNECTING_SCANNER'})}})
    await this.defer(row.id,token);return
   }
   const response=(error as any)?.getResponse?.()
   const reason=error instanceof HealthGitSourceError?error.code:(error as any)?.status===403?'ACCESS_REVOKED':response?.code==='GITHUB_RATE_LIMITED'?'GITHUB_RATE_LIMITED':preparingSource?'SOURCE_ACCESS_UNAVAILABLE':'SCANNER_UNAVAILABLE'
   const report=row.report as HealthReport
   const next=markSelection(healthReport(report.inspection,report.analyses.map(a=>({...a,reason}))),report.selection==='all'?undefined:report.selection)
   next.policyContext=report.policyContext
   await this.finish(row,token,'FAILED',next,reason,reason==='GITHUB_RATE_LIMITED'?validRetryAt(response?.retryAt):null)
  }
 }
 private async defer(id: string, token: string) {
  await this.db.repositoryHealthAssessment.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: new Date(Date.now()+5000) } })
 }
 private async finish(row: RepositoryHealthAssessment, token: string, state: string, report: HealthReport | null, reason: string | null, retryAt: string | null = null) {
  await this.db.$transaction(async tx => {
   const changed = await tx.repositoryHealthAssessment.updateMany({ where: { id: row.id, state: 'RUNNING', leaseToken: token, cancelledAt: row.cancelledAt },
    data: { state, ...(report ? { report: json(report) } : {}), ...(state==='FAILED'&&validRetryAt(retryAt)?{plan:json({...row.plan as any,failure:{retryAt:validRetryAt(retryAt)}})}:{}), reason, finishedAt: new Date(), leaseToken: null, leaseUntil: null } })
   if (!changed.count) {
    await tx.repositoryHealthAssessment.updateMany({ where: { id: row.id, state: 'RUNNING', leaseToken: token }, data: { leaseToken: null, leaseUntil: new Date(Date.now()+5000) } })
    return
   }
   if (row.sourceSha && report?.findings.length) await queueFindingSources(tx, row.repositoryId, row.sourceSha, report.findings, 5)
   await tx.auditEvent.create({ data: { event: 'repository.health.finished', actorId: row.actorId, metadata: { assessmentId: row.id, state, reason, sourceSha: row.sourceSha } } })
   if (!notificationsEnabled() || state === 'CANCELLED') return
   const repo = await tx.gitHubRepository.findUniqueOrThrow({ where: { id: row.repositoryId } })
   const type = state === 'FAILED' ? 'HEALTH_ASSESSMENT_FAILED' : report?.completeness === 'COMPLETE' ? 'HEALTH_ASSESSMENT_COMPLETED' : 'HEALTH_ASSESSMENT_PARTIAL'
   await tx.notificationEvent.createMany({ data: [{ healthAssessmentId: row.id, branchRef: row.branch, organizationId: row.organizationId,
    repositoryId: row.repositoryId, repositoryGithubId: repo.githubId.toString(), repositoryName: repo.fullName, sourceSha: row.sourceSha, actorId: row.actorId, type,
    severity: state === 'FAILED' ? 'error' : report?.completeness === 'PARTIAL' ? 'warning' : 'info' }], skipDuplicates: true })
  })
 }
}
