import { publicationGateWorkflow } from "./pipeline-gate-workflow.js";
import { readWorkflow } from "./pipeline-workflow.js";
import { workflowSnippet, publicPipelineUrl } from "./workflow-snippets.js";
import {
  Body,
  Controller,
  Get,
  Post,
  Header,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsInt,
  Min,
  MaxLength,
  Matches,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from "class-validator";
import type { Request } from "express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { CiBindingService } from "./ci-binding.service.js";
import { ReadinessAutomationService } from "./readiness-automation.service.js";
import { configurationValue } from "../configuration/runtime-configuration.js";
import { checkReportFormat } from "./check-report-adapters.js";
import { digest } from "./assessment-digest.js";
import {
  addPolicyChecks,
  inspectWorkflow,
  validateSetupWorkflow,
  type WorkflowRule,
} from "./pipeline-workflow.js";
import { PipelineWorkflowAiService } from "./pipeline-workflow-ai.service.js";
import { reportProofPolicy } from "../github-events/ci-attestation-policy.js";

class ConnectDto {
  @IsString() @MaxLength(80) policyId!: string;
  @IsString() @MaxLength(80) selectionId!: string;
  @IsOptional() @IsString() @MaxLength(80) bindingId?: string | null;
  @IsString() @Matches(/^[1-9]\d{0,15}$/) workflowId!: string;
  @IsBoolean() comments!: boolean;
  @IsBoolean() enable!: boolean;
  @IsInt() @Min(0) automationRevision!: number;
}

class InstalledDto {
  @IsString() @MaxLength(80) policyId!: string;
  @IsString() @Matches(/^[1-9]\d{0,15}$/) workflowId!: string;
}
class WorkflowDto {
  @IsString() @MaxLength(80) policyId!: string;
  @IsString() @Matches(/^[1-9]\d{0,15}$/) workflowId!: string;
  @IsString() @MaxLength(32768) workflow!: string;
}
class DraftDto extends WorkflowDto {
  @IsString() @MaxLength(100) jobId!: string;
  @IsString() @MaxLength(2048) apiUrl!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) checkIds!: string[];
}
class RewriteDto extends WorkflowDto {
  @IsString() @MaxLength(2048) apiUrl!: string;
  @IsString() @MaxLength(2000) instructions!: string;
  @IsUUID() requestId!: string;
}
class PullRequestDto extends ConnectDto {
  @IsString() @MaxLength(32768) workflow!: string;
  @IsString() @Matches(/^[a-f0-9]{40}$/) baseSha!: string;
  @IsUUID() requestId!: string;
}

/** Fixed files only; no paths or source code supplied by callers. */
export function setupArchive(files: Record<string, string>) {
  const blocks: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    if (
      Buffer.byteLength(name) > 99 ||
      name.startsWith("/") ||
      name.includes("..")
    )
      throw new BadRequestException("Invalid setup filename");
    const data = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write("0000644\0", 100, 8);
    header.write("0000000\0", 108, 8);
    header.write("0000000\0", 116, 8);
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124, 12);
    header.write("00000000000\0", 136, 12);
    header.fill(32, 148, 156);
    header.write("0", 156);
    header.write("ustar\0", 257, 6);
    header.write("00", 263, 2);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks)).toString("base64");
}

