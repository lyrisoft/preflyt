import { currentStandards, repositoryStandards } from '../standards/policy-standards.js'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { draftDefinition, draftHash, type DraftInput } from './ruleset-draft.js'
@Injectable()
export class RulesetDraftService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  async list(session: AuthenticatedSession, githubId: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid draft page')
    const repo = await this.access.requireRepository(
      session,
      githubId,
      'policy.read',
    )
    const [drafts, selection] = await Promise.all([
      this.prisma.gitHubRulesetDraft.findMany({
        where: {
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 21,
      }),
      repositoryStandards(this.prisma, repo.id),
    ])
    await this.access.requireRepository(session, githubId, 'policy.read')
    return {
      drafts: drafts.slice(0, 20),
      hasMore: drafts.length > 20,
      page,
      selection: selection
        ? {
            id: selection.id,
            revision: selection.revision,
            packs: selection.packs,
          }
        : null,
      activationAvailable: false,
    }
  }
  async detail(session: AuthenticatedSession, githubId: string, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
      throw new BadRequestException('Invalid draft ID')
    const repo = await this.access.requireRepository(
      session,
      githubId,
      'policy.read',
    )
    const [draft, selection] = await Promise.all([
      this.prisma.gitHubRulesetDraft.findFirst({
        where: {
          id,
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
      }),
      repositoryStandards(this.prisma, repo.id),
    ])
    await this.access.requireRepository(session, githubId, 'policy.read')
    if (!draft) throw new NotFoundException('Draft is unavailable')
    return {
      draft,
      selection: selection
        ? {
            id: selection.id,
            revision: selection.revision,
            packs: selection.packs,
          }
        : null,
    }
  }
  async preview(
    session: AuthenticatedSession,
    githubId: string,
    input: DraftInput,
  ) {
    const definition = draftDefinition(input, githubId)
    const repo = await this.access.requireRepository(
      session,
      githubId,
      'policy.draft',
    )
    const selection = await currentStandards(this.prisma, repo.id, { expectedId: input.expectedSelectionId ?? undefined, branchRef: input.branches[0]?.startsWith("refs/heads/") ? input.branches[0] : `refs/heads/${input.branches[0]}` })
    this.assertSelection(input, selection?.id ?? null)
    await this.access.requireRepository(session, githubId, 'policy.draft')
    return {
      definition,
      definitionHash: draftHash({
        definition,
        selectionId: selection?.id ?? null,
        packs: selection?.packs ?? [],
      }),
      selection: selection
        ? {
            id: selection.id,
            revision: selection.revision,
            packs: selection.packs,
          }
        : null,
      activationAvailable: false,
      checkSourceVerified: false,
    }
  }
  private assertSelection(input: DraftInput, current: string | null) {
    if (
      input.expectedSelectionId !== null &&
      (typeof input.expectedSelectionId !== 'string' ||
        !input.expectedSelectionId ||
        input.expectedSelectionId.length > 80)
    )
      throw new BadRequestException('Invalid standards selection')
    if (current !== input.expectedSelectionId)
      throw new ConflictException(
        'Standards changed. Reload the preview before saving.',
      )
  }
  async save(
    session: AuthenticatedSession,
    githubId: string,
    input: DraftInput,
    edit?: { id: string; expectedHash: string },
  ) {
    const definition = draftDefinition(input, githubId)
    if (
      input.expectedSelectionId !== null &&
      (typeof input.expectedSelectionId !== 'string' ||
        !input.expectedSelectionId ||
        input.expectedSelectionId.length > 80)
    )
      throw new BadRequestException('Invalid standards selection')
    if (
      edit &&
      (!/^[a-zA-Z0-9_-]{1,80}$/.test(edit.id) ||
        !/^[a-f0-9]{64}$/.test(edit.expectedHash))
    )
      throw new BadRequestException('Invalid draft version')
    await this.access.requireRepository(session, githubId, 'policy.draft')
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const repo = await new AuthorizationService(
            tx as PrismaService,
          ).requireRepository(session, githubId, 'policy.draft')
          const selection = await currentStandards(tx, repo.id, { expectedId: input.expectedSelectionId ?? undefined, branchRef: input.branches[0]?.startsWith("refs/heads/") ? input.branches[0] : `refs/heads/${input.branches[0]}` })
          this.assertSelection(input, selection?.id ?? null)
          const hash = draftHash({
            definition,
            selectionId: selection?.id ?? null,
            packs: selection?.packs ?? [],
          })
          const data = {
            name: definition.name,
            profile: input.profile,
            options: {
              name: definition.name,
              profile: input.profile,
              branches: [...input.branches],
              approvals: input.approvals,
              requirePullRequest: input.requirePullRequest,
              resolveConversations: input.resolveConversations,
              preventForcePush: input.preventForcePush,
              preventDeletion: input.preventDeletion,
              expectedSelectionId: input.expectedSelectionId,
            },
            definition: JSON.parse(JSON.stringify(definition)),
            definitionHash: hash,
            selectionId: selection?.id ?? null,
            packs: selection?.packs ?? [],
            draftedById: session.identityId,
          }
          let previous: { definitionHash: string; revision: number } | null =
            null
          let draft
          if (edit) {
            previous = await tx.gitHubRulesetDraft.findFirst({
              where: {
                id: edit.id,
                repositoryId: repo.id,
                organizationId: session.organizationId!,
              },
            })
            if (!previous) throw new NotFoundException('Draft is unavailable')
            if (previous.definitionHash !== edit.expectedHash)
              throw new ConflictException(
                'This draft changed. Reload before saving.',
              )
            draft = await tx.gitHubRulesetDraft.update({
              where: { id: edit.id },
              data: { ...data, revision: { increment: 1 } },
            })
          } else
            draft = await tx.gitHubRulesetDraft.create({
              data: {
                ...data,
                repositoryId: repo.id,
                organizationId: session.organizationId!,
              },
            })
          await tx.auditEvent.create({
            data: {
              event: edit
                ? 'github.ruleset_draft_updated'
                : 'github.ruleset_draft_created',
              actorId: session.identityId,
              metadata: {
                organizationId: session.organizationId!,
                repositoryGithubId: githubId,
                draftId: draft.id,
                previousHash: previous?.definitionHash ?? null,
                definitionHash: hash,
                revision: draft.revision,
                enforcement: 'disabled',
              },
            },
          })
          return draft
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034')
        throw new ConflictException(
          'Draft or access changed. Reload and try again.',
        )
      throw error
    }
  }
}
