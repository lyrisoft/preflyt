import type { ProviderUsage } from "./skill-inference.js";
import { actionableFindings, conciseReviewSummary } from "./pr-review-feedback.js";
import { aiReviewFindingRows, sameReviewedPrRevision } from '../findings/ai-review-findings.js';
import { currentStandards } from "../standards/policy-standards.js";
import { effectiveAiRoute } from "./effective-ai-route.js";
import {
  recordAiInferenceOutcome,
  recordAiInferenceOutcomeInTransaction,
} from "../notifications/ai-notification.js";
import { AiTransportError } from "./ai-http.js";
import { configurationValue } from "../configuration/runtime-configuration.js";
import { skillApplicability } from "./skill-applicability.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { readPullRequestContext } from "../github-events/pull-request-context.js";
import { sameReviewPr, publicPrSource } from "./pr-review-context.js";
import { verifyTeamContext } from "../teams/team-context.js";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { AssessmentService } from "../assessments/assessment.service.js";
import { digest } from "../assessments/assessment-digest.js";
import { AiConfigurationService } from "./ai-configuration.service.js";
import {
  aiReviewsEnabled,
  endpointDigest,
  providerEndpoint,
} from "./ai-configuration.js";
import {
  reviewContext,
  reviewOutputFailureMessages,
  skillDigest,
  type ReviewContext,
} from "./review-skills.js";
import { AiResponseError, aiResponseTokenLimit, runSkillInference } from "./skill-inference.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  AiReviewSkill,
  AiProviderConnection,
} from "../generated/prisma/client.js";
import { assessmentAiChecks, type AiCheck } from "../standards/catalogue.js";
const reviewTasks = (checks: AiCheck[], skills: AiReviewSkill[]) =>
  checks.map((check) => {
    const skill = skills.find((s) => s.id === check.skillId);
    if (!skill) throw new Error("Assigned skill unavailable");
    return {
      id: check.id,
      version: skill.version,
      instructions: skill.instructions,
      checkTitle: check.title,
    };
  });