@Controller("github/repositories/:repositoryId/pipeline-setup")
@UseGuards(SessionGuard)
export class PipelineSetupController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
    @Inject(CiBindingService) private readonly bindings: CiBindingService,
    @Inject(PipelineWorkflowAiService)
    private readonly ai: PipelineWorkflowAiService,
    @Inject(ReadinessAutomationService)
    private readonly automation: ReadinessAutomationService,
  ) {}
  private async context(
    session: AuthenticatedSession,
    repositoryId: string,
    policyId: string,
  ) {
    if (
      typeof policyId !== "string" ||
      !policyId.length ||
      policyId.length > 80
    )
      throw new BadRequestException("Choose a published branch policy");
    const repo = await this.access.requireRepository(
      session,
      repositoryId,
      "policy.read",
    );
    const policy = await this.prisma.gatePolicyRevision.findFirst({
      where: {
        id: policyId,
        repositoryId: repo.id,
        organizationId: session.organizationId!,
        state: "PUBLISHED",
      },
    });
    if (!policy)
      throw new NotFoundException("Choose a published branch policy");
    if (digest(policy.definition) !== policy.definitionHash)
      throw new ConflictException("Policy integrity changed");
    if (
      await this.prisma.gatePolicyRevision.findFirst({
        where: {
          repositoryId: repo.id,
          organizationId: session.organizationId!,
          branchRef: policy.branchRef,
          state: "PUBLISHED",
          revision: { gt: policy.revision },
        },
        select: { id: true },
      })
    )
      throw new ConflictException(
        "A newer policy is published. Refresh and select it.",
      );
    return { repo, policy };
  }
  @Get()
  @Header("Cache-Control", "no-store")
  async get(
    @Param("repositoryId") id: string,
    @Query("policy") policyId: string,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Query("refresh") refresh?: string,
  ) {
    const { repo, policy } = await this.context(
      req.preflytSession,
      id,
      policyId,
    );
    const [workflows, bindings, config, submissions, ai, write, setupPr] =
      await Promise.all([
        this.github.discoverPipelineWorkflows(
          repo.installationId,
          repo.githubId,
          refresh === "true",
        ),
        this.bindings.get(id, policy.id),
        this.prisma.readinessAutomation.findUnique({
          where: { repositoryId: repo.id },
        }),
        this.prisma.pipelineRunSubmission.findMany({
          where: {
            repositoryId: repo.id,
            organizationId: req.preflytSession.organizationId!,
            policyId: policy.id,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            state: true,
            assessmentId: true,
            commentUrl: true,
            failureCode: true,
            createdAt: true,
          },
        }),
        this.ai.availability(req.preflytSession, id),
        this.github.pipelineWriteAvailability(repo.installationId),
        this.prisma.auditEvent.findFirst({
          where: {
            event: "pipeline.workflow.setup-pr.created",
            metadata: { path: ["policyId"], equals: policy.id },
          },
          orderBy: { createdAt: "desc" },
          select: { metadata: true },
        }),
      ]);
    const rules = (
      policy.definition as unknown as {
        rules: { id: string; title: string; required: boolean }[];
      }
    ).rules;
    return {
      ...workflows,
      apiUrl: publicPipelineUrl(),
      workflowSetup: workflowSnippet(this.rules(policy.definition)),
      ai,
      write,
      setupPr: setupPr?.metadata ?? null,
      branch: policy.branchRef,
      selectionId: policy.selectionId,
      bindingId: bindings.binding?.id ?? null,
      supportedRuleIds: bindings.supportedRuleIds,
      connectedWorkflowIds: [
        ...new Set(
          (
            (bindings.binding?.bindings ?? []) as {
              kind: string;
              workflowId?: string;
            }[]
          )
            .filter((b) => b.kind === "workflow_run")
            .map((b) => b.workflowId),
        ),
      ],
      checks: rules.map((r) => ({
        ...r,
        format: checkReportFormat(r.id) ?? null,
      })),
      enabled: config?.enabled ?? false,
      comments: config?.pipelineComments ?? false,
      automationRevision: config?.revision ?? 0,
      available:
        configurationValue("GITHUB_CHECK_PUBLICATION_ENABLED") === "true" &&
        configurationValue("AUTOMATIC_CHECK_PUBLICATION_ENABLED") === "true",
      proofConfigured: !!reportProofPolicy(),
      submissions,
    };
  }
  @Post()
  @Header("Cache-Control", "no-store")
  async connect(
    @Param("repositoryId") id: string,
    @Body() body: ConnectDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const session = req.preflytSession;
    const { repo, policy } = await this.context(session, id, body.policyId);
    await this.access.requireRepository(session, id, "policy.draft");
    await this.access.requireRepository(session, id, "policy.publish");
    if (policy.selectionId !== body.selectionId)
      throw new ConflictException("Refresh the selected policy");
    const workflows = await this.github.discoverPipelineWorkflows(
      repo.installationId,
      repo.githubId,
      true,
    );
    if (!workflows.workflows.some((w) => w.id === body.workflowId))
      throw new BadRequestException("Choose a current repository workflow");
    const sources = await this.bindings.get(id, policy.id);
    if ((sources.binding?.id ?? null) !== (body.bindingId ?? null))
      throw new ConflictException(
        "Workflow connections changed. Refresh and try again.",
      );
    if (!sources.supportedRuleIds.length)
      throw new BadRequestException(
        "This policy has no checks supporting pipeline results",
      );
    await this.automation.configure(
      session,
      id,
      body.enable,
      body.automationRevision,
    );
    await this.bindings.save(
      id,
      {
        expectedSelectionId: body.selectionId,
        expectedBindingId: body.bindingId ?? null,
        bindings: sources.supportedRuleIds.map((ruleId) => ({
          ruleId,
          kind: "workflow_run",
          workflowId: body.workflowId,
        })),
      },
      session.identityId,
    );
    await this.prisma.$transaction(async (tx) => {
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        id,
        "policy.publish",
      );
      const updated = await tx.readinessAutomation.updateMany({
        where: { repositoryId: repo.id, revision: body.automationRevision + 1 },
        data: { pipelineComments: body.comments, revision: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException(
          "Automation settings changed. Refresh and try again.",
        );
      await tx.auditEvent.create({
        data: {
          event: "pipeline.workflow.connected",
          actorId: session.identityId,
          metadata: {
            repositoryId: id,
            policyId: policy.id,
            workflowId: body.workflowId,
            comments: body.comments,
            enabled: body.enable,
          },
        },
      });
    });
    return { connected: true };
  }
  @Get("workflow")
  @Header("Cache-Control", "no-store")
  async workflow(
    @Param("repositoryId") id: string,
    @Query("policy") policyId: string,
    @Query("workflow") workflowId: string,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Query("refresh") refresh?: string,
  ) {
    const { repo, policy } = await this.context(
      req.preflytSession,
      id,
      policyId,
    );
    const source = await this.github.readPipelineWorkflow(
      repo.installationId,
      repo.githubId,
      workflowId,
      policy.branchRef,
      refresh === "true",
    );
    await this.access.requireRepository(req.preflytSession, id, "policy.read");
    return {
      ...source,
      ...inspectWorkflow(
        source.workflow,
        this.rules(policy.definition),
        policy.branchRef,
      ),
    };
  }
  private rules(definition: unknown) {
    return (definition as { rules: WorkflowRule[] }).rules;
  }
  @Post("installed")
  @Header("Cache-Control", "no-store")
  async installed(
    @Param("repositoryId") id: string,
    @Body() body: InstalledDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { repo, policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    await this.access.requireRepository(
      req.preflytSession,
      id,
      "policy.publish",
    );
    const source = await this.github.readPipelineWorkflow(
      repo.installationId,
      repo.githubId,
      body.workflowId,
      policy.branchRef,
      true,
    );
    validateSetupWorkflow(source.workflow, this.rules(policy.definition));
    const sources = await this.bindings.get(id, policy.id);
    const config = await this.prisma.readinessAutomation.findUnique({
      where: { repositoryId: repo.id },
    });
    return this.connect(
      id,
      {
        policyId: policy.id,
        selectionId: policy.selectionId,
        bindingId: sources.binding?.id ?? null,
        workflowId: body.workflowId,
        automationRevision: config?.revision ?? 0,
        comments: config?.pipelineComments ?? false,
        enable: config?.enabled ?? false,
      },
      req,
    );
  }
  @Post("draft")
  @Header("Cache-Control", "no-store")
  async draft(
    @Param("repositoryId") id: string,
    @Body() body: DraftDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    await this.access.requireRepository(
      req.preflytSession,
      id,
      "policy.publish",
    );
    const result = addPolicyChecks(
      body.workflow,
      body.jobId,
      this.rules(policy.definition),
      body.checkIds,
      publicPipelineUrl() ?? body.apiUrl,
    );
    return {
      ...result,
      ...inspectWorkflow(
        result.workflow,
        this.rules(policy.definition),
        policy.branchRef,
      ),
    };
  }
  @Post("validate")
  @Header("Cache-Control", "no-store")
  async validate(
    @Param("repositoryId") id: string,
    @Body() body: WorkflowDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    return inspectWorkflow(
      body.workflow,
      this.rules(policy.definition),
      policy.branchRef,
    );
  }
  @Post("rewrite")
  @Header("Cache-Control", "no-store")
  async rewrite(
    @Param("repositoryId") id: string,
    @Body() body: RewriteDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    const result = await this.ai.rewrite(
      req.preflytSession,
      id,
      policy.id,
      policy.branchRef,
      this.rules(policy.definition),
      body.workflow,
      body.instructions,
      publicPipelineUrl() ?? body.apiUrl,
      body.requestId,
    );
    await this.context(req.preflytSession, id, body.policyId);
    return {
      ...result,
      ...inspectWorkflow(
        result.workflow,
        this.rules(policy.definition),
        policy.branchRef,
      ),
    };
  }
  @Post("pull-request")
  @Header("Cache-Control", "no-store")
  async pullRequest(
    @Param("repositoryId") id: string,
    @Body() body: PullRequestDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { repo, policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    await this.access.requireRepository(
      req.preflytSession,
      id,
      "policy.publish",
    );
    await this.access.requireRepository(req.preflytSession, id, "policy.draft");
    if (policy.selectionId !== body.selectionId)
      throw new ConflictException("Policy changed. Refresh the editor.");
    validateSetupWorkflow(body.workflow, this.rules(policy.definition));
    const source = await this.github.readPipelineWorkflow(
      repo.installationId,
      repo.githubId,
      body.workflowId,
      policy.branchRef,
      true,
    );
    if (source.baseSha !== body.baseSha)
      throw new ConflictException(
        "The repository branch changed. Reload the workflow before creating a PR.",
      );
    const files = {
      ...(await this.actionFiles(
        String(readWorkflow(body.workflow).value.name ?? source.name),
      )),
      [source.path]: body.workflow,
    };
    const result = await this.github.createPipelineSetupPr(
      repo.installationId,
      repo.githubId,
      policy.branchRef,
      body.baseSha,
      files,
      body.requestId,
    );
    await this.prisma.auditEvent.create({
      data: {
        actorId: req.preflytSession.identityId,
        event: "pipeline.workflow.setup-pr.created",
        metadata: {
          repositoryId: id,
          organizationId: req.preflytSession.organizationId!,
          policyId: policy.id,
          workflowId: body.workflowId,
          url: result.url,
          number: result.number,
        },
      },
    });
    // A completed GitHub write must still return its URL if local configuration has raced.
    try {
      await this.connect(id, body, req);
      return { ...result, connectionSaved: true, connectionError: null };
    } catch {
      return {
        ...result,
        connectionSaved: false,
        connectionError:
          "Setup PR created. Save the workflow connection after refreshing this page.",
      };
    }
  }
  @Post("package")
  @Header("Cache-Control", "no-store")
  async package(
    @Param("repositoryId") id: string,
    @Body() body: WorkflowDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { repo, policy } = await this.context(
      req.preflytSession,
      id,
      body.policyId,
    );
    await this.access.requireRepository(
      req.preflytSession,
      id,
      "policy.publish",
    );
    validateSetupWorkflow(body.workflow, this.rules(policy.definition));
    const workflows = await this.github.discoverPipelineWorkflows(
      repo.installationId,
      repo.githubId,
    );
    const workflow = workflows.workflows.find(
      (item) => item.id === body.workflowId,
    );
    if (!workflow)
      throw new BadRequestException("Choose a repository workflow");
    const files = {
      ...(await this.actionFiles(
        String(readWorkflow(body.workflow).value.name ?? workflow.name),
      )),
      [workflow.path]: body.workflow,
    };
    return {
      archive: setupArchive(files),
      filename: "preflyt-workflow-setup.tar.gz",
    };
  }
  @Get("files")
  @Header("Cache-Control", "no-store")
  async files(
    @Param("repositoryId") id: string,
    @Query("policy") policyId: string,
    @Query("workflow") workflowId: string,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    const { repo } = await this.context(req.preflytSession, id, policyId);
    const workflows = await this.github.discoverPipelineWorkflows(
      repo.installationId,
      repo.githubId,
    );
    const workflow = workflows.workflows.find((item) => item.id === workflowId);
    if (!workflow)
      throw new BadRequestException("Choose the checks workflow first");
    return {
      archive: setupArchive(await this.actionFiles(workflow.name)),
      filename: "preflyt-action.tar.gz",
    };
  }
  private async actionFiles(workflowName: string) {
    const files: Record<string, string> = {};
    for (const name of ["action.yml", "run.py", "transport.py", "recipes.py"]) {
      let content: string | undefined;
      for (const root of [
        new URL("../../../../actions/policy-check/", import.meta.url),
        resolve(process.cwd(), "actions/policy-check"),
      ]) {
        try {
          content = await readFile(
            root instanceof URL ? new URL(name, root) : resolve(root, name),
            "utf8",
          );
          break;
        } catch {
          /* Try the packaged runtime location. */
        }
      }
      if (!content)
        throw new NotFoundException(
          "Action files are unavailable in this deployment",
        );
      files[`.github/actions/preflyt-policy/${name}`] = content;
    }
    files[".github/workflows/preflyt-gate.yml"] = publicationGateWorkflow(
      workflowName,
      publicPipelineUrl(),
    );
    return files;
  }
}
