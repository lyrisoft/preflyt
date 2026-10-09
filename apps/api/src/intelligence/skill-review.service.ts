import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
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
  context: ReviewContext;
  skills: AiReviewSkill[];
  checks: AiCheck[];
  route: { id: string; revision: number };
  providers: { id: string; revision: number; endpointDigest: string }[];
  inputTokens: number;
  maxOutputTokens: number;
};
const publicReview = (r: any) => ({
  id: r.id,
  assessmentId: r.assessmentId,
  state: r.state,
  failure: r.failure,
  providerId: r.providerId,
  result: r.result,
  latencyMs: r.latencyMs,
  reservedCents: Number(r.reservedMicroCents) / 1000000,
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
  ) {}
  close() {
    this.closing = true;
    this.abort.abort();
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
    const checks = assigned.map((c) => ({
      ...c,
      available: live.some(
        (s) =>
          s.id === c.skillId &&
          s.version === c.skillVersion &&
          s.contentDigest === c.skillDigest &&
          skillDigest(s) === c.skillDigest &&
          (!s.repositories.length || s.repositories.includes(repoId)),
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
    return {
      enabled: skillReviewsEnabled(),
      reviews: records.map(publicReview),
      checks,
    };
  }
  async request(
    session: AuthenticatedSession,
    repoId: string,
    assessmentId: string,
    checkIds: string[],
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
        "Choose up to three AI checks from this assessment’s saved standards",
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
          const budget = await tx.aiReviewBudget.upsert({
            where: {
              organizationId_stage_day: {
                organizationId: session.organizationId!,
                stage,
                day,
              },
            },
            create: {
              organizationId: session.organizationId!,
              stage,
              day,
              reservedMicroCents: reserved,
            },
            update: { reservedMicroCents: { increment: reserved } },
          });
          if (
            budget.reservedMicroCents >
            BigInt(route.dailyBudgetCents) * 1000000n
          )
            throw new ConflictException("Daily review budget reached");
          const result = await tx.aiSkillReview.create({
            data: {
              organizationId: session.organizationId!,
              repositoryId: repo.id,
              assessmentId,
              actorId: session.identityId,
              stage,
              fingerprint,
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
      digest(reviewContext(assessment)) !== digest(snapshot.context)
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
      throw new Error("AI check assignment changed");
    const route = await this.db.aiStageRoute.findFirst({
      where: {
        id: snapshot.route.id,
        organizationId: session.organizationId!,
        revision: snapshot.route.revision,
        enabled: true,
      },
    });
    if (!route) throw new Error("Route changed");
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
  async reconcile() {
    if (this.closing || !skillReviewsEnabled()) return;
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
        try {
          findings = await runSkillInference(
            provider,
            reviewTasks(snapshot.checks, snapshot.skills),
            snapshot.context,
            snapshot.maxOutputTokens,
            signal,
          );
          providerId = provider.id;
          break;
        } catch {
          signal.throwIfAborted();
        }
      }
      if (!findings) throw new Error("Unavailable");
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
          await tx.aiSkillReview.updateMany({
            where: { id: job.id, state: "RUNNING" },
            data: {
              state: "SUCCEEDED",
              providerId,
              result: {
                findings,
                context: snapshot.context,
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
