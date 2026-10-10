import { describe, expect, it, vi } from "vitest";
import {
  PipelineProcessingService,
  pipelineComment,
} from "../src/assessments/pipeline-processing.service.js";

describe("durable pipeline processing", () => {
  it("never processes a claimed submission after repository automation is disabled", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      pipelineRunSubmission: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "receipt", repositoryId: "repo", organizationId: "org" },
          ]),
        updateMany,
      },
      gitHubRepository: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            selected: true,
            available: true,
            readinessAutomation: { enabled: false },
          }),
      },
    };
    const github = {
      readReadinessWorkflowRun: vi.fn(),
      publishPipelineComment: vi.fn(),
    };
    const assessments = { createAutomatic: vi.fn() };
    await new PipelineProcessingService(
      prisma as any,
      {} as any,
      github as any,
      assessments as any,
    ).reconcile();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "STALE",
          failureCode: "ACCESS_OR_CONFIGURATION_CHANGED",
          leaseToken: null,
        }),
      }),
    );
    expect(github.readReadinessWorkflowRun).not.toHaveBeenCalled();
    expect(github.publishPipelineComment).not.toHaveBeenCalled();
    expect(assessments.createAutomatic).not.toHaveBeenCalled();
  });
  it("keeps an unverified evaluation incomplete and prevents check titles from mentioning users", () => {
    const comment = pipelineComment("a".repeat(40), "123", "assessment", {
      status: "INCOMPLETE",
      requiredRules: 1,
      requiredRulesSatisfied: 0,
      requiredRulesBlocked: 0,
      requiredRulesIncomplete: 1,
      rules: [
        {
          title: "@everyone <script> | fake\nrow",
          ruleId: "test",
          status: "INCOMPLETE",
        },
      ],
    } as any);
    expect(comment).toContain("Preflyt policy: Incomplete");
    expect(comment).toContain("0/1 required checks passed");
    expect(comment).not.toContain("@everyone");
    expect(comment).not.toContain("<script>");
  });
});
