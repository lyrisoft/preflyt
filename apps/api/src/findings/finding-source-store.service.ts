import { GitHubRateLimitError } from '../github/github-rate-limit.js'
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { Prisma, type FindingSourceExcerpt } from '../generated/prisma/client.js'
import { GitHubProviderService } from '../github/github-provider.service.js'
import { verifyNativeSourceBundle, type NativeSourceBundle } from '../execution/native-source.js'
import { digest } from '../assessments/assessment-digest.js'
import { redactHealthSource } from '../health/health-report.js'
import { sourceExcerpt, sourceExcerptLines } from './source-excerpt.js'
import { findingSourceLocations, FINDING_SOURCE_CONTEXT_LINES, sourceLocation, SOURCE_EXCERPT_VERSION, SECRET_SOURCE_EXCERPT_VERSION, type SourceLocation } from './finding-source-store.js'

type Excerpt = ReturnType<typeof sourceExcerpt> & { retryable?: boolean }
const unavailable = (): Excerpt => ({ lines: [], retryable: false, reason: 'No code excerpt was saved for this finding. Open the file on GitHub to view the code at the assessed commit.', truncated: false })
export type FindingSourceSnapshot = NonNullable<ReturnType<typeof sourceLocation>> & {content:ReturnType<typeof sourceExcerpt>;contentHash:string}
@Injectable()
export class FindingSourceStore {
  private readonly reads = new Map<string, Promise<Excerpt>>()
  private readonly files = new Map<string, Promise<string>>()
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(GitHubProviderService) private readonly github: GitHubProviderService) {}
  private decode(row: FindingSourceExcerpt): Excerpt {
    const value = row.content as Excerpt | null
    if (row.id !== digest([row.version, row.repositoryId, row.sourceSha, row.path, row.line, row.endLine, row.contextLines]) || ![SOURCE_EXCERPT_VERSION, SECRET_SOURCE_EXCERPT_VERSION].includes(row.version) || !value || digest(value) !== row.contentHash || !Array.isArray(value.lines) || value.lines.length > 60 ||
      !value.lines.every(l => Number.isSafeInteger(l.number) && l.number > 0 && typeof l.text === 'string' && l.text.length <= 2000) ||
      (value.reason !== null && typeof value.reason !== 'string') || typeof value.truncated !== 'boolean') throw new ConflictException('Saved source integrity check failed')
    return value
  }
  async read(repositoryId: string, sourceSha: string, finding: SourceLocation, contextLines = FINDING_SOURCE_CONTEXT_LINES): Promise<Excerpt> {
    const location = sourceLocation(repositoryId, sourceSha, finding, contextLines)
    if (!location) return unavailable()
    await this.activeRepository(location)
    const row = await this.db.findingSourceExcerpt.findUnique({ where: { id: location.id } })
    if (row?.contentHash) return this.decode(row)
    // Older imports used eight context lines. Reuse that saved block rather than
    // scheduling another GitHub fetch for a different display window.
    const alternate=sourceLocation(repositoryId,sourceSha,finding,contextLines===5?8:5)!
    const saved=await this.db.findingSourceExcerpt.findUnique({where:{id:alternate.id}})
    return saved?.contentHash?this.decode(saved):unavailable()
  }
  private capture(row: FindingSourceExcerpt, files = this.files): Promise<Excerpt> {
    const existing = this.reads.get(row.id)
    if (existing) return existing
    const read = this.load(row, files).finally(() => this.reads.delete(row.id))
    this.reads.set(row.id, read)
    return read
  }
  private async activeRepository(row: Pick<FindingSourceExcerpt,'repositoryId'>) {
    const repo = await this.db.gitHubRepository.findFirst({ where: { id: row.repositoryId, selected: true, available: true, installation: { active: true } } })
    if (!repo) throw new ForbiddenException('Repository access is unavailable')
    return repo
  }
  private async load(row: FindingSourceExcerpt, files: Map<string, Promise<string>>): Promise<Excerpt> {
    // A second process may have captured it after the pending list was read.
    const latest = await this.db.findingSourceExcerpt.findUniqueOrThrow({ where: { id: row.id } })
    if (latest.contentHash) return this.decode(latest)
    const claimed = await this.db.findingSourceExcerpt.updateMany({where: {id: row.id, contentHash: null, retryAfter: {lte: new Date()}}, data: {retryAfter: new Date(Date.now() + 120000)}})
    if (!claimed.count) return unavailable()
    const repo = await this.activeRepository(row)
    const fileKey = digest([repo.installationId.toString(), repo.githubId.toString(), row.sourceSha, row.path])
    let file = files.get(fileKey)
    if (!file) {
      file = this.github.readHealthSource(repo.installationId, repo.githubId, row.sourceSha, row.path).then(redactHealthSource).finally(() => { if (files === this.files) files.delete(fileKey) })
      files.set(fileKey, file)
    }
    let text: string
    try { text = await file }
    catch (error) {
      if (error instanceof GitHubRateLimitError) {
        const retryAt = Date.parse((error.getResponse() as {retryAt:string}).retryAt)
        await this.db.findingSourceExcerpt.updateMany({where:{id:row.id,contentHash:null},data:{retryAfter:new Date(Math.max(Date.now()+5000,retryAt))}})
        return unavailable()
      }
      await this.db.findingSourceExcerpt.updateMany({ where: { id: row.id, contentHash: null }, data: { attempts: { increment: 1 }, retryAfter: new Date(Date.now() + Math.min(300000, 30000 * 2 ** Math.min(row.attempts, 4))) } })
      return unavailable()
    }
    const live = await this.activeRepository(row)
    if (live.installationId !== repo.installationId || live.githubId !== repo.githubId) throw new ForbiddenException('Repository access changed')
    const content = sourceExcerpt(text, row.line, row.endLine, row.contextLines)
    if (row.version === SECRET_SOURCE_EXCERPT_VERSION) {
      // Match columns/values are deliberately absent from receipts. Mask the whole
      // reported range, including unknown detector formats; retain numbered context.
      for (const line of content.lines) if (row.line !== null && line.number >= row.line && line.number <= (row.endLine ?? row.line))
        line.text = '[Potential credential redacted]'
    }
    // Only redacted, bounded excerpts are stored. The first verified snapshot wins.
    await this.db.findingSourceExcerpt.updateMany({ where: { id: row.id, contentHash: null }, data: { content: content as Prisma.InputJsonValue, contentHash: digest(content), capturedAt: new Date() } })
    return this.decode(await this.db.findingSourceExcerpt.findUniqueOrThrow({ where: { id: row.id } }))
  }
  /** Build display snapshots from the exact verified upload before publishing findings. */
  async prepareSnapshots(repositoryId:string, source:NativeSourceBundle, findings:SourceLocation[]):Promise<FindingSourceSnapshot[]> {
    const repo=await this.activeRepository({repositoryId})
    if(String(repo.githubId)!==source.repositoryId)throw new ConflictException('Source repository mismatch')
    const verified=verifyNativeSourceBundle(source)
    const files=new Map(verified.files.map(file=>[file.path,file]))
    const lines=new Map<string,string[]>()
    const snapshots:FindingSourceSnapshot[]=[]
    for(const location of findingSourceLocations(repositoryId,verified.sourceSha,findings)) {
      const file=files.get(location.path)
      if(!file)continue
      if(!lines.has(file.path))lines.set(file.path,redactHealthSource(Buffer.from(file.content,'base64').toString('utf8')).split('\n'))
      const content=sourceExcerptLines(lines.get(file.path)!,location.line,location.endLine,location.contextLines)
      if(location.version===SECRET_SOURCE_EXCERPT_VERSION)for(const line of content.lines)if(location.line!==null && line.number>=location.line && line.number<=(location.endLine??location.line))line.text='[Potential credential redacted]'
      snapshots.push({...location,content,contentHash:digest(content)})
    }
    await this.activeRepository({repositoryId})
    return snapshots
  }
  /** A report and its bounded excerpts commit together; the first snapshot wins. */
  async saveSnapshots(tx:Prisma.TransactionClient,snapshots:FindingSourceSnapshot[]) {
    if(!snapshots.length)return
    for(const repositoryId of new Set(snapshots.map(row=>row.repositoryId))) {
      if(!await tx.gitHubRepository.findFirst({where:{id:repositoryId,selected:true,available:true,installation:{active:true}}}))throw new ForbiddenException('Repository access is unavailable')
    }
    for(let offset=0;offset<snapshots.length;offset+=100)await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FindingSourceExcerpt" (id,"repositoryId","sourceSha",path,line,"endLine","contextLines",version,content,"contentHash","capturedAt")
      SELECT x.id,x."repositoryId",x."sourceSha",x.path,x.line,x."endLine",x."contextLines",x.version,x.content,x."contentHash",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(${JSON.stringify(snapshots.slice(offset,offset+100))}::jsonb)
        AS x(id text,"repositoryId" text,"sourceSha" text,path text,line integer,"endLine" integer,"contextLines" integer,version integer,content jsonb,"contentHash" text)
      ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content,"contentHash"=EXCLUDED."contentHash","capturedAt"=EXCLUDED."capturedAt"
      WHERE "FindingSourceExcerpt"."contentHash" IS NULL
    `)
  }
  async captureSnapshot(repositoryId:string,source:NativeSourceBundle,findings:SourceLocation[]) {
    const snapshots=await this.prepareSnapshots(repositoryId,source,findings)
    await this.db.$transaction(tx=>this.saveSnapshots(tx,snapshots))
  }
  async reconcile() {
    const pending = await this.db.findingSourceExcerpt.findMany({ where: { version: { in: [SOURCE_EXCERPT_VERSION, SECRET_SOURCE_EXCERPT_VERSION] }, contentHash: null, attempts: { lt: 3 }, retryAfter: { lte: new Date() }, repository: { selected: true, available: true, installation: { active: true } } }, orderBy: { createdAt: 'asc' }, take: 10 })
    const files = new Map<string, Promise<string>>()
    // Limit concurrent distinct files, and coalesce findings at the same file/revision.
    for (let offset = 0; offset < pending.length; offset += 2) await Promise.all(pending.slice(offset, offset + 2).map(row => this.capture(row, files)))
  }
}
