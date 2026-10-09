import { executionContracts } from './execution-contract.js'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  posture,
  resolvePacks,
  type PackRef,
  type AdoptionProfile,
} from '../standards/catalogue.js'
import type { Binding } from './ci-binding.js'
@Injectable()
export class CiBindingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async repository(id: string) {
    if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new ForbiddenException('Repository is unavailable')
    const repo = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(id),
        selected: true,
        available: true,
        installation: { active: true },
      },
    })
    if (!repo) throw new ForbiddenException('Repository is unavailable')
    return repo
  }
  async get(id: string) {
    const repo = await this.repository(id)
    const [selection, binding] = await Promise.all([
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
      this.prisma.repositoryCiBindings.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
    ])
    const contracts = executionContracts()
    return {
      supportedRuleIds: selection
        ? posture(
            selection.packs as unknown as PackRef[],
            selection.profile as AdoptionProfile,
            [],
          )
            .filter(
              (c) =>
                c.capability === 'import_only' ||
                contracts?.contracts.some(
                  (contract) => contract.ruleId === c.id,
                ),
            )
            .map((c) => c.id)
        : [],
      binding,
      active: !!binding && binding.selectionId === selection?.id,
      trust: 'APPROVED_SOURCE_IDENTITY_ONLY',
      qualityGate: null,
    }
  }
  async save(
    id: string,
    input: {
      expectedSelectionId: string
      expectedBindingId: string | null
      bindings: Binding[]
    },
    actorId: string,
  ) {
    const repo = await this.repository(id)
    if (
      new Set(input.bindings.map((b) => b.ruleId)).size !==
      input.bindings.length
    )
      throw new BadRequestException('Only one binding per rule is allowed')
    for (const b of input.bindings) {
      if (!['check_run', 'workflow_run'].includes(b.kind))
        throw new BadRequestException('Unsupported CI source kind')
      const check = b.kind === 'check_run'
      const numeric = check ? b.appId : b.workflowId
      if (
        !numeric ||
        !/^[1-9]\d{0,15}$/.test(numeric) ||
        !Number.isSafeInteger(Number(numeric)) ||
        (check
          ? typeof b.checkName !== 'string' ||
            !b.checkName.length ||
            b.checkName.length > 256 ||
            /[\x00-\x1f\x7f]/.test(b.checkName) ||
            b.workflowId !== undefined
          : b.appId !== undefined || b.checkName !== undefined)
      )
        throw new BadRequestException('Invalid exact CI source identity')
    }
    return this.prisma.$transaction(async (tx) => {
      const installation = await tx.gitHubInstallation.updateMany({
        where: { id: repo.installationId, active: true },
        data: { active: true },
      })
      const selected = await tx.gitHubRepository.updateMany({
        where: {
          id: repo.id,
          installationId: repo.installationId,
          selected: true,
          available: true,
        },
        data: { selected: true },
      })
      if (!installation.count || !selected.count)
        throw new ForbiddenException('Repository access changed')
      const selection = await tx.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      })
      const previous = await tx.repositoryCiBindings.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      })
      if (
        !selection ||
        selection.id !== input.expectedSelectionId ||
        (previous?.id ?? null) !== input.expectedBindingId
      )
        throw new ConflictException('Reload current standards and bindings')
      const refs = selection.packs as unknown as (PackRef & {
        digest: string
      })[]
      if (resolvePacks(refs).some((p, i) => !p || p.digest !== refs[i].digest))
        throw new ConflictException('Adopted pack integrity changed')
      const controls = posture(refs, selection.profile as AdoptionProfile, [])
      if (
        input.bindings.some(
          (b) =>
            !controls.some(
              (c) =>
                c.id === b.ruleId &&
                (c.capability === 'import_only' ||
                  executionContracts()?.contracts.some(
                    (contract) => contract.ruleId === c.id,
                  )),
            ),
        )
      )
        throw new BadRequestException(
          'Choose an adopted rule supporting imported evidence',
        )
      const binding = await tx.repositoryCiBindings.create({
        data: {
          repositoryId: repo.id,
          revision: (previous?.revision ?? 0) + 1,
          selectionId: selection.id,
          bindings: input.bindings
            .map((b) => ({ ...b }))
            .sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'ci_bindings.adopted',
          actorId,
          metadata: {
            repositoryId: id,
            bindingId: binding.id,
            revision: binding.revision,
            selectionId: selection.id,
            count: input.bindings.length,
          },
        },
      })
      return binding
    })
  }
}
