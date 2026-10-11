import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { policyAction } from "../src/assessments/pipeline-action.js";
import { publicationGateWorkflow } from "../src/assessments/pipeline-gate-workflow.js";
import {
  PipelineGateController,
  publicationGateResult,
} from "../src/assessments/pipeline-gate.controller.js";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  standards: vi.fn().mockResolvedValue({ id: "selection" }),
}));
vi.mock("../src/standards/policy-standards.js", () => ({
  currentStandards: mocks.standards,
}));
vi.mock("../src/assessments/pipeline-identity.js", () => ({
  pipelineIdentity: mocks.identity,
}));
describe("final publication gate", () => {
  it("passes only a verified published success; missing, failed and stale results fail closed", () => {
    expect(publicationGateResult({ state: "PENDING" }, null).state).toBe(
      "PENDING",
    );
    expect(
      publicationGateResult(
        { state: "COMPLETE" },
        { state: "PUBLISHING", verifiedAt: null, conclusion: "success" },
      ).state,
    ).toBe("PENDING");
    expect(
      publicationGateResult(
        { state: "COMPLETE" },
        { state: "PUBLISHED", verifiedAt: new Date(), conclusion: "success" },
      ).state,
    ).toBe("PASSED");
    for (const conclusion of ["failure", "action_required", null])
      expect(
        publicationGateResult(
          { state: "COMPLETE" },
          { state: "PUBLISHED", verifiedAt: new Date(), conclusion },
        ).state,
      ).toBe("FAILED");
    expect(
      publicationGateResult(
        { state: "STALE" },
        { state: "PUBLISHED", verifiedAt: new Date(), conclusion: "success" },
      ).state,
    ).toBe("FAILED");
  });
  it("watches only the selected workflow and never checks out or runs the PR head", () => {
    const yaml = parse(
      publicationGateWorkflow("CI: build", "https://preflyt.example/api"),
    );
    expect(yaml.on.workflow_run).toEqual({
      workflows: ["CI: build"],
      types: ["completed"],
    });
    expect(yaml.jobs.publication["timeout-minutes"]).toBe(12);
    expect(yaml.jobs.publication.steps).toHaveLength(1);
    expect(yaml.jobs.publication.steps[0]).toMatchObject({
      uses: policyAction,
      with: {
        mode: "gate",
        "api-url": "https://preflyt.example/api",
        "source-run": "${{ github.event.workflow_run.id }}",
        "source-attempt": "${{ github.event.workflow_run.run_attempt }}",
      },
    });
    expect(yaml.jobs.publication.steps[0]).not.toHaveProperty("run");
    expect(yaml.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(yaml.jobs.publication.if).toContain(
      "head_repository.full_name == github.repository",
    );
    expect(() =>
      publicationGateWorkflow(
        "Preflyt publication gate",
        "https://preflyt.example",
      ),
    ).toThrow();
  });
  it("denies a gate from another branch or workflow before reading a submission", async () => {
    mocks.identity.mockResolvedValue({
      repository_id: "51",
      repository: "org/repo",
      run_id: "200",
      run_attempt: "1",
      event_name: "workflow_run",
      ref: "refs/heads/feature",
      workflow_ref:
        "org/repo/.github/workflows/preflyt-gate.yml@refs/heads/feature",
    });
    const prisma = {
      gitHubRepository: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            defaultBranch: "main",
            fullName: "org/repo",
            readinessAutomation: { enabled: true },
          }),
      },
      pipelineRunSubmission: { findFirst: vi.fn() },
    };
    await expect(
      new PipelineGateController(prisma as any, {} as any, {} as any).status(
        "Bearer token",
        "123",
        "1",
      ),
    ).rejects.toThrow();
    expect(prisma.pipelineRunSubmission.findFirst).not.toHaveBeenCalled();
  });
});

it("verifies the PR-head GitHub receipt and queries only the submitted assessment at the pinned policy", async () => {
  mocks.identity.mockResolvedValue({
    repository_id: "51",
    repository: "org/repo",
    run_id: "200",
    run_attempt: "1",
    sha: "gate-sha",
    event_name: "workflow_run",
    ref: "refs/heads/main",
    workflow_ref: "org/repo/.github/workflows/preflyt-gate.yml@refs/heads/main",
  });
  const prisma = {
    gitHubRepository: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "repo",
          githubId: 51n,
          installationId: 50n,
          defaultBranch: "main",
          fullName: "org/repo",
          readinessAutomation: {
            enabled: true,
            actorId: "actor",
            organizationId: "org",
          },
        }),
    },
    pipelineRunSubmission: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          state: "COMPLETE",
          prNumber: 7,
          sourceSha: "head",
          policyId: "policy",
          policyHash: "hash",
          assessmentId: "assessment",
        }),
    },
    gatePolicyRevision: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "policy", definitionHash: "hash" }),
    },
    gitHubCheckPublication: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "publication",
          checkRunId: "9",
          state: "PUBLISHED",
          verifiedAt: new Date(),
          conclusion: "success",
        }),
    },
  };
  const github = {
    readReadinessWorkflowRun: vi
      .fn()
      .mockImplementation(async (_installation, _repository, run) =>
        run === "200"
          ? {
              runAttempt: 1,
              sourceSha: "gate-sha",
              event: "workflow_run",
              workflowPath: ".github/workflows/preflyt-gate.yml",
              status: "in_progress",
            }
          : {
              runAttempt: 1,
              sourceSha: "head",
              event: "pull_request",
              status: "completed",
              conclusion: "success",
            },
      ),
    readPullRequest: vi
      .fn()
      .mockResolvedValue({
        context: {
          state: "open",
          draft: false,
          head: { sha: "head", repositoryId: "51" },
          base: { ref: "main", repositoryId: "51" },
        },
      }),
    readPublishedReadinessCheck: vi
      .fn()
      .mockResolvedValue({ externalId: "publication", conclusion: "success" }),
  };
  const controller = new PipelineGateController(
    prisma as any,
    { requireRepository: vi.fn() } as any,
    github as any,
  );
  expect((await controller.status("Bearer token", "123", "1")).state).toBe(
    "PASSED",
  );
  expect(prisma.gitHubCheckPublication.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        repositoryId: "repo",
        organizationId: "org",
        assessmentId: "assessment",
        sourceSha: "head",
        policyId: "policy",
        policyHash: "hash",
      },
    }),
  );
  expect(github.readPublishedReadinessCheck).toHaveBeenCalledWith(
    50n,
    51n,
    "9",
    "head",
  );
  github.readPublishedReadinessCheck.mockResolvedValue({
    externalId: "other-assessment",
    conclusion: "success",
  });
  expect((await controller.status("Bearer token", "123", "1")).state).toBe(
    "FAILED",
  );
  github.readPublishedReadinessCheck.mockRejectedValue(
    new Error("GitHub unavailable"),
  );
  await expect(controller.status("Bearer token", "123", "1")).rejects.toThrow(
    "GitHub unavailable",
  );
});
