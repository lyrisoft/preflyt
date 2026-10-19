import { findingIgnoreId, ignoreState, validateIgnore } from './finding-ignore.js';
import { FindingIndex } from './finding-index.js';
import { FindingReadCache } from './finding-read-cache.js';
import { Prisma } from '../generated/prisma/client.js';
import { reportedLocation } from './reported-location.js';
import { readPageSize } from '../pagination.js';
import { findingReferenceGuidance } from '../health/finding-guidance.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  rolePermissions,
  AuthorizationService,
} from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { digest } from "../assessments/assessment-digest.js";
import { previewGate } from "../assessments/gate-preview.js";
import { normalizeReportFindings } from "./normalize-report-findings.js";
import { FindingSourceStore } from "./finding-source-store.service.js";
import { hiddenSource } from "./finding-source-store.js";
import type { HealthReport } from "../health/health-report.js";
import { summarizeFindings } from "./findings-summary.js";
import { aiReviewFindingRows } from './ai-review-findings.js';
import { redactHealthSource } from '../health/health-report.js';
type CandidateOptions = {source:string;kind:string;health?:string;healthReports?:string;assessment?:string;lookupId?:string};
@Injectable()
export class FindingsService {
  private warmTimer?:ReturnType<typeof setInterval>;
  private warming=false;
  private stopping=false;
  private seededAt=0;
  private readonly logger=new Logger(FindingsService.name);
  onModuleInit(){
    this.warmTimer=setInterval(()=>{void this.preparePendingIndexes()},2000);
    this.warmTimer.unref();
    void this.preparePendingIndexes();
  }
  onModuleDestroy(){this.stopping=true;if(this.warmTimer)clearInterval(this.warmTimer)}
  /** No identity is impersonated: this only materializes exact repository sets.
   * list() still obtains the caller's current authorized set before selecting a key. */
  private indexSession(organizationId:string):AuthenticatedSession {
    return {authenticated:true,organizationId,identityId:'',subject:'',email:null,role:''};
  }
  private async registerIndex(organizationId:string,selected:any[],options:CandidateOptions){
    const repositoryIds=selected.map(r=>r.id).sort();
    const id=digest({organizationId,repositoryIds,options});
    await this.db.findingIndexTarget.createMany({data:[{id,organizationId,repositoryIds,options:JSON.parse(JSON.stringify(options))}],skipDuplicates:true});
  }
  private async prepareIndex(session:AuthenticatedSession,selected:any[],options:CandidateOptions){
    const aiOnly=options.kind==='ai'||options.source==='ai';
    return this.revisionRead(session,selected,options,async(tx,key)=>new FindingIndex(tx).ensure(key,session.organizationId!,digest({organizationId:session.organizationId,scope:selected.map(r=>r.id),options}),async()=>{
      const reader=new FindingsService(tx as unknown as PrismaService,this.access,this.sources);
      if(!aiOnly)return reader.collectCandidates(session,selected,options);
      const candidates=await reader.aiCandidateRows(session,selected,options.assessment);
      return {...candidates,assessedRevisions:new Set(candidates.rows.map(r=>`${r.repositoryId}:${r.sourceSha}`)).size};
    }));
  }
  async preparePendingIndexes(){
    if(this.warming||this.stopping)return;
    this.warming=true;
    try{
      // Discover newly connected repositories, and prime common filters before first use.
      if(Date.now()-this.seededAt>60000){
        const repos=await this.db.gitHubRepository.findMany({where:{selected:true,available:true,installation:{active:true}},include:{installation:{select:{organizationId:true}}},orderBy:{id:'asc'}});
        const organizations=[...new Set(repos.map(r=>r.installation.organizationId))];
        for(const org of organizations){
          const scope=repos.filter(r=>r.installation.organizationId===org);
          for(const selected of [scope,...scope.map(r=>[r])])for(const source of ['all','health','vapt','ci','ai']){
            await this.registerIndex(org,selected,{source,kind:source==='ai'?'ai':'findings'});
          }
        }
        this.seededAt=Date.now();
      }
      const due=await this.db.findingIndexTarget.findMany({where:{nextRunAt:{lte:new Date()}},orderBy:[{nextRunAt:'asc'},{id:'asc'}],take:20});
      for(const target of due){
        if(this.stopping)break;
        const claim=await this.db.findingIndexTarget.updateMany({where:{id:target.id,generation:target.generation,nextRunAt:target.nextRunAt},data:{nextRunAt:new Date(Date.now()+60000)}});
        if(!claim.count)continue;
        try{
          const selected=await this.db.gitHubRepository.findMany({where:{id:{in:target.repositoryIds},selected:true,available:true,installation:{active:true,organizationId:target.organizationId}},orderBy:{id:'asc'}});
          if(selected.length!==target.repositoryIds.length){
            await this.db.findingIndexTarget.deleteMany({where:{id:target.id,generation:target.generation}});continue;
          }
          const options=target.options as CandidateOptions;
          const reference=await this.prepareIndex(this.indexSession(target.organizationId),selected,options);
          const index=new FindingIndex(this.db);
          // Populate the common summary on the background path as well as row data.
          for(const category of ['all','security','reliability','maintainability'])await index.list(reference,target.organizationId,{category,severity:'all',search:'',triage:'all',kind:options.kind,page:1,pageSize:10},options.source==='ai');
          // A report saved during preparation increments generation: never clear that new job.
          await this.db.findingIndexTarget.updateMany({where:{id:target.id,generation:target.generation},data:{lastPreparedAt:new Date(),nextRunAt:new Date(Date.now()+300000)}});
        }catch{
          this.logger.warn('Findings index preparation failed; retry scheduled');
          await this.db.findingIndexTarget.updateMany({where:{id:target.id,generation:target.generation},data:{nextRunAt:new Date(Date.now()+10000)}});
        }
      }
    }catch{this.logger.warn('Findings index background sweep failed; retry scheduled')}
    finally{this.warming=false}
  }
  private readonly readCache=new FindingReadCache();
  private readonly readInflight=new Map<string,Promise<unknown>>();
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(FindingSourceStore) private readonly sources: FindingSourceStore,
  ) {}
  async list(
    session: AuthenticatedSession,
    query: Record<string, unknown>,
    lookupId?: string,
  ) {
    const pageSize = readPageSize(query.pageSize);
    const triage = String(query.triage ?? "all");
    const category = String(query.category ?? "all");
    // Legacy Health card links remain exact-report filters; the default list is shared.
    const source = String(query.source ?? (query.origin === "health" ? "health" : "all"));
    const health = query.health === undefined ? undefined : String(query.health);
    const healthReports = query.healthReports === undefined ? undefined : String(query.healthReports);
    const reportIds = healthReports?.split(",");
    const repository = String(query.repository ?? "all"),
      kind = String(query.kind ?? "findings"),
      severity = String(query.severity ?? "all"),
      search = String(query.q ?? "")
        .trim()
        .toLowerCase(),
      page = Number(query.page ?? 1);
    if (
      !["all", "REPORTED", "IN_REVIEW", "RESOLVED", "IGNORED"].includes(triage) ||
      !["findings", "gaps", "ai"].includes(kind) ||
      !["all", "ci", "health", "ai", "vapt"].includes(source) ||
      (health !== undefined && (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(health) || source !== "health" || repository === "all")) ||
      (reportIds !== undefined && (health !== undefined || source !== 'health' || repository === 'all' || category !== 'security' || reportIds.length < 1 || reportIds.length > 2 || new Set(reportIds).size !== reportIds.length || reportIds.some(id=>!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)))) ||
      !["all", "critical", "high", "medium", "low", "unknown"].includes(
        severity,
      ) ||
      !["all","security","reliability","maintainability","duplication","hotspot","coverage","tests","check","ai"].includes(category) ||
      search.length > 100 ||
      !Number.isSafeInteger(page) ||
      page < 1
    )
      throw new BadRequestException("Invalid findings filters");
    await this.access.requireOrganization(session, "assessment.read");
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      "assessment.read",
    );
    const selected = scope.filter(
      (item) => repository === "all" || String(item.githubId) === repository,
    ).sort((a,b)=>a.id.localeCompare(b.id));
    if (repository !== "all" && !selected.length)
      throw new ForbiddenException(
        "You do not have access to this repository. Ask your administrator for access.",
      );
    const assessment = lookupId && query.assessment !== undefined ? String(query.assessment) : undefined;
    if (assessment !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(assessment)) throw new BadRequestException("Choose a valid assessment");
    if (!lookupId) {
      const aiOnly = kind === 'ai' || source === 'ai';
      const options = aiOnly ? {source:'ai',kind:'ai',assessment} : {source,kind,health,healthReports,assessment};
      await this.registerIndex(session.organizationId!,selected,options);
      const reference = await this.prepareIndex(session,selected,options);
      const result=await new FindingIndex(this.db).list(reference,session.organizationId!,{category,severity,search,triage,kind,page,pageSize},aiOnly);
      return {...result,canManage:!!rolePermissions[session.role]?.includes('findings.manage'),repositories:scope.map(repo=>({githubId:String(repo.githubId),fullName:repo.fullName}))};
    }
    if (kind === 'ai' || source === 'ai') {
      const result = await this.aiFindings(session, selected, scope, { page, pageSize, search, severity, category, triage, assessment, lookupId });
      return kind === 'gaps' ? { ...result, rows: [], total: 0, summary: summarizeFindings([], 'gaps') } : result;
    }
    const candidates = await this.projection(session,selected,{source,kind,health,healthReports,assessment,lookupId},
      reader=>reader.collectCandidates(session,selected,{source,kind,health,healthReports,assessment,lookupId}));
    let matching = candidates.rows.filter(
      (row) =>
        (severity === "all" || row.severity === severity) &&
        (category === 'all' || row.category === category ||
          (['check','evidence'].includes(row.category) && ({security:/^(?:security\.(?!hotspots$)|secrets\.|iac\.)/,reliability:/^quality\.reliability$/,maintainability:/^quality\.maintainability$/,duplication:/^quality\.duplication$/,hotspot:/^security\.hotspots$/,coverage:/^tests\.coverage$/} as Record<string,RegExp>)[category]?.test(row.ruleId ?? ''))) &&
        (!search ||
          `${row.title} ${row.recommendation ?? ""} ${row.repository} ${row.sourceSha} ${row.pullRequest ?? ""} ${row.ruleId ?? ""} ${row.path ?? ""}`
            .toLowerCase()
            .includes(search)),
    );
    const dispositions = await this.db.findingDisposition.findMany({
      where: {
        organizationId: session.organizationId!,
        id: { in: matching.filter(row => ["ci", "ai"].includes(row.origin)).map((row) => row.id) },
      },
    });
    const dispositionById=new Map(dispositions.map(item=>[item.id,item]));
    for (const row of matching) {
      if (lookupId) row.referenceGuidance = findingReferenceGuidance(row.ruleId);
      const saved = ["ci", "ai"].includes(row.origin) && dispositionById.get(row.id)?.sourceSha===row.sourceSha && dispositionById.get(row.id);
      row.triage = saved
        ? {
            state: saved.state,
            assigneeId: saved.assigneeId,
            note: saved.note,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          }
        : { state: "REPORTED", assigneeId: null, note: "", revision: 0 };
    }
    await this.applyIgnores(session, matching);
    matching = matching.filter(
      (row) => triage === "all" || (triage === "IGNORED" ? row.ignore?.state === "IGNORED" : row.ignore?.state !== "IGNORED" && row.triage.state === triage),
    );
    const filtered = matching.filter(
      (row) =>
        (row.category === "evidence") === (kind === "gaps") &&
        (!lookupId || row.id === lookupId),
    );
    return {
      canManage: !!rolePermissions[session.role]?.includes("findings.manage"),
      summary: summarizeFindings(matching, kind),
      rows: filtered.slice((page - 1) * pageSize, page * pageSize).map(row => {
        if (lookupId) return row;
        const {guidance: _guidance, reportGuidance: _reportGuidance, referenceGuidance: _referenceGuidance, aiReview:_aiReview, ...summary} = row;
        return summary;
      }),
      total: filtered.length,
      page,
      pageSize,
      truncated: candidates.truncated,
      repositories: scope.map((repo) => ({
        githubId: String(repo.githubId),
        fullName: repo.fullName,
      })),
      assessedRevisions: candidates.assessedRevisions,
      incompleteHealth: candidates.incompleteHealth,
      inspectionOnly: candidates.inspectionOnly,
    };
  }

  private async collectCandidates(session:AuthenticatedSession,selected:any[],options:CandidateOptions) {
    const {source,kind,health,healthReports,assessment,lookupId}=options;
    const records = ["health", "vapt"].includes(source) ? [] : await this.db.commitAssessment.findMany({
      where: { repositoryId: { in: selected.map((item) => item.id) }, ...(assessment ? { id: assessment } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 201,
    });
    const snapshots = records.slice(0, 200);
    for (const snapshot of snapshots)
      if (
        digest({
          request: snapshot.request,
          plan: snapshot.plan,
          report: snapshot.report,
        }) !== snapshot.assessmentHash
      )
        throw new ConflictException(
          "Assessment integrity check failed; inspect the affected assessment",
        );
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.repositoryId}:${snapshot.sourceSha}`;
      if (!latest.has(key)) latest.set(key, snapshot);
    }
    const artifactRefs = [...latest.values()]
      .flatMap((snapshot) =>
        ((snapshot.report as any).observations ?? []).flatMap(
          (observation: any) =>
            (observation.artifacts ?? []).map((artifact: any) => artifact.id),
        ),
      )
      .filter((id): id is string => typeof id === "string");
    const ids = [...new Set(artifactRefs)].slice(0, 100);
    const artifacts = await this.db.ciArtifactImport.findMany({
      where: {
        id: { in: ids },
        evidence: {
          repositoryGithubId: { in: selected.map((item) => item.githubId) },
        },
      },
      include: { evidence: true },
      take: 100,
    });
    const artifactById = new Map(artifacts.map((item) => [item.id, item]));
    const rows: any[] = [];
    let detailTruncated = false;
    const parsed = new Map<
      string,
      ReturnType<typeof normalizeReportFindings>
    >();
    for (const snapshot of latest.values()) {
      if (rows.length >= 2000) {
        detailTruncated = true;
        break;
      }
      const repo = selected.find((item) => item.id === snapshot.repositoryId)!;
      const request = snapshot.request as any,
        report = snapshot.report as any,
        plan = snapshot.plan as any;
      const base = {
        origin: "ci",
        repositoryId: String(repo.githubId),
        repository: repo.fullName,
        sourceSha: snapshot.sourceSha,
        assessmentId: snapshot.id,
        assessmentHash: snapshot.assessmentHash,
        observedAt: snapshot.createdAt.toISOString(),
        pullRequest: request.pullRequest?.number ?? null,
      };
      for (const rule of previewGate(snapshot).rules) {
        if (rule.status === "INCOMPLETE" || rule.status === "BLOCK") {
          const definition = plan.checks?.find(
            (check: any) => check.id === rule.ruleId,
          );
          if (rows.length >= 2000) {
            detailTruncated = true;
            break;
          }
          rows.push({
            ...base,
            id: digest([
              repo.githubId.toString(),
              snapshot.sourceSha,
              rule.ruleId,
            ]),
            title: rule.title,
            category: rule.status === "INCOMPLETE" ? "evidence" : "check",
            severity: definition?.severity ?? "unknown",
            status:
              rule.status === "INCOMPLETE" ? "Evidence missing" : "Failed",
            path: null,
            line: null,
            ruleId: rule.ruleId,
            evidence: rule.reasons,
            artifactId: null,
            occurrences: 1,
            verification: "Assessment verified",
          });
        }
      }
      for (const observation of report.observations ?? [])
        for (const ref of observation.artifacts ?? []) {
          const artifact = artifactById.get(ref.id);
          if (!artifact) {
            detailTruncated = true;
            continue;
          }
          if (
            artifact.sha256 !== ref.sha256 ||
            artifact.deliveryId !== observation.deliveryId ||
            artifact.evidence.sourceSha !== snapshot.sourceSha ||
            artifact.evidence.repositoryGithubId !== repo.githubId ||
            artifact.evidence.installationId !== repo.installationId
          )
            throw new ConflictException(
              "Finding report scope or integrity mismatch",
            );
          if (!parsed.has(artifact.id))
            parsed.set(
              artifact.id,
              normalizeReportFindings(
                artifact.format,
                artifact.content,
                artifact.sha256,
              ),
            );
          for (const finding of parsed.get(artifact.id)!) {
            if (rows.length >= 2000) {
              detailTruncated = true;
              break;
            }
            rows.push({
              ...base,
              ...finding,
              id: digest([
                String(repo.githubId),
                snapshot.sourceSha,
                finding.fingerprint,
              ]),
              status: finding.suppressed ? "Suppressed" : "Reported",
              evidence: [artifact.sha256],
              artifactId: artifact.id,
              occurrences: 1,
              verification: ref.verification,
            });
          }
        }
    }
    // Select the latest source revisions using headers in PostgreSQL; never
    // download every historical report to choose which ones are displayed.
    const healthHeaders = source === "ci" || lookupId || !selected.length ? [] : await this.db.$queryRaw<{id:string;repositoryId:string;sourceSha:string|null;branch:string;hasReport:boolean;vapt:boolean}[]>(Prisma.sql`
      SELECT id,"repositoryId","sourceSha",branch, (report IS NOT NULL AND report<>'null'::jsonb) AS "hasReport",
        COALESCE(jsonb_path_exists(report,'$.analyses[*] ? (@.id == "security.strix")'),false) AS vapt
      FROM "RepositoryHealthAssessment" WHERE "organizationId"=${session.organizationId!}
        AND "repositoryId" IN (${Prisma.join(selected.map(repo=>repo.id))}) AND state IN ('COMPLETED','FAILED')
        ${health ? Prisma.sql`AND id=${health}` : Prisma.empty}
        ${healthReports ? Prisma.sql`AND id IN (${Prisma.join(healthReports.split(","))})` : Prisma.empty}
      ORDER BY "createdAt" DESC,id DESC LIMIT 201`);
    if (health && !healthHeaders.length) throw new NotFoundException("This saved Health report is unavailable in your scope.");
    if (healthReports && healthHeaders.length !== healthReports.split(',').length) throw new NotFoundException('The saved security reports are unavailable in your scope.');
    if (healthReports && new Set(healthHeaders.map(h=>`${h.branch}:${h.sourceSha}`)).size>1) throw new BadRequestException('Security reports must use the same branch and commit.');
    const latestHeaders=new Map<string,string>();
    for(const saved of healthHeaders.slice(0,200)) {
      if(!saved.sourceSha || !saved.hasReport) continue;
      const key=`${saved.repositoryId}:${saved.sourceSha}:${saved.vapt?'strix':'static'}`;
      if(!latestHeaders.has(key)) latestHeaders.set(key,saved.id);
    }
    const healthRecords=latestHeaders.size ? await this.db.repositoryHealthAssessment.findMany({where:{id:{in:[...latestHeaders.values()]}},orderBy:[{createdAt:'desc'},{id:'desc'}]}) : [];
    const latestHealth = new Map<string, (typeof healthRecords)[number]>();
    for (const saved of healthRecords.slice(0, 200)) {
      if (!saved.sourceSha || !saved.report) continue;
      const key = `${saved.repositoryId}:${saved.sourceSha}:${(saved.report as unknown as HealthReport).analyses?.some(a=>a.id==='security.strix')?'strix':'static'}`;
      if (!latestHealth.has(key)) latestHealth.set(key, saved);
    }
    let incompleteHealth = false;
    for (const saved of latestHealth.values()) {
      const report = saved.report as unknown as HealthReport;
      const repo = selected.find(item => item.id === saved.repositoryId)!;
      if (report.completeness !== "COMPLETE") incompleteHealth = true;
      for (const finding of report.findings) {
        if (source === "vapt" && finding.evidence !== "AI_REPORTED") continue;
        if (rows.length >= 2000) { detailTruncated = true; break; }
        rows.push({
          ...finding,
          id: digest(["health", String(repo.githubId), saved.sourceSha, finding.fingerprint]),
          origin: "health",
          health: saved.id,
          healthFingerprint: finding.fingerprint,
          repositoryId: String(repo.githubId), repository: repo.fullName,
          sourceSha: saved.sourceSha, assessmentId: saved.id,
          observedAt: (saved.finishedAt ?? saved.createdAt).toISOString(),
          status: finding.evidence === 'AI_REPORTED' ? 'Needs review' : 'Reported', evidence: [finding.evidence],
          verification: finding.evidence === 'AI_REPORTED' ? 'Suggestions only' : 'Verified analyzer receipt', occurrences: 1,
        });
      }
    }
    const ai = source === 'all' && kind !== 'gaps' ? await this.aiCandidateRows(session,selected,assessment) : undefined;
    if (ai) rows.push(...ai.rows);
    // Put all sources in one stable chronological order before deduplication/pagination.
    rows.sort((a, b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? "") || a.id.localeCompare(b.id));
    const unique = new Map<string, any>();
    if (rows.length > 2000) detailTruncated = true;
    for (const row of rows.slice(0, 2000)) {
      const existing = unique.get(row.id);
      if (existing) existing.occurrences++;
      else unique.set(row.id, row);
    }
    return {rows:[...unique.values()],truncated:records.length>200 || healthHeaders.length>200 || !!ai?.truncated || new Set(artifactRefs).size>100 || detailTruncated,
      assessedRevisions:new Set([...latest.keys(),...latestHealth.keys(),...(ai?.rows.map(row=>`${selected.find(repo=>String(repo.githubId)===row.repositoryId)?.id}:${row.sourceSha}`)??[])]).size,
      incompleteHealth,inspectionOnly:source==='health' && latestHealth.size>0 && [...latestHealth.values()].every(saved=>(saved.report as unknown as HealthReport).mode==='INSPECTION_ONLY')};
  }

  private async aiCandidateRows(session:AuthenticatedSession,selected:any[],assessment?:string) {
    const records = await this.db.aiSkillReview.findMany({
      where: { organizationId: session.organizationId!, repositoryId: { in: selected.map(r => r.id) },
        stage: 'pull_request', state: 'SUCCEEDED', ...(assessment ? { assessmentId: assessment } : {}) },
      include: { assessment: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 201,
    });
    const unique = new Map<string, any>();
    let limited = false;
    for (const review of records.slice(0, 200)) {
      const repo = selected.find(r => r.id === review.repositoryId);
      if (!repo || review.assessment.repositoryId !== repo.id) continue;
      for (const row of aiReviewFindingRows(review, repo)) {
        if (unique.size >= 2000) { limited = true; break; }
        if (!unique.has(row.id)) unique.set(row.id, row);
      }
    }
    return {rows:[...unique.values()],truncated:records.length>200 || limited};
  }

  private async aiFindings(session: AuthenticatedSession, selected: any[], scope: any[],
    filters: { page: number; pageSize: number; search: string; severity: string; category: string; triage: string; assessment?: string; lookupId?: string }, allRows = false) {
    const candidates=await this.projection(session,selected,{source:'ai',kind:'ai',assessment:filters.assessment},reader=>reader.aiCandidateRows(session,selected,filters.assessment));
    const unique=new Map<string,any>(candidates.rows.map(row=>[row.id,row]));
    const dispositions = await this.db.findingDisposition.findMany({ where: {
      organizationId: session.organizationId!, id: { in: [...unique.keys()] },
    } });
    for (const row of unique.values()) {
      const saved = dispositions.find(d => d.id === row.id && d.sourceSha === row.sourceSha);
      row.triage = saved ? { state: saved.state, assigneeId: saved.assigneeId, note: saved.note, revision: saved.revision, updatedAt: saved.updatedAt }
        : { state: 'REPORTED', assigneeId: null, note: '', revision: 0 };
    }
    await this.applyIgnores(session, [...unique.values()]);
    const matching = [...unique.values()].filter(row =>
      (filters.severity === 'all' || row.severity === filters.severity) && (filters.category === 'all' || filters.category === 'ai') &&
      (filters.triage === 'all' || (filters.triage === 'IGNORED' ? row.ignore?.state === 'IGNORED' : row.ignore?.state !== 'IGNORED' && row.triage.state === filters.triage)) &&
      (!filters.lookupId || row.id === filters.lookupId) &&
      (!filters.search || `${row.title} ${row.recommendation} ${row.repository} ${row.sourceSha} ${row.pullRequest} ${row.checkTitle} ${row.evidenceLocations.map((e: any) => e.path ?? e.label).join(' ')}`.toLowerCase().includes(filters.search)));
    await this.access.requireOrganization(session, 'assessment.read');
    const current = await this.access.repositoryScope(session.identityId, session.organizationId, 'assessment.read');
    if (selected.some(repo => !current.some(r => r.id === repo.id)))
      throw new ForbiddenException('Repository access changed. Refresh Findings.');
    return {
      canManage: !!rolePermissions[session.role]?.includes('findings.manage'), summary: summarizeFindings(matching, 'findings'),
      aiSummary: { suggestions: matching.length, repositories: new Set(matching.map(r => r.repositoryId)).size,
        pullRequests: new Set(matching.map(r => `${r.repositoryId}:${r.pullRequest}`)).size },
      rows: allRows ? matching : matching.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), total: matching.length,
      page: filters.page, pageSize: filters.pageSize, truncated: candidates.truncated,
      repositories: scope.map(repo => ({ githubId: String(repo.githubId), fullName: repo.fullName })),
      assessedRevisions: new Set([...unique.values()].map(r => `${r.repositoryId}:${r.sourceSha}`)).size,
    };
  }

  /** A repeatable snapshot plus shared parent locks fences dependency updates.
   * Artifact/evidence triggers advance the parent's revision in the same write
   * transaction. Cached rows therefore cannot hide a changed integrity check. */
  private async projection<T>(session:AuthenticatedSession,selected:any[],options:CandidateOptions,build:(reader:FindingsService)=>Promise<T>):Promise<T> {
    return this.revisionRead(session,selected,options,async (tx,key)=>{
      const cached=this.readCache.get<T>(key);if(cached!==undefined)return cached;
      const pending=this.readInflight.get(key);if(pending)return structuredClone(await pending) as T;
      const promise=build(new FindingsService(tx as unknown as PrismaService,this.access,this.sources));
      this.readInflight.set(key,promise);
      try {const value=await promise;this.readCache.set(key,value);return value}finally{this.readInflight.delete(key)}
    });
  }
  private async revisionRead<T>(session:AuthenticatedSession,selected:any[],options:CandidateOptions,read:(tx:Prisma.TransactionClient,key:string)=>Promise<T>):Promise<T> {
    const ids=selected.map(repo=>repo.id),aiOnly=options.kind==='ai'||options.source==='ai';
    for(let attempt=0;attempt<2;attempt++)try {
      return await this.db.$transaction(async tx=>{
        type Version={id:string;findingReadRevision:bigint};
        type AiVersion=Version & {assessmentId:string;assessmentRevision:bigint};
        const [ci,health,ai]=await Promise.all([
          ids.length && !aiOnly && !['health','vapt'].includes(options.source) ? tx.$queryRaw<Version[]>(Prisma.sql`SELECT id,"findingReadRevision" FROM "CommitAssessment" WHERE "repositoryId" IN (${Prisma.join(ids)}) ${options.assessment ? Prisma.sql`AND id=${options.assessment}` : Prisma.empty} ORDER BY "createdAt" DESC,id DESC LIMIT 201`) : [],
          ids.length && !aiOnly && options.source!=='ci' && !options.lookupId ? tx.$queryRaw<Version[]>(Prisma.sql`SELECT id,"findingReadRevision" FROM "RepositoryHealthAssessment" WHERE "organizationId"=${session.organizationId!} AND "repositoryId" IN (${Prisma.join(ids)}) AND state IN ('COMPLETED','FAILED') ${options.health ? Prisma.sql`AND id=${options.health}` : Prisma.empty} ${options.healthReports ? Prisma.sql`AND id IN (${Prisma.join(options.healthReports.split(","))})` : Prisma.empty} ORDER BY "createdAt" DESC,id DESC LIMIT 201`) : [],
          ids.length && (aiOnly || (options.source==='all' && options.kind!=='gaps')) ? tx.$queryRaw<AiVersion[]>(Prisma.sql`SELECT r.id,r."findingReadRevision",a.id AS "assessmentId",a."findingReadRevision" AS "assessmentRevision" FROM "AiSkillReview" r JOIN "CommitAssessment" a ON a.id=r."assessmentId" WHERE r."organizationId"=${session.organizationId!} AND r."repositoryId" IN (${Prisma.join(ids)}) AND r.stage='pull_request' AND r.state='SUCCEEDED' ${options.assessment ? Prisma.sql`AND r."assessmentId"=${options.assessment}` : Prisma.empty} ORDER BY r."createdAt" DESC,r.id DESC LIMIT 201`) : [],
        ]);
        const locks:[string,string[]][]=[['CommitAssessment',[...new Set([...ci.map(row=>row.id),...ai.map(row=>row.assessmentId)])]],['RepositoryHealthAssessment',health.map(row=>row.id)],['AiSkillReview',ai.map(row=>row.id)]];
        for(const [table,keys] of locks)if(keys.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw('"'+table+'"')} WHERE id IN (${Prisma.join(keys)}) ORDER BY id FOR SHARE`);
        const key=digest({version:2,organizationId:session.organizationId,scope:selected.map(repo=>[repo.id,String(repo.githubId),repo.fullName,String(repo.installationId)]),options:{source:options.source,includeAi:aiOnly || (options.source==='all' && options.kind!=='gaps'),health:options.health,healthReports:options.healthReports,assessment:options.assessment,lookupHealth:!!options.lookupId},
          ci:ci.map(row=>[row.id,String(row.findingReadRevision)]),health:health.map(row=>[row.id,String(row.findingReadRevision)]),ai:ai.map(row=>[row.id,String(row.findingReadRevision),row.assessmentId,String(row.assessmentRevision)])});
        return read(tx,key);
      },{isolationLevel:'RepeatableRead',timeout:15000});
    }catch(error){
      const failure=error as {code?:string;meta?:{code?:string;driverAdapterError?:{cause?:{originalCode?:string}}}};
      const sqlState=failure?.meta?.code ?? failure?.meta?.driverAdapterError?.cause?.originalCode;
      if(failure?.code!=='P2034' && failure?.code!=='P2002' && sqlState!=='40001' && sqlState!=='40P01')throw error;
      if(attempt)throw new ConflictException('Findings changed while loading. Refresh and try again.');
    }
    throw new ConflictException('Findings changed while loading. Refresh and try again.');
  }

  private async finding(session: AuthenticatedSession, id: string, assessment?: string, origin?: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new BadRequestException("Choose a valid finding");
    if (origin !== undefined && origin !== 'ai') throw new BadRequestException('Choose a valid finding source');
    if (origin === 'ai') {
      const ai = await this.list(session, { kind: 'ai', source: 'ai', ...(assessment ? { assessment } : {}) }, id);
      if (ai.rows[0]) return ai.rows[0];
      throw new NotFoundException('AI suggestion is unavailable in this assessment or repository scope');
    }
    for (const kind of ["findings", "gaps"]) {
      const result = await this.list(session, { kind, source: "ci", ...(assessment ? { assessment } : {}) }, id);
      if (result.rows[0]) return result.rows[0];
    }
    const ai = await this.list(session, { kind: 'ai', source: 'ai', ...(assessment ? { assessment } : {}) }, id);
    if (ai.rows[0]) return ai.rows[0];
    throw new NotFoundException(
      "Finding is unavailable in your current scope or retained assessment window",
    );
  }
  private async applyIgnores(session: AuthenticatedSession, rows: any[]) {
    if (!rows.length) return;
    const saved = await this.db.findingIgnore.findMany({ where: { organizationId: session.organizationId!,
      id: { in: rows.map(row => findingIgnoreId(session.organizationId!, row)) } } });
    const byId = new Map(saved.map(row => [row.id, row]));
    for (const row of rows) {
      row.ignore = ignoreState(byId.get(findingIgnoreId(session.organizationId!, row)));
      if (row.ignore.state === 'IGNORED') row.status = 'Ignored';
    }
  }
  private async ignoreFinding(session: AuthenticatedSession, id: string, query: Record<string, unknown>) {
    if (query.origin !== 'health') return this.finding(session, id, query.assessment as string | undefined, query.origin as string | undefined);
    const repository = String(query.repository ?? ''), assessment = String(query.assessment ?? '');
    const repo = await this.access.requireRepository(session, repository, 'assessment.read');
    if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9-]{36}$/.test(assessment)) throw new BadRequestException('Choose a valid finding');
    const saved = await this.db.repositoryHealthAssessment.findFirst({where: { id: assessment, repositoryId: repo.id, organizationId: session.organizationId! }});
    const row = (saved?.report as unknown as HealthReport | null)?.findings.find(f => f.fingerprint === id);
    if (!row || !saved?.sourceSha) throw new NotFoundException('Finding is unavailable');
    return { ...row, origin: 'health', repositoryId: repository, assessmentId: assessment, sourceSha: saved.sourceSha };
  }
  async getIgnore(session: AuthenticatedSession, id: string, query: Record<string, unknown>) {
    const finding = await this.ignoreFinding(session, id, query);
    await this.access.requireRepository(session, finding.repositoryId, 'assessment.read');
    const key = findingIgnoreId(session.organizationId!, finding);
    const saved = await this.db.findingIgnore.findFirst({where: {id: key, organizationId: session.organizationId!}});
    const history = await this.db.auditEvent.findMany({where: { event: { in: ['finding.ignored', 'finding.reopened'] },
      metadata: { path: ['ignoreId'], equals: key } }, orderBy: {createdAt: 'desc'}, take: 20, select: {event:true, createdAt:true, metadata:true}});
    await this.access.requireRepository(session, finding.repositoryId, 'assessment.read');
    return { ...ignoreState(saved), canManage: !!rolePermissions[session.role]?.includes('findings.manage'),
      eligible: !['check', 'evidence'].includes(finding.category), history: history.map(h => ({event:h.event, at:h.createdAt,
        reason:(h.metadata as any)?.reason, expiresAt:(h.metadata as any)?.expiresAt})) };
  }
  async setIgnore(session: AuthenticatedSession, id: string, query: Record<string, unknown>, input: unknown) {
    const data = validateIgnore(input);
    await this.access.requireOrganization(session, 'findings.manage', true);
    const finding = await this.ignoreFinding(session, id, query);
    if (['check', 'evidence'].includes(finding.category)) throw new BadRequestException('Check results and missing evidence cannot be ignored.');
    const key = findingIgnoreId(session.organizationId!, finding);
    return this.db.$transaction(async tx => {
      const access = new AuthorizationService(tx as PrismaService);
      const repo = await access.requireRepository(session, finding.repositoryId, 'findings.manage');
      const values = {...data, updatedById:session.identityId};
      const revision = (input as {expectedRevision:number}).expectedRevision;
      const changed = revision === 0
        ? await tx.findingIgnore.createMany({data:[{id:key, organizationId:session.organizationId!, repositoryGithubId:finding.repositoryId, ...values}], skipDuplicates:true})
        : await tx.findingIgnore.updateMany({where:{id:key, organizationId:session.organizationId!, revision}, data:{...values, revision:{increment:1}}});
      if (!changed.count) throw new ConflictException('The ignore decision changed. Refresh and try again.');
      await tx.auditEvent.create({data:{event:data.state === 'IGNORED' ? 'finding.ignored' : 'finding.reopened', actorId:session.identityId,
        metadata:{organizationId:session.organizationId!, repositoryId:repo.id, ignoreId:key, findingId:id, assessmentId:finding.assessmentId,
          reason:data.reason, expiresAt:data.expiresAt?.toISOString() ?? null, revision:revision+1}}});
      return ignoreState(await tx.findingIgnore.findUniqueOrThrow({where:{id:key}}));
    });
  }
  async detail(session: AuthenticatedSession, id: string, assessment?: string, origin?: string) {
    const finding = await this.finding(session, id, assessment, origin);
    await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    return { finding, canManage: !!rolePermissions[session.role]?.includes("findings.manage") };
  }
  async source(session: AuthenticatedSession, id: string, assessment?: string, origin?: string, location?: string) {
    const savedFinding = await this.finding(session, id, assessment, origin);
    if (savedFinding.origin === 'ai' && location !== undefined && location !== '0') throw new BadRequestException('Choose the reviewed source location');
    const finding = reportedLocation(savedFinding, location);
    const repo = await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    const base = { path: finding.path, line: finding.line, endLine: finding.endLine ?? finding.line, sourceSha: finding.sourceSha, lines: [] as Array<{ number: number; text: string }>, reason: null as string | null, truncated: false };
    if (!finding.path) return { ...base, reason: finding.category === 'check' || finding.category === 'evidence' ? 'This is a check result, not a finding at a code location. Review its assessment evidence below.' : 'The report did not supply a file location.' };
    if (finding.origin === 'ai' && finding.codeSide === 'LEFT') {
      const review = await this.db.aiSkillReview.findUnique({ where: { id: finding.reviewId }, include: { assessment: true } });
      if (!review || review.organizationId !== session.organizationId || review.repositoryId !== repo.id ||
        !aiReviewFindingRows(review, repo).some(row => row.id === finding.id))
        throw new NotFoundException('The saved review source could not be verified.');
      const available = new Map<number, string>();
      for (const line of (review.snapshot as any).context.source?.lines ?? [])
        if (line.path === finding.path && line.side === 'LEFT' && Math.abs(line.line - finding.line) <= 8)
          available.set(line.line, line.text);
      let first = finding.line, last = finding.line;
      while (available.has(first - 1)) first--;
      while (available.has(last + 1)) last++;
      const lines = [];
      for (let number = first; number <= last; number++)
        if (available.has(number)) lines.push({ number, text: redactHealthSource(available.get(number)!) });
      if (hiddenSource(finding)) for (const line of lines) if (line.number >= finding.line && line.number <= (finding.endLine ?? finding.line)) line.text = '[Potential credential redacted]';
      await this.access.requireRepository(session, finding.repositoryId, 'assessment.read');
      return { ...base, lines, truncated: true, reason: lines.length ? null : 'The review did not retain this changed line.' };
    }
    const excerpt = await this.sources.read(repo.id, finding.sourceSha, finding);
    await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    return { ...base, ...excerpt };

  }
  async assignees(session: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(session, "findings.manage");
    const finding = await this.finding(session, id);
    const repo = await this.access.requireRepository(
      session,
      finding.repositoryId,
      "findings.manage",
    );
    const members = await this.db.organizationMembership.findMany({
      where: {
        organizationId: session.organizationId!,
        active: true,
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          { grants: { some: { repositoryId: repo.id } } },
        ],
      },
      include: { identity: { include: { githubAccounts: true } } },
      take: 100,
    });
    return members
      .filter((member) =>
        rolePermissions[member.role]?.includes("assessment.read"),
      )
      .map((member) => ({
        id: member.identityId,
        label:
          member.identity.githubAccounts[0]?.login ?? member.identity.subject,
      }));
  }
  async triage(
    session: AuthenticatedSession,
    id: string,
    input: {
      state: string;
      assigneeId?: string | null;
      note: string;
      expectedRevision: number;
    },
  ) {
    if (
      !input ||
      !["REPORTED", "IN_REVIEW", "RESOLVED"].includes(input.state) ||
      typeof input.note !== "string" ||
      input.note.trim().length > 1000 ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      (input.assigneeId != null &&
        (typeof input.assigneeId !== "string" || input.assigneeId.length > 80))
    )
      throw new BadRequestException(
        "Choose a valid triage status, assignee and note",
      );
    await this.access.requireOrganization(session, "findings.manage", true);
    const finding = await this.finding(session, id);
    const repo = await this.access.requireRepository(
      session,
      finding.repositoryId,
      "findings.manage",
    );
    if (input.state === "RESOLVED" && !input.note.trim())
      throw new BadRequestException(
        "Explain the resolution; the original assessment and gate stay unchanged",
      );
    if (input.assigneeId) {
      const member = await this.db.organizationMembership.findUnique({
        where: {
          organizationId_identityId: {
            organizationId: session.organizationId!,
            identityId: input.assigneeId,
          },
        },
        include: { identity: true },
      });
      if (!member?.active)
        throw new BadRequestException(
          "Choose an active member with access to this repository",
        );
      await this.access.requireRepository(
        {
          ...session,
          identityId: member.identityId,
          subject: member.identity.subject,
          role: member.role,
          platformAdmin: false,
        },
        finding.repositoryId,
        "assessment.read",
      );
    }
    return this.db.$transaction(async (tx) => {
      const access = new AuthorizationService(tx as PrismaService);
      await access.requireRepository(
        session,
        finding.repositoryId,
        "findings.manage",
      );
      if (input.assigneeId) {
        const member = await tx.organizationMembership.findUnique({
          where: {
            organizationId_identityId: {
              organizationId: session.organizationId!,
              identityId: input.assigneeId,
            },
          },
          include: { identity: true },
        });
        if (!member?.active)
          throw new BadRequestException(
            "Assignee access changed. Choose an active repository member.",
          );
        await access.requireRepository(
          {
            ...session,
            identityId: member.identityId,
            subject: member.identity.subject,
            role: member.role,
            platformAdmin: false,
          },
          finding.repositoryId,
          "assessment.read",
        );
      }
      const data = {
        assessmentId: finding.assessmentId,
        state: input.state,
        assigneeId: input.assigneeId ?? null,
        note: input.note.trim(),
        updatedById: session.identityId,
      };
      if (input.expectedRevision === 0) {
        const created = await tx.findingDisposition.createMany({
          data: [
            {
              id,
              organizationId: session.organizationId!,
              repositoryGithubId: finding.repositoryId,
              sourceSha: finding.sourceSha,
              ...data,
            },
          ],
          skipDuplicates: true,
        });
        if (!created.count)
          throw new ConflictException(
            "Finding triage changed. Refresh and try again.",
          );
      } else {
        const updated = await tx.findingDisposition.updateMany({
          where: {
            id,
            organizationId: session.organizationId!,
            sourceSha: finding.sourceSha,
            revision: input.expectedRevision,
          },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!updated.count)
          throw new ConflictException(
            "Finding triage changed. Refresh and try again.",
          );
      }
      const saved = await tx.findingDisposition.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditEvent.create({
        data: {
          event: "finding.triage_updated",
          actorId: session.identityId,
          metadata: {
            organizationId: session.organizationId!,
            repositoryId: repo.id,
            findingId: id,
            assessmentId: finding.assessmentId,
            sourceSha: finding.sourceSha,
            state: saved.state,
            revision: saved.revision,
            assigneeId: saved.assigneeId,
          },
        },
      });
      return {
        state: saved.state,
        assigneeId: saved.assigneeId,
        note: saved.note,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      };
    });
  }
}
