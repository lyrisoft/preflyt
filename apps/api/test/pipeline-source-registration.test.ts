import { expect, it, vi } from "vitest";
import { registerPipelineSources } from "../src/assessments/pipeline-source-registration.js";
const input = {
  repositoryId: "repo",
  selectionId: "policy-selection",
  workflowId: "123",
  actorId: "actor",
  submissionId: "run",
  ruleIds: ["security.sast", "security.sast"],
};
it("registers exact report check IDs, preserves other sources and advances repository revision", async () => {
  const other = {
    ruleId: "tests.required",
    kind: "check_run",
    appId: "5",
    checkName: "Tests",
  };
  const tx = {
    repositoryCiBindings: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ revision: 9 })
        .mockResolvedValueOnce({ bindings: [other] }),
      create: vi.fn().mockResolvedValue({ id: "binding" }),
    },
    auditEvent: { create: vi.fn() },
  };
  await registerPipelineSources(tx, input);
  expect(tx.repositoryCiBindings.create).toHaveBeenCalledWith({
    data: {
      repositoryId: "repo",
      selectionId: "policy-selection",
      revision: 10,
      bindings: [
        { ruleId: "security.sast", kind: "workflow_run", workflowId: "123" },
        other,
      ],
    },
  });
  expect(tx.auditEvent.create).toHaveBeenCalledOnce();
});
it("does not create another revision for a retry of the same connection", async () => {
  const tx = {
    repositoryCiBindings: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          revision: 10,
          bindings: [
            {
              ruleId: "security.sast",
              kind: "workflow_run",
              workflowId: "123",
            },
          ],
        }),
      create: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  };
  await registerPipelineSources(tx, input);
  expect(tx.repositoryCiBindings.create).not.toHaveBeenCalled();
});
