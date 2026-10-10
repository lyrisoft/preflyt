import { inheritedTeamStandards } from '../teams/team-context.js'
import { composeTeamStandards } from '../teams/team-composition.js'
import { organizationCatalogue } from './organization-standards.service.js'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { ProfileSignal } from '../github/repository-profile.js'
import {
  adoptionProfiles,
  catalogue,
  catalogueVersions,
  posture,
  recommend,
  resolvePacks,
  type AdoptionProfile,
  type PackRef,
} from './catalogue.js'
export type SelectionInput = {
  profile: AdoptionProfile
  packs: PackRef[]
  expectedSelectionId: string | null
}
@Injectable()
export class StandardsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async repository(id: string) {
    if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new ForbiddenException('Repository is unavailable')
    const repository = await this.prisma.gitHubRepository.findFirst({
      include: { installation: true },
      where: {
        githubId: BigInt(id),
        selected: true,
        installation: { active: true },
      },
    })
    if (!repository) throw new ForbiddenException('Repository is unavailable')
    return repository
  }
  async get(id: string) {
    const repo = await this.repository(id)
    const [selection, snapshot] = await Promise.all([
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
      this.prisma.repositoryProfile.findFirst({
        where: { repositoryId: repo.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])
    const customVersions = repo.installation.organizationId
      ? await organizationCatalogue(
          this.prisma,
          repo.installation.organizationId,
        )
      : []
    const latest = new Map<string, (typeof customVersions)[number]>()
    for (const version of customVersions)
      if (!latest.has(version.id)) latest.set(version.id, version)
    const selectedRefs = selection?.packs as unknown as PackRef[] | undefined
    const selectedCustom = (selectedRefs ?? []).flatMap((ref) =>
      resolvePacks([ref]).filter((pack) => !!pack),
    )
    const library = [
      ...catalogue,
      ...latest.values(),
      ...selectedCustom.filter(
        (pack) =>
          ![...catalogue, ...latest.values()].some(
            (v) => v.id === pack.id && v.version === pack.version,
          ),
      ),
    ]
    const checked = await this.repository(id)
    if (
      checked.id !== repo.id ||
      checked.installationId !== repo.installationId ||
      checked.installation.organizationId !== repo.installation.organizationId
    )
      throw new ForbiddenException('Repository access changed')
    const signals =
      (snapshot?.report as { signals?: ProfileSignal[] } | undefined)
        ?.signals ?? []
    const recommendations = recommend(signals)
    const refs = selection
      ? (selection.packs as unknown as PackRef[])
      : recommendations.map(({ id, version }) => ({ id, version }))
    const selectionIntegrity =
      !selection ||
      (selection.packs as unknown as (PackRef & { digest: string })[]).every(
        (ref) => {
          const pack = resolvePacks([ref])[0]
          return !!pack && pack.digest === ref.digest
        },
      )
    return {
      catalogue: library,
      adoptionProfiles,
      selection,
      selectionIntegrity,
      recommendations,
      scope: {
        organization: 'deployment',
        repositoryId: id,
        branches: 'all',
        enforcement: 'observe',
      },
      profileSnapshot: snapshot
        ? {
            id: snapshot.id,
            sourceSha: snapshot.sourceSha,
            complete: snapshot.complete,
            createdAt: snapshot.createdAt,
          }
        : null,
      previewProfile: selection?.profile ?? 'RECOMMENDED',
      controls: selectionIntegrity
        ? posture(
            refs,
            (selection?.profile ?? 'RECOMMENDED') as AdoptionProfile,
            signals,
          )
        : [],
      qualityGate: null,
    }
  }
  async assign(id: string, input: SelectionInput, actorId: string) {
    if (
      !adoptionProfiles.includes(input.profile) ||
      !Array.isArray(input.packs) ||
      input.packs.length < 1 ||
      input.packs.length > 5 ||
      new Set(input.packs.map((p) => p.id)).size !== input.packs.length ||
      input.packs.some(
        (p) => !p || typeof p.id !== 'string' || typeof p.version !== 'string',
      )
    )
      throw new BadRequestException(
        'Choose unique supported pack versions and a valid profile',
      )
    const repo = await this.repository(id)
    return this.prisma.$transaction(async (tx) => {
      if (
        !(
          await tx.gitHubInstallation.updateMany({
            where: {
              id: repo.installationId,
              active: true,
              organizationId: repo.installation.organizationId,
            },
            data: { active: true },
          })
        ).count ||
        !(
          await tx.gitHubRepository.updateMany({
            where: {
              id: repo.id,
              installationId: repo.installationId,
              selected: true,
            },
            data: { selected: true },
          })
        ).count
      )
        throw new ForbiddenException('Repository access changed')
      const previous = await tx.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      })
      if ((previous?.id ?? null) !== input.expectedSelectionId)
        throw new ConflictException(
          'Standards selection changed; reload before saving',
        )
      const snapshot = await tx.repositoryProfile.findFirst({
        where: { repositoryId: repo.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      const library = [
        ...catalogueVersions,
        ...(repo.installation.organizationId
          ? await organizationCatalogue(tx, repo.installation.organizationId)
          : []),
      ]
      const requested = input.packs.map((ref) =>
        library.find((p) => p.id === ref.id && p.version === ref.version),
      )
      if (requested.some((p) => !p))
        throw new BadRequestException(
          'Choose a supported standard version from this organization',
        )
      // Freeze complete custom definitions so later edits cannot change historical evaluation.
      const frozen = requested
        .map((pack) => ({
          id: pack!.id,
          version: pack!.version,
          digest: pack!.digest,
          ...(pack!.id.startsWith('org-standard-')
            ? {
                definition: Object.fromEntries(
                  Object.entries(pack!).filter(
                    ([key]) => !['versionId', 'createdAt'].includes(key),
                  ),
                ),
              }
            : {}),
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
      const inherited = await inheritedTeamStandards(
        tx,
        repo.id,
        repo.installation.organizationId,
      )
      const composed = composeTeamStandards([
        ...inherited.sources,
        {
          label: 'Repository selection',
          profile: input.profile,
          packs: frozen as unknown as (PackRef & { digest: string })[],
        },
      ])
      if (
        composed.conflicts.length ||
        composed.profile !== input.profile ||
        composed.packs.some(
          (ref) =>
            !frozen.some(
              (p) =>
                p.id === ref.id &&
                p.version === ref.version &&
                p.digest === ref.digest,
            ),
        )
      )
        throw new ConflictException(
          'Keep the required team standard versions and profile. Change team policy scope through Teams, then preview again.',
        )
      posture(frozen as unknown as PackRef[], input.profile, [])
      const saved = await tx.repositoryStandardsSelection.create({
        data: {
          repositoryId: repo.id,
          revision: (previous?.revision ?? 0) + 1,
          profile: input.profile,
          packs: frozen,
          selectedById: actorId,
          ...(inherited.context.length
            ? { teamContext: inherited.context }
            : {}),
          profileSnapshotId: snapshot?.id,
          sourceSha: snapshot?.sourceSha,
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'standards.selection.assigned',
          actorId,
          metadata: {
            repositoryId: id,
            selectionId: saved.id,
            revision: saved.revision,
            profile: input.profile,
            packs: frozen,
            enforcement: 'observe',
            sourceSha: snapshot?.sourceSha ?? null,
          },
        },
      })
      return saved
    })
  }
}