const automaticReviewKey = (organizationId: string, repositoryId: string,
  automatic: NonNullable<Snapshot['automatic']>, routeRevision: number, checks: AiCheck[]) => digest({
  organizationId, repositoryId, number: automatic.number, context: automatic.context,
  policyHash: automatic.policyHash, routeRevision,
  ...(automatic.repositoryRevision !== undefined ? { repositoryRevision: automatic.repositoryRevision } : {}), checks,
});
export const skillReviewsEnabled = aiReviewsEnabled;
type Snapshot = {
  reviewContractVersion?: 2;
  automatic?: {
    key: string;
    policyId: string;
    policyHash: string;
    repositoryRevision?: number;
    number: number;
    context: NonNullable<ReturnType<typeof readPullRequestContext>>;
  };
  context: ReviewContext;
  skills: AiReviewSkill[];
  checks: AiCheck[];
  route: { id: string; revision: number };
  providers: { id: string; revision: number; endpointDigest: string }[];
};
const publicReview = (r: any, allowUsage = false) => ({
  id: r.id,
  automatic: !!(r.snapshot as Snapshot).automatic,
  feedbackState: r.feedbackState,
  feedbackUrl: r.feedbackUrl,
  inlineFeedbackUrl: r.inlineFeedbackUrl,
  sourceReviewed: !!(r.snapshot as Snapshot).context.source,
  assessmentId: r.assessmentId,
  state: r.state,
  failure: r.failure,
  providerId: r.providerId,
  result: r.result,
  latencyMs: r.latencyMs,
  usage:
    allowUsage && Array.isArray(r.usage)
      ? r.usage.map(
          ({ providerId, inputTokens, outputTokens, cachedTokens }: any) => ({
            providerId,
            inputTokens,
            outputTokens,
            cachedTokens,
          }),
        )
      : null,
  createdAt: r.createdAt,
  finishedAt: r.finishedAt,
  checks: (r.snapshot as Snapshot).checks ?? [],
  skills: (r.snapshot as Snapshot).skills.map((s) => ({
    id: s.id,
    name: s.name,
    version: s.version,
    digest: s.contentDigest,
  })),
});
@Injectable()
export class SkillReviewService {
  private closing = false;
  private abort = new AbortController();
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(AssessmentService) private readonly assessments: AssessmentService,
    @Inject(AiConfigurationService)
    private readonly configuration: AiConfigurationService,
    @Optional()
    @Inject(GitHubProviderService)
    private readonly github?: GitHubProviderService,
  ) {}
  close() {
    this.closing = true;
    this.abort.abort();
  }
  private async profile(
    record: { request: unknown; sourceSha: string },
    repositoryId: string,
  ) {
    const id = (record.request as { profileSnapshotId?: string })
      ?.profileSnapshotId;
    return id
      ? this.db.repositoryProfile.findFirst({
          where: { id, repositoryId, sourceSha: record.sourceSha },
        })
      : null;
  }
  async list(
    session: AuthenticatedSession,
    repoId: string,
    assessmentId: string,
  ) {
    if (
      typeof assessmentId !== "string" ||
      !assessmentId ||
      assessmentId.length > 100
    )
      throw new BadRequestException("Choose an assessment");
    const repo = await this.access.requireRepository(
      session,
      repoId,
      "assessment.read",
    );
    const assessment = await this.assessments.get(repoId, assessmentId);
    const stage =
      (assessment.request as { subjectKind?: string }).subjectKind ===
      "PULL_REQUEST"
        ? "pull_request"
        : "repository";
    const assigned = assessmentAiChecks(assessment.plan, stage);
    const live = await this.db.aiReviewSkill.findMany({
      where: {
        organizationId: session.organizationId!,
        id: { in: assigned.map((c) => c.skillId) },
        status: "APPROVED",
        enabled: true,
      },
    });
    const profile = await this.profile(assessment, repo.id);
    const checks = assigned.map((c) => ({
      selection: skillApplicability(
        live.find((s) => s.id === c.skillId) ?? {},
        profile,
        assessment.sourceSha,
      ),
      ...c,
      available: live.some(
        (s) =>
          s.id === c.skillId &&
          s.version === c.skillVersion &&
          s.contentDigest === c.skillDigest &&
          skillDigest(s) === c.skillDigest &&
          (!s.repositories.length || s.repositories.includes(repoId)) &&
          skillApplicability(s, profile, assessment.sourceSha).eligible,
      ),
    }));
    const prNumber = (assessment.request as any)?.pullRequest?.number;
    const prContext = readPullRequestContext((assessment.request as any)?.pullRequest);
    const related = stage === 'pull_request' && Number.isSafeInteger(prNumber) && prNumber > 0 &&
      !!prContext && prContext.head.sha === assessment.sourceSha;
    const records = await this.db.aiSkillReview.findMany({
      where: {
        organizationId: session.organizationId!,
        repositoryId: repo.id,
        ...(related ? { OR: [{ assessmentId }, { stage: 'pull_request',
          assessment: { sourceSha: assessment.sourceSha,
            AND: [
              { request: { path: ['pullRequest', 'number'], equals: prNumber } },
              ...(['head', 'base'] as const).flatMap(side => (['repositoryId', 'ref', 'sha'] as const).map(field =>
                ({ request: { path: ['pullRequest', side, field], equals: prContext![side][field] } }))),
            ] } }] } : { assessmentId }),
      },
      include: { assessment: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    await this.access.requireRepository(session, repoId, "assessment.read");
    let allowUsage = false;
    try {
      await this.access.requireOrganization(session, "ai.usage.read");
      allowUsage = true;
    } catch {}
    return {
      enabled: skillReviewsEnabled(),
      reviews: records.filter(r => r.assessmentId === assessmentId ||
        (related && r.assessment.repositoryId === repo.id && sameReviewedPrRevision(r.assessment, assessment)))
         .map(r => {
          const output = publicReview(r, allowUsage);
          const rows = aiReviewFindingRows(r, repo);
          return { ...output, relatedAssessment: r.assessmentId !== assessmentId,
            result: output.result && typeof output.result === 'object' ? {
              ...output.result as any,
              findings: ((output.result as any).findings ?? []).map((finding: any) => ({ ...finding,
                findingId: rows.find(row => row.ruleId === finding.checkId && row.title === finding.summary &&
                  row.recommendation === finding.recommendation && Array.isArray(finding.evidenceRefs) &&
                  digest([...row.evidence].sort()) === digest([...finding.evidenceRefs].sort()))?.id ?? null,
              })),
            } : output.result,
          };
        }),
      checks,
    };
  }
  async request(
    session: AuthenticatedSession,
    repoId: string,
    assessmentId: string,
    checkIds: string[],
    options: {
      includeSource?: boolean;
      automatic?: Snapshot["automatic"];
      retryUnavailable?: boolean;
    } = {},
  ) {
    if (!skillReviewsEnabled())
      throw new ServiceUnavailableException(
        "AI reviews are disabled for this deployment",
      );
    const repo = await this.access.requireRepository(
      session,
      repoId,
      "ai.review.run",
    );
    const record = await this.assessments.get(repoId, assessmentId),
      context = reviewContext(record);
    const stage =
      (record.request as { subjectKind?: string }).subjectKind ===
      "PULL_REQUEST"
        ? "pull_request"
        : "repository";
    const assigned = assessmentAiChecks(record.plan, stage);
    const checks = assigned
      .filter((c) => checkIds.includes(c.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (
      !checks.length ||
      checks.length > 3 ||
      checks.length !== checkIds.length ||
      new Set(checkIds).size !== checkIds.length
    )
      throw new BadRequestException(
        "Choose up to three AI reviews from this assessment’s saved standards",
      );
    const skillIds = [...new Set(checks.map((c) => c.skillId))];
    const skills = await this.db.aiReviewSkill.findMany({
      where: {
        organizationId: session.organizationId!,
        id: { in: skillIds },
        status: "APPROVED",
        enabled: true,
      },
    });
    if (
      !skills.length ||
      skills.length !== new Set(skillIds).size ||
      skills.length > 3 ||
      skillIds.length !== skills.length ||
      skills.some(
        (s) =>
          (s.repositories.length && !s.repositories.includes(repoId)) ||
          s.contentDigest !== skillDigest(s) ||
          checks.some(
            (c) =>
              c.skillId === s.id &&
              (c.skillVersion !== s.version ||
                c.skillDigest !== s.contentDigest),
          ),
      )
    )
      throw new BadRequestException(
        "An assigned skill version is unavailable. Ask an admin to check its approval and enablement",
      );
    const profile = await this.profile(record, repo.id);
    if (
      skills.some(
        (s) => !skillApplicability(s, profile, record.sourceSha).eligible,
      )
    )
      throw new BadRequestException(
        "The skill language/framework scope does not match this commit. Inspect the skipped review or refresh the repository profile.",
      );
    skills.sort((a, b) => a.id.localeCompare(b.id));
    let route = await effectiveAiRoute(
      this.db,
      session.organizationId!,
      stage,
    );
    if (!route?.enabled)
      throw new ConflictException(
        "Choose an enabled default model in Model Router",
      );
    if (options.automatic?.repositoryRevision !== undefined) {
      const config = await this.db.readinessAutomation.findUnique({ where: { repositoryId: repo.id } });
      if (!config?.aiReviews || config.revision !== options.automatic.repositoryRevision || config.actorId !== session.identityId || !route.allowSource)
        throw new ConflictException("Repository PR reviews are disabled or changed");
      route = { ...route, automaticReviews: true, publishSummary: false, publishInline: true };
    }
    if (
      options.automatic &&
      (!route.automaticReviews || stage !== "pull_request")
    )
      throw new ConflictException("Automatic PR reviews are disabled");
    if (options.automatic) {
      const existing = await this.db.aiSkillReview.findUnique({
        where: { automaticKey: options.automatic.key },
      });
      if (existing && (!options.retryUnavailable || existing.state !== 'UNAVAILABLE')) return publicReview(existing);
    }
    if (options.includeSource) {
      const pr = (record.request as { pullRequest?: { number?: number } })
        .pullRequest;
      const expected = readPullRequestContext(pr);
      if (
        !route.allowSource ||
        stage !== "pull_request" ||
        !expected ||
        expected.head.sha !== record.sourceSha ||
        !pr?.number ||
        !this.github
      )
        throw new ConflictException(
          "Enable PR source sharing and choose a current PR assessment before reviewing code",
        );
      context.source = await this.github.readPrReviewSource(
        repo.installationId,
        repo.githubId,
        pr.number,
        expected,
      );
    }
    const providers: AiProviderConnection[] = [];
    for (const id of [route.primaryId, route.fallbackId]) {
      if (!id) continue;
      const p = await this.db.aiProviderConnection.findFirst({
        where: { id, organizationId: session.organizationId! },
      });
      if (p && this.configuration.ready(p)) providers.push(p);
    }
    if (!providers.length)
      throw new ConflictException(
        "Test and enable a model connection before running reviews",
      );
    const snapshot: Snapshot = {
      reviewContractVersion: 2,
      ...(options.automatic ? { automatic: options.automatic } : {}),
      context,
      skills,
      checks,
      route: { id: route.id, revision: route.revision },
      providers: providers.map((p) => ({
        id: p.id,
        revision: p.revision,
        endpointDigest: endpointDigest(providerEndpoint(p)!),
      })),
    };
    const fingerprint = digest(snapshot);
    try {
      const review = await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            repoId,
            "ai.review.run",
          );
          const automaticDuplicate = options.automatic
            ? await tx.aiSkillReview.findUnique({
                where: { automaticKey: options.automatic.key },
              })
            : null;
          if (automaticDuplicate && (!options.retryUnavailable || automaticDuplicate.state !== 'UNAVAILABLE')) return automaticDuplicate;
          const existing = automaticDuplicate ?? await tx.aiSkillReview.findUnique({
            where: {
              organizationId_actorId_fingerprint: {
                organizationId: session.organizationId!,
                actorId: session.identityId,
                fingerprint,
              },
            },
          });
          if (existing && (existing.state !== "UNAVAILABLE" || (options.automatic && !options.retryUnavailable))) return existing;
          if (existing && existing.fingerprint !== fingerprint)
            throw new ConflictException('Review configuration changed. Reload and retry.');
          if (
            (await tx.auditEvent.count({
              where: {
                event: "ai.review.requested",
                metadata: { path: ["organizationId"], equals: session.organizationId! },
                createdAt: { gt: new Date(Date.now() - 3600000) },
              },
            })) >= 20
          )
            throw new HttpException("Hourly review limit reached", 429);
          for (const s of skills)
            if (
              !(await tx.aiReviewSkill.findFirst({
                where: {
                  id: s.id,
                  organizationId: session.organizationId!,
                  enabled: true,
                  status: "APPROVED",
                  contentDigest: s.contentDigest,
                },
              }))
            )
              throw new ConflictException(
                "Skill changed before review admission",
              );
          const effective = await effectiveAiRoute(
            tx as PrismaService,
            session.organizationId!,
            stage,
          );
          if (
            effective?.id !== route.id ||
            effective.revision !== route.revision ||
            !(await tx.aiStageRoute.findFirst({
              where: {
                id: route.id,
                organizationId: session.organizationId!,
                revision: route.revision,
                enabled: true,
              },
            }))
          )
            throw new ConflictException(
              "Route changed before review admission",
            );
          if (options.automatic) await this.currentPolicy(session, repoId, snapshot, tx as PrismaService);
          // An explicit manual retry reuses the pinned job after admission checks.
          // Successful/running reviews and automatic polling remain idempotent.
          const result = existing ? await tx.aiSkillReview.update({
            where: { id: existing.id },
            data: { state: "QUEUED", failure: null, result: Prisma.JsonNull, usage: Prisma.JsonNull,
              startedAt: null, finishedAt: null, latencyMs: null, providerId: null,
              createdAt: new Date(), feedbackState: options.automatic && (route.publishSummary || route.publishInline) ? 'PENDING' : 'NOT_REQUESTED' },
          }) : await tx.aiSkillReview.create({
            data: {
              organizationId: session.organizationId!,
              repositoryId: repo.id,
              assessmentId,
              actorId: session.identityId,
              stage,
              fingerprint,
              automaticKey: options.automatic?.key,
              feedbackState:
                options.automatic &&
                (route.publishSummary || route.publishInline)
                  ? "PENDING"
                  : "NOT_REQUESTED",
              snapshot: JSON.parse(JSON.stringify(snapshot)),
              // Required legacy column retained for historical records.
              reservedMicroCents: 0n,
            },
          });
          await tx.auditEvent.create({
            data: {
              actorId: session.identityId,
              event: "ai.review.requested",
              metadata: {
                organizationId: session.organizationId!,
                reviewId: result.id,
                assessmentId,
                fingerprint,
                skillIds,
                checkIds,
              },
            },
          });
          return result;
        },
        { isolationLevel: "Serializable" },
      );
      return publicReview(review);
    } catch (e) {
      if (["P2034", "P2002"].includes((e as { code?: string }).code ?? ""))
        throw new ConflictException(
          "Review configuration changed. Reload and retry.",
        );
      throw e;
    }
  }
  /** Explicit recovery only. Re-admit against current access, policy, source,
   * skills and model route; periodic dispatch never retries failed inference. */
  async retry(session: AuthenticatedSession, repoId: string, reviewId: string) {
    if (!skillReviewsEnabled()) throw new ServiceUnavailableException('AI reviews are disabled for this deployment');
    const repo = await this.access.requireRepository(session, repoId, 'ai.review.run');
    const review = await this.db.aiSkillReview.findFirst({ where: {
      id: reviewId, repositoryId: repo.id, organizationId: session.organizationId!, state: 'UNAVAILABLE',
    } });
    if (!review) throw new NotFoundException('Unavailable review not found');
    if (review.automaticKey && review.actorId !== session.identityId)
      throw new ConflictException('Retry this automatic review as its original requester');
    const snapshot = review.snapshot as unknown as Snapshot;
    const route = await effectiveAiRoute(this.db, session.organizationId!, review.stage);
    if (!route?.enabled) throw new ConflictException('Choose an enabled model in Model Router');
    let automatic = snapshot.automatic;
    if (automatic) {
      let key = automaticReviewKey(session.organizationId!, repo.id, automatic, route.revision, snapshot.checks);
      if (route.id !== snapshot.route.id && route.revision === snapshot.route.revision)
        key = digest({ automaticKey: key, routeId: route.id });
      if (route.id === snapshot.route.id && route.revision === snapshot.route.revision) {
        const providers = await this.db.aiProviderConnection.findMany({ where: {
          organizationId: session.organizationId!, id: { in: [route.primaryId, route.fallbackId].filter((id): id is string => !!id) },
        } });
        const pins = [route.primaryId, route.fallbackId].flatMap(id => {
          const provider = providers.find(p => p.id === id);
          return provider && this.configuration.ready(provider)
            ? [{ id: provider.id, revision: provider.revision, endpointDigest: endpointDigest(providerEndpoint(provider)!) }] : [];
        });
        // Credential/connection edits need not change the route revision. An
        // explicit retry may adopt new provider pins without overwriting the
        // old review or causing periodic dispatch to retry failed inference.
        key = digest(pins) === digest(snapshot.providers) ? automatic.key : digest({ automaticKey: key, providers: pins });
      }
      automatic = { ...automatic, key };
    }
    // Automatic reviews remain owned by the currently configured actor.
    if (automatic?.repositoryRevision !== undefined) {
      const config = await this.db.readinessAutomation.findUnique({ where: { repositoryId: repo.id } });
      if (config?.actorId !== session.identityId) throw new ConflictException('Retry this automatic review as the configured repository actor');
    }
    return this.request(session, repoId, review.assessmentId, snapshot.checks.map(c => c.id), {
      automatic, includeSource: !!snapshot.context.source, retryUnavailable: true,
    });
  }
  async cancel(session: AuthenticatedSession, repoId: string, id: string) {
    const repo = await this.access.requireRepository(
      session,
      repoId,
      "ai.review.run",
    );
    const member = await this.access.requireOrganization(
      session,
      "ai.review.run",
      true,
    );
    const result = await this.db.aiSkillReview.updateMany({
      where: {
        id,
        repositoryId: repo.id,
        organizationId: member.organizationId,
        state: { in: ["QUEUED", "RUNNING"] },
        ...(["OWNER", "ADMIN"].includes(member.role)
          ? {}
          : { actorId: session.identityId }),
      },
      data: { state: "CANCELLED", finishedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException("Active review unavailable");
    await this.db.auditEvent.create({
      data: {
        actorId: session.identityId,
        event: "ai.review.cancelled",
        metadata: { organizationId: member.organizationId, reviewId: id },
      },
    });
    return { state: "CANCELLED" };
  }
  private async current(
    session: AuthenticatedSession,
    repoId: string,
    assessmentId: string,
    snapshot: Snapshot,
  ) {
    if (!skillReviewsEnabled()) throw new Error("Disabled");
    await this.access.requireRepository(session, repoId, "ai.review.run");
    const assessment = await this.assessments.get(repoId, assessmentId);
    if (
      assessment.assessmentHash !== snapshot.context.assessmentHash ||
      digest(reviewContext(assessment)) !==
        digest(
          Object.fromEntries(
            Object.entries(snapshot.context).filter(
              ([key]) => key !== "source",
            ),
          ),
        )
    )
      throw new Error("Assessment changed");
    const assigned = assessmentAiChecks(
      assessment.plan,
      (assessment.request as { subjectKind?: string }).subjectKind ===
        "PULL_REQUEST"
        ? "pull_request"
        : "repository",
    )
      .filter((c) => snapshot.checks.some((s) => s.id === c.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (digest(assigned) !== digest(snapshot.checks))
      throw new Error("AI review assignment changed");
    const effective = await effectiveAiRoute(
      this.db,
      session.organizationId!,
      (assessment.request as { subjectKind?: string }).subjectKind ===
        "PULL_REQUEST"
        ? "pull_request"
        : "repository",
    );
    if (
      effective?.id !== snapshot.route.id ||
      effective.revision !== snapshot.route.revision
    )
      throw new Error("Model settings changed");
    const route = await this.db.aiStageRoute.findFirst({
      where: {
        id: snapshot.route.id,
        organizationId: session.organizationId!,
        revision: snapshot.route.revision,
        enabled: true,
      },
    });
    if (
      !route ||
      (snapshot.context.source && !route.allowSource) ||
      (snapshot.automatic && snapshot.automatic.repositoryRevision === undefined && !route.automaticReviews)
    )
      throw new Error("Route changed");
    if (snapshot.automatic) await this.currentPolicy(session, repoId, snapshot);
    if (snapshot.context.source) {
      const observed = await this.db.repositoryPullRequest.findUnique({
        where: {
          repositoryId_number: {
            repositoryId: assessment.repositoryId,
            number: snapshot.context.source.number,
          },
        },
      });
      if (
        !observed ||
        !sameReviewPr(snapshot.context.source.context, observed.context)
      )
        throw new Error("PR changed");
    }
    for (const skill of snapshot.skills) {
      const current = await this.db.aiReviewSkill.findFirst({
        where: {
          id: skill.id,
          organizationId: session.organizationId!,
          enabled: true,
          status: "APPROVED",
          contentDigest: skill.contentDigest,
        },
      });
      if (!current || skillDigest(current) !== skill.contentDigest)
        throw new Error("Skill changed");
    }
    for (const pin of snapshot.providers) {
      const provider = await this.db.aiProviderConnection.findFirst({
        where: {
          id: pin.id,
          organizationId: session.organizationId!,
          revision: pin.revision,
        },
      });
      if (
        !provider ||
        !this.configuration.ready(provider) ||
        endpointDigest(providerEndpoint(provider)!) !== pin.endpointDigest
      )
        throw new Error("Provider changed");
    }
    return snapshot.automatic?.repositoryRevision !== undefined
      ? { ...route, automaticReviews: true, publishSummary: false, publishInline: true }
      : route;
  }
  private async currentPolicy(
    session: AuthenticatedSession,
    repoId: string,
    snapshot: Snapshot,
    db: PrismaService = this.db,
  ) {
    const pin = snapshot.automatic!;
    const repo = await new AuthorizationService(db).requireRepository(
      session,
      repoId,
      "ai.review.run",
    );
    if (pin.repositoryRevision !== undefined) {
      const config = await db.readinessAutomation.findUnique({ where: { repositoryId: repo.id } });
      if (!config?.aiReviews || config.revision !== pin.repositoryRevision || config.actorId !== session.identityId)
        throw new Error("Repository PR review settings changed");
    }
    const policy = await db.gatePolicyRevision.findFirst({
      where: {
        repositoryId: repo.id,
        branchRef: `refs/heads/${pin.context.base.ref}`,
        state: "PUBLISHED",
      },
      orderBy: { publishedAt: "desc" },
    });
    const selection = policy ? await currentStandards(db, repo.id, { policyId: policy.id }) : null;
    if (
      !policy ||
      policy.id !== pin.policyId ||
      policy.definitionHash !== pin.policyHash ||
      digest(policy.definition) !== pin.policyHash ||
      policy.selectionId !== selection?.id ||
      !policy.publishedById
    )
      throw new Error("Published policy changed");
    const publisher: AuthenticatedSession = {
      ...session,
      identityId: policy.publishedById,
    };
    await new AuthorizationService(db).requireRepository(
      publisher,
      repoId,
      "policy.publish",
    );
    await verifyTeamContext(
      db,
      repo.id,
      (policy.definition as { teamContext?: unknown }).teamContext,
    );
  }
  private async verifyLivePr(
    repo: { installationId: bigint; githubId: bigint },
    snapshot: Snapshot,
  ) {
    const expected =
      snapshot.context.source?.context ?? snapshot.automatic?.context;
    const number =
      snapshot.context.source?.number ?? snapshot.automatic?.number;
    if (!expected || !number) return;
    if (!this.github) throw new Error("GitHub unavailable");
    const live = await this.github.readPullRequest(
      repo.installationId,
      repo.githubId,
      number,
    );
    if (!sameReviewPr(expected, live.context)) throw new Error("PR changed");
  }
  /** A verified submission wakes only its own PR; normal admission checks still apply. */
  async dispatchVerifiedPipeline(submissionId: string) {
    const submission = await this.db.pipelineRunSubmission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.state !== 'COMPLETE' || !submission.assessmentId) return;
    await this.dispatchAutomatic({
      repositoryId: submission.repositoryId, number: submission.prNumber,
      sourceSha: submission.sourceSha, policyId: submission.policyId,
      policyHash: submission.policyHash, assessmentId: submission.assessmentId,
    });
  }
  /** Signed observations use periodic recovery; newly verified runs bypass only its admission cooldown. */
  async dispatchAutomatic(verified?: {
    repositoryId: string; number: number; sourceSha: string;
    policyId: string; policyHash: string; assessmentId: string;
  }) {
    if (!skillReviewsEnabled() || !this.github || this.closing) return;
    const pr = await this.db.repositoryPullRequest.findFirst({
      where: {
        ...(verified ? {
          repositoryId: verified.repositoryId, number: verified.number,
          context: { path: ['head', 'sha'], equals: verified.sourceSha },
        } : { OR: [
          { aiReviewAttemptAt: null },
          { aiReviewAttemptAt: { lt: new Date(Date.now() - 60000) } },
        ] }),
        repository: {
          selected: true,
          available: true,
          installation: { active: true },
          OR: [
            { readinessAutomation: { aiReviews: true } },
            { installation: { organization: { aiRoutes: { some: {
              stage: "pull_request", enabled: true, automaticReviews: true,
            } } } } },
          ],
        },
      },
      orderBy: [
        { aiReviewAttemptAt: { sort: "asc", nulls: "first" } },
        { id: "asc" },
      ],
      include: { repository: { include: { installation: true, readinessAutomation: true } } },
    });
    if (!pr) return;
    const claimed = await this.db.repositoryPullRequest.updateMany({
      where: {
        id: pr.id,
        revision: pr.revision,
        aiReviewAttemptAt: pr.aiReviewAttemptAt,
      },
      data: { aiReviewAttemptAt: new Date() },
    });
    if (!claimed.count) return;
    const context = readPullRequestContext(pr.context),
      organizationId = pr.repository.installation.organizationId;
    if (
      !context ||
      !sameReviewPr(context, context) ||
      context.head.repositoryId !== context.base.repositoryId ||
      !organizationId
    )
      return;
    const route = await effectiveAiRoute(
      this.db,
      organizationId,
      "pull_request",
    );
    const policy = await this.db.gatePolicyRevision.findFirst({
      where: {
        repositoryId: pr.repositoryId,
        branchRef: `refs/heads/${context.base.ref}`,
        state: "PUBLISHED",
      },
      orderBy: { publishedAt: "desc" },
    });
    const config = pr.repository.readinessAutomation;
    const scoped = config?.aiReviews === true;
    if (!route?.enabled || (!scoped && !route.automaticReviews) || !policy || (scoped && !route.allowSource)) return;
    if (verified && (!scoped || policy.id !== verified.policyId || policy.definitionHash !== verified.policyHash ||
      context.head.sha !== verified.sourceSha)) return;
    // The pipeline supplies the exact PR assessment. Enabling reviews never sends
    // historic PR code: only verified runs submitted after this authorization.
    // Upgrade an already enabled preference using its original, audited consent.
    const authorizationAt = scoped ? config!.aiReviewsEnabledAt ?? (await this.db.auditEvent.findFirst({ where: {
      event: "github.readiness_automation_changed", actorId: config!.actorId,
      AND: [
        { metadata: { path: ["repositoryGithubId"], equals: pr.repository.githubId.toString() } },
        { metadata: { path: ["revision"], equals: config!.revision } },
        { metadata: { path: ["aiReviews"], equals: true } },
      ],
    }, orderBy: { createdAt: "desc" } }))?.createdAt : null;
    const run = scoped && authorizationAt ? await this.db.pipelineRunSubmission.findFirst({ where: {
      repositoryId: pr.repositoryId, prNumber: pr.number, sourceSha: context.head.sha,
      policyId: policy.id, policyHash: policy.definitionHash, state: "COMPLETE",
      assessmentId: { not: null }, createdAt: { gte: authorizationAt! },
    }, orderBy: { createdAt: "desc" } }) : null;
    if (scoped && !run) return;
    if (verified && run?.assessmentId !== verified.assessmentId) return;
    let assessment = await this.db.commitAssessment.findFirst({
      where: {
        repositoryId: pr.repositoryId,
        ...(run?.assessmentId ? { id: run.assessmentId } : {}),
        sourceSha: context.head.sha,
        selectionId: policy.selectionId,
        request: { path: ["subjectKind"], equals: "PULL_REQUEST" },
      },
      orderBy: { createdAt: "desc" },
    });
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: scoped ? config!.actorId : route.updatedById,
      organizationId,
      subject: "",
      email: null,
      role: "VIEWER",
    };
    if (
      !assessment ||
      !sameReviewPr(
        (assessment.request as { pullRequest?: unknown }).pullRequest,
        context,
      )
    ) {
      if (scoped) return;
      try {
        const automatic = {
          policyId: policy.id,
          policyHash: policy.definitionHash,
          number: pr.number,
          context,
        };
        await this.currentPolicy(session, pr.repository.githubId.toString(), {
          automatic,
        } as Snapshot);
        await this.access.requireRepository(
          session,
          pr.repository.githubId.toString(),
          "assessment.request",
        );
        const live = await this.github.readPullRequest(
          pr.repository.installationId,
          pr.repository.githubId,
          pr.number,
        );
        if (!sameReviewPr(context, live.context)) return;
        const created = await this.assessments.createAutomatic(
          pr.repository.githubId.toString(),
          context.head.sha,
          policy.selectionId,
          `ai-pr:${digest({ context, policy: policy.definitionHash, number: pr.number })}`,
          route.updatedById,
          { ...context, number: pr.number, objectId: live.sourceObjectId },
        );
        assessment = await this.db.commitAssessment.findUnique({
          where: { id: created.assessment.id },
        });
      } catch {
        return;
      }
    }
    if (!assessment) return;
    const checks = assessmentAiChecks(assessment.plan, "pull_request").sort(
      (a, b) => a.id.localeCompare(b.id),
    );
    const published =
      (policy.definition as { aiChecks?: AiCheck[] }).aiChecks ?? [];
    if (
      !checks.length ||
      checks.some((c) => !published.some((p) => digest(p) === digest(c)))
    )
      return;
    const eligibility = await this.list(
      session,
      pr.repository.githubId.toString(),
      assessment.id,
    );
    const eligibleChecks = checks.filter((c) =>
      eligibility.checks.some((e) => e.id === c.id && e.available),
    );
    for (let index = 0; index < eligibleChecks.length; index += 3) {
      const selected = eligibleChecks.slice(index, index + 3);
      const automatic = {
        key: automaticReviewKey(organizationId, pr.repositoryId, {
          key: '', number: pr.number, context, policyId: policy.id, policyHash: policy.definitionHash,
          ...(scoped ? { repositoryRevision: config!.revision } : {}),
        }, route.revision, selected),
        ...(scoped ? { repositoryRevision: config!.revision } : {}),
        policyId: policy.id,
        policyHash: policy.definitionHash,
        number: pr.number,
        context,
      };
      try {
        await this.currentPolicy(session, pr.repository.githubId.toString(), {
          automatic,
        } as Snapshot);
        await this.request(
          session,
          pr.repository.githubId.toString(),
          assessment.id,
          selected.map((c) => c.id),
          { automatic, includeSource: route.allowSource },
        );
      } catch {
        // A stable audit key bounds repeated errors without exposing provider responses or source.
        const metadata = {
          organizationId,
          repositoryId: pr.repositoryId,
          dispatchKey: automatic.key,
          number: pr.number,
          sourceSha: context.head.sha,
        };
        if (
          !(await this.db.auditEvent.findFirst({
            where: {
              event: "ai.review.dispatch_unavailable",
              metadata: { path: ["dispatchKey"], equals: automatic.key },
            },
          }))
        )
          await this.db.auditEvent.create({
            data: {
              actorId: session.identityId,
              event: "ai.review.dispatch_unavailable",
              metadata,
            },
          });
      }
    }
  }
  async publishPendingSummary() {
    if (
      !this.github ||
      configurationValue("GITHUB_CHECK_PUBLICATION_ENABLED") !== "true"
    )
      return;
    const job = await this.db.aiSkillReview.findFirst({
      where: {
        state: "SUCCEEDED",
        feedbackState: { in: ["PENDING", "RETRY"] },
        feedbackAttempts: { lt: 5 },
        OR: [
          { feedbackAttemptAt: null },
          { feedbackAttemptAt: { lt: new Date(Date.now() - 60000) } },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: { repository: true },
    });
    if (!job) return;
    const claim = await this.db.aiSkillReview.updateMany({
      where: {
        id: job.id,
        feedbackAttempts: job.feedbackAttempts,
        feedbackAttemptAt: job.feedbackAttemptAt,
      },
      data: {
        feedbackAttempts: { increment: 1 },
        feedbackAttemptAt: new Date(),
      },
    });
    if (!claim.count) return;
    const snapshot = job.snapshot as unknown as Snapshot;
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: job.actorId,
      organizationId: job.organizationId,
      subject: "",
      email: null,
      role: "VIEWER",
    };
    try {
      const route = await this.current(
        session,
        job.repository.githubId.toString(),
        job.assessmentId,
        snapshot,
      );
      if (
        (!route.publishSummary && !route.publishInline) ||
        !snapshot.automatic
      )
        throw new Error("Summary disabled");
      await this.verifyLivePr(job.repository, snapshot);
      const result = job.result as {
        findings: {
          summary: string;
          recommendation: string;
          evidenceRefs: string[];
        }[];
      };
      const findings = actionableFindings(result.findings);
      const summary = conciseReviewSummary(
        snapshot.automatic.number,
        snapshot.context.sourceSha,
        findings.length,
        snapshot.context.source,
      );
      const publication = route.publishSummary
        ? await this.github.publishAiReviewSummary(
            job.repository.installationId,
            job.repository.githubId,
            snapshot.context.sourceSha,
            digest({ kind: "AI_SUMMARY", key: snapshot.automatic.key }),
            summary,
          )
        : null;
      const inline =
        route.publishInline && snapshot.context.source
          ? await this.github.publishAiInlineReview(
              job.repository.installationId,
              job.repository.githubId,
              snapshot.context.source,
              digest({ kind: "AI_INLINE", key: snapshot.automatic.key }),
              findings,
              snapshot.automatic.repositoryRevision !== undefined ? summary : undefined,
            )
          : null;
      await this.db.aiSkillReview.update({
        where: { id: job.id },
        data: {
          feedbackState: "PUBLISHED",
          feedbackUrl: publication?.htmlUrl ?? null,
          inlineFeedbackUrl: inline?.htmlUrl ?? null,
        },
      });
      await this.db.auditEvent.create({
        data: {
          actorId: job.actorId,
          event: "ai.review.summary_published",
          metadata: {
            organizationId: job.organizationId,
            reviewId: job.id,
            sourceSha: snapshot.context.sourceSha,
          },
        },
      });
    } catch {
      await this.db.aiSkillReview.update({
        where: { id: job.id },
        data: {
          feedbackState: job.feedbackAttempts >= 4 ? "UNAVAILABLE" : "RETRY",
        },
      });
    }
  }
  async reconcile() {
    if (this.closing || !skillReviewsEnabled()) return;
    await this.dispatchAutomatic();
    await this.publishPendingSummary();
    await this.db.aiSkillReview.updateMany({
      where: {
        state: "RUNNING",
        startedAt: { lt: new Date(Date.now() - 90000) },
      },
      data: {
        state: "UNAVAILABLE",
        failure: "Worker interrupted; no automatic inference retry",
        finishedAt: new Date(),
      },
    });
    const job = await this.db.aiSkillReview.findFirst({
      where: { state: "QUEUED" },
      orderBy: { createdAt: "asc" },
      include: { repository: true },
    });
    if (!job) return;
    const claim = await this.db.aiSkillReview.updateMany({
      where: { id: job.id, state: "QUEUED" },
      data: { state: "RUNNING", startedAt: new Date() },
    });
    if (!claim.count) return;
    const start = Date.now(),
      snapshot = job.snapshot as unknown as Snapshot;
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: job.actorId,
      organizationId: job.organizationId,
      subject: "",
      email: null,
      role: "VIEWER",
    };
    const controller = new AbortController(),
      signal = AbortSignal.any([
        controller.signal,
        this.abort.signal,
        // Give each configured provider its own deadline, while bounding the
        // whole review and preserving cancellation when access or context changes.
        AbortSignal.timeout(
          60000 * Math.max(1, Math.min(snapshot.providers.length, 2)),
        ),
      ]);
    let checking = false;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.db.aiSkillReview
        .findUnique({ where: { id: job.id } })
        .then(async (r) => {
          if (r?.state !== "RUNNING") throw new Error("Cancelled");
          await this.current(
            session,
            job.repository.githubId.toString(),
            job.assessmentId,
            snapshot,
          );
        })
        .catch(() => controller.abort())
        .finally(() => {
          checking = false;
        });
    }, 1000);
    try {
      if (digest(snapshot) !== job.fingerprint)
        throw new Error("Review integrity check failed");
      if (Date.now() - job.createdAt.getTime() > 600000)
        throw new Error("Expired");
      await this.current(
        session,
        job.repository.githubId.toString(),
        job.assessmentId,
        snapshot,
      );
      let findings: Awaited<ReturnType<typeof runSkillInference>> | undefined,
        providerId: string | undefined;
      const usage: ProviderUsage[] &
        { providerId?: string }[] = [];
      let responseFailure: AiResponseError | undefined;
      for (const pin of snapshot.providers) {
        signal.throwIfAborted();
        const provider = await this.db.aiProviderConnection.findFirst({
          where: {
            id: pin.id,
            organizationId: job.organizationId,
            revision: pin.revision,
          },
        });
        if (
          !provider ||
          !this.configuration.ready(provider) ||
          endpointDigest(providerEndpoint(provider)!) !== pin.endpointDigest
        )
          throw new Error("Provider changed");
        await this.verifyLivePr(job.repository, snapshot);
        try {
          findings = await runSkillInference(
            provider,
            reviewTasks(snapshot.checks, snapshot.skills),
            snapshot.context,
            aiResponseTokenLimit,
            AbortSignal.any([signal, AbortSignal.timeout(60000)]),
            async (reported) => {
              usage.push({ ...reported, providerId: provider.id });
              await this.db.aiSkillReview.update({
                where: { id: job.id },
                data: { usage },
              });
            },
          );
          providerId = provider.id;
          break;
        } catch (error) {
          if (error instanceof AiResponseError) responseFailure = error;
          if (
            error instanceof AiTransportError &&
            (!signal.aborted || signal.reason?.name === "TimeoutError")
          ) {
            // Recheck access/configuration before retaining a redacted outage signal.
            await this.current(
              session,
              job.repository.githubId.toString(),
              job.assessmentId,
              snapshot,
            );
            await recordAiInferenceOutcome(this.db, {
              reviewId: job.id,
              organizationId: job.organizationId,
              actorId: job.actorId,
              repositoryId: job.repositoryId,
              providerId: provider.id,
              providerRevision: provider.revision,
              outcome: "transport_failed",
            });
          }
          signal.throwIfAborted();
        }
      }
      if (!findings) throw responseFailure ?? new Error("Unavailable");
      await this.verifyLivePr(job.repository, snapshot);
      signal.throwIfAborted();
      await this.current(
        session,
        job.repository.githubId.toString(),
        job.assessmentId,
        snapshot,
      );
      await this.db.$transaction(
        async (tx) => {
          signal.throwIfAborted();
          if (!skillReviewsEnabled()) throw new Error("Disabled");
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            job.repository.githubId.toString(),
            "ai.review.run",
          );
          const effective = await effectiveAiRoute(
            tx as PrismaService,
            job.organizationId,
            job.stage,
          );
          if (
            effective?.id !== snapshot.route.id ||
            effective.revision !== snapshot.route.revision ||
            !(await tx.aiStageRoute.findFirst({
              where: {
                id: snapshot.route.id,
                organizationId: job.organizationId,
                revision: snapshot.route.revision,
                enabled: true,
              },
            }))
          )
            throw new Error("Route changed");
          if (snapshot.automatic)
            await this.currentPolicy(
              session,
              job.repository.githubId.toString(),
              snapshot,
              tx as PrismaService,
            );
          const sourceContext =
            snapshot.context.source?.context ?? snapshot.automatic?.context;
          const prNumber =
            snapshot.context.source?.number ?? snapshot.automatic?.number;
          if (sourceContext && prNumber) {
            const observed = await tx.repositoryPullRequest.findUnique({
              where: {
                repositoryId_number: {
                  repositoryId: job.repositoryId,
                  number: prNumber,
                },
              },
            });
            if (!observed || !sameReviewPr(sourceContext, observed.context))
              throw new Error("PR changed");
          }
          for (const skill of snapshot.skills) {
            const live = await tx.aiReviewSkill.findFirst({
              where: {
                id: skill.id,
                organizationId: job.organizationId,
                status: "APPROVED",
                enabled: true,
                contentDigest: skill.contentDigest,
              },
            });
            if (!live || skillDigest(live) !== skill.contentDigest)
              throw new Error("Skill changed");
          }
          for (const pin of snapshot.providers) {
            const live = await tx.aiProviderConnection.findFirst({
              where: {
                id: pin.id,
                organizationId: job.organizationId,
                revision: pin.revision,
              },
            });
            if (
              !live ||
              !this.configuration.ready(live) ||
              endpointDigest(providerEndpoint(live)!) !== pin.endpointDigest
            )
              throw new Error("Provider changed");
          }
          const successfulProvider = snapshot.providers.find(
            (pin) => pin.id === providerId,
          );
          if (!successfulProvider) throw new Error("Model unavailable");
          // Persist availability with the verified review result. A notification
          // storage failure never falls through to another inference call.
          await recordAiInferenceOutcomeInTransaction(tx, {
            reviewId: job.id,
            organizationId: job.organizationId,
            actorId: job.actorId,
            repositoryId: job.repositoryId,
            providerId: successfulProvider.id,
            providerRevision: successfulProvider.revision,
            outcome: "succeeded",
          });
          await tx.aiSkillReview.updateMany({
            where: { id: job.id, state: "RUNNING" },
            data: {
              state: "SUCCEEDED",
              providerId,
              result: {
                findings,
                context: {
                  ...snapshot.context,
                  ...(snapshot.context.source
                    ? { source: publicPrSource(snapshot.context.source) }
                    : {}),
                },
                classification: "ADVISORY",
              },
              latencyMs: Date.now() - start,
              finishedAt: new Date(),
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const responseMessages: Record<AiResponseError["code"], string> = {
        MODEL_UNAVAILABLE: "The configured model rejected the request. Check the model connection.",
        TRUNCATED: "The model response was cut off. Retry the review.",
        INVALID_RESPONSE: "The model returned an unreadable response. Retry the review.",
        UNSAFE_RESPONSE: "The model response contained unsafe content and was rejected.",
        ...reviewOutputFailureMessages,
        REFUSED: "The model declined this review.",
        INVALID_REVIEW_SCHEMA: "The model did not return the required review format. Retry the review.",
        INVALID_EVIDENCE: "The model cited evidence outside this assessment. Retry the review.",
        UNSUPPORTED_CLAIM: "The model made an unsupported claim. Retry the review.",
      };
      await this.db.aiSkillReview.updateMany({
        where: { id: job.id, state: "RUNNING" },
        data: {
          state: "UNAVAILABLE",
          feedbackState: "NOT_REQUESTED",
          failure: error instanceof AiResponseError ? responseMessages[error.code] :
            error instanceof AiTransportError ? `${error.code}: The configured model connection was unavailable.` :
            "Review unavailable: check current access, approved skills, model route and connection",
          latencyMs: Date.now() - start,
          finishedAt: new Date(),
        },
      });
    } finally {
      clearInterval(timer);
      await this.db.auditEvent.create({
        data: {
          actorId: job.actorId,
          event: "ai.review.finished",
          metadata: { organizationId: job.organizationId, reviewId: job.id },
        },
      });
    }
  }
}
