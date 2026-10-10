import { recordAiBudgetNotification, recordAiInferenceOutcome, recordAiInferenceOutcomeInTransaction } from '../notifications/ai-notification.js';
import { AiTransportError } from './ai-http.js';
import { configurationValue } from '../configuration/runtime-configuration.js'
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
  reviewPrompt,
  skillDigest,
  type ReviewContext,
} from "./review-skills.js";
import { reviewReservation, runSkillInference } from "./skill-inference.js";
import type {
  AiReviewSkill,
  AiStageRoute,
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
export const skillReviewsEnabled = aiReviewsEnabled;
type Snapshot = {
  automatic?: {
    key: string;
    policyId: string;
    policyHash: string;
    number: number;
    context: NonNullable<ReturnType<typeof readPullRequestContext>>;
  };
  context: ReviewContext;
  skills: AiReviewSkill[];
  checks: AiCheck[];
  route: { id: string; revision: number };
  providers: { id: string; revision: number; endpointDigest: string }[];
  inputTokens: number;
  maxOutputTokens: number;
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
  usage: allowUsage ? r.usage : null,
  reservedCents: allowUsage ? Number(r.reservedMicroCents) / 1000000 : null,
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
  private async profile(record: { request: unknown; sourceSha: string }, repositoryId: string) {
    const id = (record.request as { profileSnapshotId?: string })?.profileSnapshotId;
    return id ? this.db.repositoryProfile.findFirst({ where: { id, repositoryId, sourceSha: record.sourceSha } }) : null;
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
      selection: skillApplicability(live.find(s=>s.id===c.skillId) ?? {}, profile, assessment.sourceSha),
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
    const records = await this.db.aiSkillReview.findMany({
      where: {
        organizationId: session.organizationId!,
        repositoryId: repo.id,
        assessmentId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    await this.access.requireRepository(session, repoId, "assessment.read");
    let allowUsage = false;
    try { await this.access.requireOrganization(session,"ai.usage.read"); allowUsage = true; } catch {}
    return {
      enabled: skillReviewsEnabled(),
      reviews: records.map(r=>publicReview(r,allowUsage)),
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
    if (skills.some(s=> !skillApplicability(s, profile, record.sourceSha).eligible))
      throw new BadRequestException("The skill language/framework scope does not match this commit. Inspect the skipped review or refresh the repository profile.");
    skills.sort((a, b) => a.id.localeCompare(b.id));
    const route = await this.db.aiStageRoute.findUnique({
      where: {
        organizationId_stage: {
          organizationId: session.organizationId!,
          stage,
        },
      },
    });
    if (!route?.enabled)
      throw new ConflictException(
        "Configure an enabled model route for this stage",
      );
    if (
      options.automatic &&
      (!route.automaticReviews || stage !== "pull_request")
    )
      throw new ConflictException("Automatic PR reviews are disabled");
    if (options.automatic) {
      const existing = await this.db.aiSkillReview.findUnique({
        where: { automaticKey: options.automatic.key },
      });
      if (existing) return publicReview(existing);
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
    const prompt = reviewPrompt(reviewTasks(checks, skills), context),
      inputTokens = Buffer.byteLength(prompt.system + prompt.user) + 1024;
    if (inputTokens > route.maxInputTokens)
      throw new BadRequestException(
        "Review context exceeds the configured input limit",
      );
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
    let reserved = 0n;
    try {
      for (const p of providers)
        reserved += reviewReservation(p, inputTokens, route.maxOutputTokens);
    } catch {
      throw new BadRequestException(
        "Configure model input/output rates before running a review",
      );
    }
    const snapshot: Snapshot = {
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
      inputTokens,
      maxOutputTokens: route.maxOutputTokens,
    };
    const fingerprint = digest(snapshot),
      day = new Date().toISOString().slice(0, 10);
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
          if (automaticDuplicate) return automaticDuplicate;
          const existing = await tx.aiSkillReview.findUnique({
            where: {
              organizationId_actorId_fingerprint: {
                organizationId: session.organizationId!,
                actorId: session.identityId,
                fingerprint,
              },
            },
          });
          if (existing) return existing;
          if (
            (await tx.aiSkillReview.count({
              where: {
                organizationId: session.organizationId!,
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
          if (
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
          // Decide admission before incrementing. A rejected request records its
          // outbox event in this transaction but reserves nothing and calls no model.
          const budget = await tx.aiReviewBudget.findUnique({
            where: { organizationId_stage_day: {
              organizationId: session.organizationId!, stage, day,
            } },
          });
          if ((budget?.reservedMicroCents ?? 0n) + reserved > BigInt(route.dailyBudgetCents) * 1000000n) {
            await recordAiBudgetNotification(tx, repo, session.organizationId!, session.identityId, route, day);
            return { budgetRejected: true as const };
          }
          await tx.aiReviewBudget.upsert({
            where: { organizationId_stage_day: {
              organizationId: session.organizationId!, stage, day,
            } },
            create: { organizationId: session.organizationId!, stage, day, reservedMicroCents: reserved },
            update: { reservedMicroCents: { increment: reserved } },
          });
          const result = await tx.aiSkillReview.create({
            data: {
              organizationId: session.organizationId!,
              repositoryId: repo.id,
              assessmentId,
              actorId: session.identityId,
              stage,
              fingerprint,
              automaticKey: options.automatic?.key,
              feedbackState:
                options.automatic && (route.publishSummary || route.publishInline)
                  ? "PENDING"
                  : "NOT_REQUESTED",
              snapshot: JSON.parse(JSON.stringify(snapshot)),
              reservedMicroCents: reserved,
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
      if ('budgetRejected' in review) throw new ConflictException("Daily review budget reached");
      return publicReview(review);
    } catch (e) {
      if (["P2034", "P2002"].includes((e as { code?: string }).code ?? ""))
        throw new ConflictException(
          "Review configuration changed. Reload and retry.",
        );
      throw e;
    }
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
      (snapshot.automatic && !route.automaticReviews)
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
    return route;
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
    const policy = await db.gatePolicyRevision.findFirst({
      where: {
        repositoryId: repo.id,
        branchRef: `refs/heads/${pin.context.base.ref}`,
        state: "PUBLISHED",
      },
      orderBy: { publishedAt: "desc" },
    });
    const selection = await db.repositoryStandardsSelection.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: "desc" },
    });
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
  /** Durable PR observations come from signed webhook processing. Claims rotate fairly and retry admission failures once per minute. */
  async dispatchAutomatic() {
    if (!skillReviewsEnabled() || !this.github || this.closing) return;
    const pr = await this.db.repositoryPullRequest.findFirst({
      where: {
        OR: [
          { aiReviewAttemptAt: null },
          { aiReviewAttemptAt: { lt: new Date(Date.now() - 60000) } },
        ],
        repository: {
          selected: true,
          available: true,
          installation: {
            active: true,
            organization: {
              aiRoutes: {
                some: {
                  stage: "pull_request",
                  enabled: true,
                  automaticReviews: true,
                },
              },
            },
          },
        },
      },
      orderBy: [
        { aiReviewAttemptAt: { sort: "asc", nulls: "first" } },
        { id: "asc" },
      ],
      include: { repository: { include: { installation: true } } },
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
    const route = await this.db.aiStageRoute.findUnique({
      where: {
        organizationId_stage: { organizationId, stage: "pull_request" },
      },
    });
    const policy = await this.db.gatePolicyRevision.findFirst({
      where: {
        repositoryId: pr.repositoryId,
        branchRef: `refs/heads/${context.base.ref}`,
        state: "PUBLISHED",
      },
      orderBy: { publishedAt: "desc" },
    });
    if (!route?.automaticReviews || !route.enabled || !policy) return;
    let assessment = await this.db.commitAssessment.findFirst({
      where: {
        repositoryId: pr.repositoryId,
        sourceSha: context.head.sha,
        selectionId: policy.selectionId,
        request: { path: ["subjectKind"], equals: "PULL_REQUEST" },
      },
      orderBy: { createdAt: "desc" },
    });
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: route.updatedById,
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
    const eligibility = await this.list(session, pr.repository.githubId.toString(), assessment.id);
    const eligibleChecks = checks.filter(c => eligibility.checks.some(e=>e.id === c.id && e.available));
    for (let index = 0; index < eligibleChecks.length; index += 3) {
      const selected = eligibleChecks.slice(index, index + 3);
      const automatic = {
        key: digest({
          organizationId,
          repositoryId: pr.repositoryId,
          number: pr.number,
          context,
          policyHash: policy.definitionHash,
          routeRevision: route.revision,
          checks: selected,
        }),
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
              actorId: route.updatedById,
              event: "ai.review.dispatch_unavailable",
              metadata,
            },
          });
      }
    }
  }
  async publishPendingSummary() {
    if (!this.github || configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') !== "true")
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
      if ((!route.publishSummary && !route.publishInline) || !snapshot.automatic)
        throw new Error("Summary disabled");
      await this.verifyLivePr(job.repository, snapshot);
      const result = job.result as {
        findings: {
          summary: string;
          recommendation: string;
          evidenceRefs: string[];
        }[];
      };
      const safe = (s: string) => s.replace(/[\`*_<>#@\[\]]/g, "");
      const summary = [
        `Advisory review for PR #${snapshot.automatic.number}, commit ${snapshot.context.sourceSha}. AI does not decide readiness.`,
        ...result.findings.map(
          (f) =>
            `- ${safe(f.summary)} ${safe(f.recommendation)} (${f.evidenceRefs
              .map((ref) => {
                const line = snapshot.context.source?.lines.find(
                  (l) => l.ref === ref,
                );
                return line
                  ? `${safe(line.path)}:${line.line} ${line.side}`
                  : ref;
              })
              .join(", ")})`,
        ),
        ...(result.findings.length
          ? []
          : [
              "No advisory suggestions returned; this is not a passing engineering check.",
            ]),
        ...(snapshot.context.source
          ? [
              `Scope: ${snapshot.context.source.lines.length} changed lines; ${snapshot.context.source.omittedFiles} files and ${snapshot.context.source.omittedLines} lines omitted.`,
            ]
          : ["Assessment evidence only; repository source was not shared."]),
      ].join("\n\n");
      const publication = route.publishSummary ? await this.github.publishAiReviewSummary(
        job.repository.installationId,
        job.repository.githubId,
        snapshot.context.sourceSha,
        digest({ kind: "AI_SUMMARY", key: snapshot.automatic.key }),
        summary,
      ) : null;
      const inline = route.publishInline && snapshot.context.source ? await this.github.publishAiInlineReview(job.repository.installationId, job.repository.githubId, snapshot.context.source, digest({kind:"AI_INLINE", key:snapshot.automatic.key}), result.findings) : null;
      await this.db.aiSkillReview.update({
        where: { id: job.id },
        data: { feedbackState: "PUBLISHED", feedbackUrl: publication?.htmlUrl ?? null, inlineFeedbackUrl: inline?.htmlUrl ?? null },
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
        AbortSignal.timeout(60000),
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
      const usage: import("./skill-inference.js").ProviderUsage[] & { providerId?:string }[] = [];
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
            snapshot.maxOutputTokens,
            signal,
            async reported => {
              usage.push({...reported, providerId:provider.id});
              await this.db.aiSkillReview.update({where:{id:job.id},data:{usage}});
            },
          );
          providerId = provider.id;
          break;
        } catch (error) {
          if (error instanceof AiTransportError && (!signal.aborted || signal.reason?.name === 'TimeoutError')) {
            // Recheck access/configuration before retaining a redacted outage signal.
            await this.current(session, job.repository.githubId.toString(), job.assessmentId, snapshot);
            await recordAiInferenceOutcome(this.db, {
              reviewId: job.id, organizationId: job.organizationId, actorId: job.actorId,
              repositoryId: job.repositoryId, providerId: provider.id, providerRevision: provider.revision,
              outcome: 'transport_failed',
            });
          }
          signal.throwIfAborted();
        }
      }
      if (!findings) throw new Error("Unavailable");
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
          if (
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
          const successfulProvider = snapshot.providers.find(pin => pin.id === providerId);
          if (!successfulProvider) throw new Error("Model unavailable");
          // Persist availability with the verified review result. A notification
          // storage failure never falls through to another inference call.
          await recordAiInferenceOutcomeInTransaction(tx, {
            reviewId: job.id, organizationId: job.organizationId, actorId: job.actorId,
            repositoryId: job.repositoryId, providerId: successfulProvider.id, providerRevision: successfulProvider.revision,
            outcome: 'succeeded',
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
                inputTokenEstimate: snapshot.inputTokens,
                maxOutputTokens: snapshot.maxOutputTokens,
              },
              latencyMs: Date.now() - start,
              finishedAt: new Date(),
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch {
      await this.db.aiSkillReview.updateMany({
        where: { id: job.id, state: "RUNNING" },
        data: {
          state: "UNAVAILABLE",
          feedbackState: "NOT_REQUESTED",
          failure:
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
