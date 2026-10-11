import { CheckPublicationService } from "./check-publication.service.js";
import { registerPipelineSources } from "./pipeline-source-registration.js";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { CiArtifactService } from "../github-events/ci-artifact.service.js";
import { CiAttestationService } from "../github-events/ci-attestation.service.js";
import { CiAttestationVerifier } from "../github-events/ci-attestation-verifier.js";
import { currentStandards } from "../standards/policy-standards.js";
import { identityMatches, runAttempt } from "./ci-binding.js";
import { AssessmentService } from "./assessment.service.js";
import { evaluatePublishedPolicy } from "./published-policy-evaluation.js";
import { digest } from "./assessment-digest.js";

export function pipelineComment(
  sha: string,
  runId: string,
  assessmentId: string,
  preview: ReturnType<typeof evaluatePublishedPolicy>,
) {
  const label =
    preview.status === "PASS"
      ? "Passed"
      : preview.status === "BLOCK"
        ? "Failed"
        : preview.status === "WARN"
          ? "Passed with advisory issues"
          : "Incomplete";
  const escape = (text: string) =>
    text.replace(/[\r\n|<>@`]/g, " ").slice(0, 180);
  return `<!-- preflyt-policy-summary -->\n## Preflyt policy: ${label}\n\nCommit \`${sha.slice(0, 12)}\` · workflow run \`${runId}\`\n\n${preview.requiredRulesSatisfied}/${preview.requiredRules} required checks passed · ${preview.requiredRulesBlocked} failed · ${preview.requiredRulesIncomplete} incomplete\n\n| Check | Result |\n|---|---|\n${preview.rules
    .slice(0, 64)
    .map(
      (rule: { title?: string; ruleId: string; status: string }) =>
        `| ${escape(String(rule.title ?? rule.ruleId))} | ${rule.status === "PASS" ? "Passed" : rule.status === "BLOCK" ? "Failed" : "Incomplete"} |`,
    )
    .join(
      "\n",
    )}\n\nSaved assessment: \`${assessmentId}\`. Missing or unverified execution remains incomplete. GitHub branch rules determine whether merging is blocked.`;
}

/** Drain durable submissions only after live run identity and signed observation agree. */
export class PipelineProcessingService {
  private readonly publications: CheckPublicationService;
  private readonly artifacts: CiArtifactService;
  private readonly proofs: CiAttestationService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AuthorizationService,
    private readonly github: GitHubProviderService,
    private readonly assessments: AssessmentService,
  ) {
    this.publications = new CheckPublicationService(
      prisma,
      access,
      github,
      assessments,
    );
    this.artifacts = new CiArtifactService(prisma);
    this.proofs = new CiAttestationService(prisma, new CiAttestationVerifier());
  }
  async reconcile() {
    const now = new Date();
    const rows = await this.prisma.pipelineRunSubmission.findMany({
      where: {
        state: { in: ["PENDING", "PROCESSING"] },
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    for (const row of rows) {
      const lease = randomUUID();
      const claimed = await this.prisma.pipelineRunSubmission.updateMany({
        where: {
          id: row.id,
          state: { in: ["PENDING", "PROCESSING"] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          state: "PROCESSING",
          leaseToken: lease,
          leaseUntil: new Date(Date.now() + 180000),
        },
      });
      if (!claimed.count) continue;
      const finish = (data: Record<string, any>) =>
        this.prisma.pipelineRunSubmission.updateMany({
          where: { id: row.id, leaseToken: lease },
          data: { ...data, leaseToken: null, leaseUntil: null },
        });
      try {
        const repo = await this.prisma.gitHubRepository.findUnique({
          where: { id: row.repositoryId },
          include: { readinessAutomation: true },
        });
        const config = repo?.readinessAutomation;
        if (
          !repo ||
          !config?.enabled ||
          !repo.selected ||
          !repo.available ||
          config.organizationId !== row.organizationId
        ) {
          await finish({
            state: "STALE",
            failureCode: "ACCESS_OR_CONFIGURATION_CHANGED",
          });
          continue;
        }
        const session = {
          authenticated: true as const,
          identityId: row.submittedById,
          subject: row.submittedById,
          email: null,
          role: "USER",
          organizationId: row.organizationId,
        };
        await this.access.requireRepository(
          session,
          repo.githubId.toString(),
          "policy.publish",
        );
        const run = await this.github.readReadinessWorkflowRun(
          repo.installationId,
          repo.githubId,
          row.runId,
        );
        if (
          run.runAttempt !== row.runAttempt ||
          run.sourceSha !== row.sourceSha
        ) {
          await finish({ state: "STALE", failureCode: "RUN_CHANGED" });
          continue;
        }
        if (
          run.status !== "completed" &&
          Date.now() - row.createdAt.getTime() > 24 * 3600000
        ) {
          await finish({
            state: "FAILED",
            failureCode: "WORKFLOW_COMPLETION_TIMEOUT",
          });
          continue;
        }
        if (run.status !== "completed") {
          await finish({
            state: "PENDING",
            nextAttemptAt: new Date(Date.now() + 30000),
          });
          continue;
        }
        const remote = await this.github.readPullRequest(
          repo.installationId,
          repo.githubId,
          row.prNumber,
        );
        const { context } = remote;
        const policy = await this.prisma.gatePolicyRevision.findFirst({
          where: {
            repositoryId: repo.id,
            organizationId: row.organizationId,
            branchRef: `refs/heads/${context.base.ref}`,
            state: "PUBLISHED",
          },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        });
        if (
          context.state !== "open" ||
          context.draft ||
          context.head.sha !== row.sourceSha ||
          context.head.repositoryId !== repo.githubId.toString() ||
          policy?.id !== row.policyId ||
          policy.definitionHash !== row.policyHash
        ) {
          await finish({ state: "STALE", failureCode: "PR_OR_POLICY_CHANGED" });
          continue;
        }
        const evidence = (
          await this.prisma.importedCiEvidence.findMany({
            where: {
              repositoryGithubId: repo.githubId,
              installationId: repo.installationId,
              sourceSha: row.sourceSha,
              sourceKind: "workflow_run",
              sourceObjectId: row.runId,
              sourceStatus: "completed",
              sourceAction: "completed",
            },
            orderBy: { observedAt: "desc" },
            take: 10,
          })
        ).find(
          (item) =>
            runAttempt(item.sourceIdentity) === row.runAttempt &&
            identityMatches(
              { ruleId: "", kind: "workflow_run", workflowId: run.workflowId },
              item.sourceIdentity,
            ),
        );
        if (!evidence) {
          if (Date.now() - row.createdAt.getTime() > 24 * 3600000) {
            await finish({
              state: "FAILED",
              failureCode: "SIGNED_WORKFLOW_EVENT_MISSING",
            });
            continue;
          }
          await finish({
            state: "PENDING",
            nextAttemptAt: new Date(Date.now() + 30000),
            failureCode: "WAITING_FOR_WORKFLOW_EVENT",
          });
          continue;
        }
        const selection = await currentStandards(this.prisma, repo.id, {
          policyId: policy.id,
        });
        if (!selection) throw new Error("SELECTION_UNAVAILABLE");
        const payload = row.payload as unknown as {
          signerWorkflow: string;
          reports: {
            ruleId: string;
            format: "junit" | "sarif";
            content: string;
            sha256: string;
            proof?: string;
          }[];
        };
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repo.id} FOR UPDATE`;
          const active = await tx.gitHubRepository.findFirst({
            where: {
              id: repo.id,
              selected: true,
              available: true,
              installation: { active: true },
            },
          });
          const current = await tx.readinessAutomation.findUnique({
            where: { repositoryId: repo.id },
          });
          const held = await tx.pipelineRunSubmission.findFirst({
            where: {
              id: row.id,
              leaseToken: lease,
              leaseUntil: { gt: new Date() },
            },
          });
          if (
            !active ||
            !held ||
            !current?.enabled ||
            current.revision !== config.revision
          )
            throw new Error("REGISTRATION_CONTEXT_CHANGED");
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            repo.githubId.toString(),
            "policy.publish",
          );
          const pinned = await currentStandards(tx, repo.id, {
            policyId: policy.id,
          });
          if (pinned?.id !== selection.id) throw new Error("POLICY_CHANGED");
          await registerPipelineSources(tx, {
            repositoryId: repo.id,
            selectionId: selection.id,
            workflowId: run.workflowId,
            actorId: row.submittedById,
            submissionId: row.id,
            ruleIds: payload.reports.map((report) => report.ruleId),
          });
        });
        let proofIncomplete = false;
        if (run.conclusion === "success") {
          if (run.event !== "pull_request" || payload.signerWorkflow !== `${repo.fullName}/${run.workflowPath}`)
            throw new Error("WORKFLOW_IDENTITY_CHANGED");
          const jobs = await this.github.readPipelineJobs(repo.installationId, repo.githubId, row.runId, row.runAttempt);
          const successful = jobs.filter(job => job.sourceSha === row.sourceSha && job.status === "completed" &&
            job.conclusion === "success" && job.steps.length > 0 &&
            job.steps.every((step: { status: string; conclusion: string }) => step.status === "completed" && ["success", "skipped"].includes(step.conclusion)));
          if (!successful.length) throw new Error("WORKFLOW_JOBS_NOT_VERIFIED");
          await this.prisma.auditEvent.createMany({ data: [{
            id: `pipeline-verified:${row.id}`, event: "pipeline.run.verified", actorId: row.submittedById,
            metadata: { schemaVersion: 1, submissionId: row.id, repositoryId: repo.id, sourceSha: row.sourceSha,
              selectionId: selection.id, policyId: policy.id, policyHash: policy.definitionHash,
              runId: row.runId, runAttempt: row.runAttempt, workflowId: run.workflowId,
              verifiedAt: new Date().toISOString(), jobIds: successful.map(job => job.id),
              reports: payload.reports.map(report => ({ ruleId: report.ruleId, sha256: report.sha256, format: report.format })) },
          }], skipDuplicates: true });
        }
        for (const report of payload.reports) {
          const held = await this.prisma.pipelineRunSubmission.updateMany({
            where: { id: row.id, leaseToken: lease },
            data: { leaseUntil: new Date(Date.now() + 180000) },
          });
          if (!held.count) throw new Error("LEASE_LOST");
          await this.access.requireRepository(
            session,
            repo.githubId.toString(),
            "policy.publish",
          );
          const imported = await this.artifacts.import(
            repo.githubId.toString(),
            evidence.deliveryId,
            report,
            row.submittedById,
          );
          if (report.proof) {
            try {
              await this.proofs.verify(
                repo.githubId.toString(),
                evidence.deliveryId,
                imported.artifact.id,
                {
                  bundle: report.proof,
                  signerWorkflow: payload.signerWorkflow,
                },
                row.submittedById,
                selection.id,
              );
            } catch {
              proofIncomplete = true;
            }
          } else proofIncomplete = true;
        }
        await this.access.requireRepository(
          session,
          repo.githubId.toString(),
          "policy.publish",
        );
        const saved = await this.assessments.createAutomatic(
          repo.githubId.toString(),
          row.sourceSha,
          selection.id,
          `pipeline:${row.id}`,
          row.submittedById,
          { ...context, number: row.prNumber, objectId: remote.sourceObjectId },
        );
        const freshRun = await this.github.readReadinessWorkflowRun(
          repo.installationId,
          repo.githubId,
          row.runId,
        );
        if (
          freshRun.runAttempt !== row.runAttempt ||
          freshRun.sourceSha !== row.sourceSha ||
          freshRun.status !== "completed"
        ) {
          await finish({ state: "STALE", failureCode: "RUN_CHANGED" });
          continue;
        }
        const preview = evaluatePublishedPolicy(
          saved.assessment,
          policy,
          policy.branchRef,
          { [row.runId]: freshRun },
        );
        await this.prisma.pipelineRunSubmission.updateMany({
          where: { id: row.id, leaseToken: lease },
          data: { assessmentId: saved.assessment.id },
        });
        // Publish this exact verified assessment before optional PR comments.
        // The follow-up workflow waits for the verified publication receipt.
        const publication = await this.publications.preview(
          session,
          repo.githubId.toString(),
          row.prNumber,
          saved.assessment.id,
        );
        await this.publications.publish(session, repo.githubId.toString(), {
          prNumber: row.prNumber,
          assessmentId: saved.assessment.id,
          expectedPreviewHash: publication.previewHash,
        });
        let commentUrl = row.commentUrl;
        if (config.pipelineComments) {
          // Serialize writers for this PR across worker processes. An older run must
          // never overwrite a newer submitted result or recreate a deleted summary.
          commentUrl = await this.prisma.$transaction(
            async (tx) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pipeline-comment:${repo.id}:${row.prNumber}`}))`;
              const current = await tx.readinessAutomation.findUnique({
                where: { repositoryId: repo.id },
              });
              const held = await tx.pipelineRunSubmission.findFirst({
                where: {
                  id: row.id,
                  leaseToken: lease,
                  leaseUntil: { gt: new Date() },
                },
              });
              const newest = await tx.pipelineRunSubmission.findFirst({
                where: { repositoryId: repo.id, prNumber: row.prNumber },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              });
              if (
                !held ||
                newest?.id !== row.id ||
                !current?.enabled ||
                !current.pipelineComments
              )
                return row.commentUrl;
              await new AuthorizationService(
                tx as PrismaService,
              ).requireRepository(
                session,
                repo.githubId.toString(),
                "policy.publish",
              );
              await currentStandards(tx, repo.id, { policyId: policy.id });
              return (
                await this.github.publishPipelineComment(
                  repo.installationId,
                  repo.githubId,
                  row.prNumber,
                  row.sourceSha,
                  pipelineComment(
                    row.sourceSha,
                    row.runId,
                    saved.assessment.id,
                    preview,
                  ),
                )
              ).htmlUrl;
            },
            { timeout: 120000 },
          );
        }
        await finish({
          state: "COMPLETE",
          assessmentId: saved.assessment.id,
          commentUrl,
          failureCode: proofIncomplete && run.conclusion !== "success" ? "EXECUTION_PROOF_INCOMPLETE" : null,
        });
        await this.prisma.auditEvent.createMany({
          data: [
            {
              id: `pipeline-complete:${row.id}`,
              event: "pipeline.results.assessed",
              actorId: row.submittedById,
              metadata: {
                submissionId: row.id,
                assessmentId: saved.assessment.id,
                repositoryId: repo.githubId.toString(),
                sourceSha: row.sourceSha,
                evaluationHash: digest(preview),
                proofIncomplete,
              },
            },
          ],
          skipDuplicates: true,
        });
      } catch {
        await finish({
          state: row.attempts >= 11 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 6)),
          ),
          failureCode: "PROCESSING_OR_COMMENT_UNAVAILABLE",
        });
      }
    }
  }
}
