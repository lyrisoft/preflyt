import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { PARSER_VERSION, parseArtifact } from './ci-artifact-parser.js'

export const artifactSummarySelect = { id: true, format: true, sha256: true, parserVersion: true,
  verification: true, summary: true, createdAt: true } as const

@Injectable()
export class CiArtifactService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async import(repositoryId: string, deliveryId: string, body: { format: unknown; content: unknown; sha256: unknown }, actorId: string) {
    if (!/^[1-9][0-9]{0,15}$/.test(repositoryId) || !Number.isSafeInteger(Number(repositoryId)))
      throw new ForbiddenException('Repository is unavailable')
    const parsed = parseArtifact(body.format, body.content, body.sha256)
    return this.prisma.$transaction(async tx => {
      const repository = await tx.gitHubRepository.findFirst({ where: { githubId: BigInt(repositoryId), selected: true, installation: { active: true } } })
      if (!repository) throw new ForbiddenException('Repository is unavailable')
      // Lock access rows and observation, serializing revocation and per-observation quotas.
      if (!(await tx.gitHubInstallation.updateMany({ where: { id: repository.installationId, active: true }, data: { active: true } })).count ||
          !(await tx.gitHubRepository.updateMany({ where: { id: repository.id, selected: true, installationId: repository.installationId }, data: { selected: true } })).count)
        throw new ForbiddenException('Repository is unavailable')
      await tx.$queryRaw`SELECT "deliveryId" FROM "ImportedCiEvidence" WHERE "deliveryId" = ${deliveryId} FOR UPDATE`
      const evidence = await tx.importedCiEvidence.findFirst({ where: { deliveryId, repositoryGithubId: repository.githubId, installationId: repository.installationId } })
      if (!evidence) throw new NotFoundException('CI observation is unavailable')
      if (evidence.sourceStatus !== 'completed' || evidence.sourceAction !== 'completed')
        throw new BadRequestException('A completed CI observation is required')
      const where = { deliveryId_format_sha256: { deliveryId, format: parsed.format, sha256: parsed.sha256 } }
      const existing = await tx.ciArtifactImport.findUnique({ where, select: artifactSummarySelect })
      if (existing) return { artifact: existing, duplicate: true }
      if (await tx.ciArtifactImport.count({ where: { deliveryId } }) >= 10)
        throw new HttpException('CI observation artifact limit reached', 429)
      const artifact = await tx.ciArtifactImport.create({ data: { deliveryId, format: parsed.format,
        sha256: parsed.sha256, parserVersion: PARSER_VERSION, content: parsed.bytes, summary: parsed.summary, uploadedById: actorId }, select: artifactSummarySelect })
      await tx.auditEvent.create({ data: { event: 'ci.artifact.imported', actorId, metadata: {
        artifactId: artifact.id, deliveryId, repositoryId, sourceSha: evidence.sourceSha,
        sha256: parsed.sha256, format: parsed.format, verification: artifact.verification,
      } } })
      return { artifact, duplicate: false }
    })
  }
}
