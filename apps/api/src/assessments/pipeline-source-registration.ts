import { checkReportFormat } from "./check-report-adapters.js";
import { identityMatches, type Binding } from "./ci-binding.js";

// Called inside the repository-locked transaction after completed-run verification.
// Registers source identity only; it never changes execution or gate outcomes.
export async function registerPipelineSources(
  tx: any,
  input: {
    repositoryId: string;
    selectionId: string;
    workflowId: string;
    actorId: string;
    submissionId: string;
    ruleIds: string[];
  },
) {
  const latest = await tx.repositoryCiBindings.findFirst({
    where: { repositoryId: input.repositoryId },
    orderBy: { revision: "desc" },
  });
  const previous = await tx.repositoryCiBindings.findFirst({
    where: { repositoryId: input.repositoryId, selectionId: input.selectionId },
    orderBy: { revision: "desc" },
  });
  const old = (previous?.bindings ?? []) as Binding[];
  const ids = [...new Set(input.ruleIds.filter((id) => checkReportFormat(id)))];
  if (
    !ids.length ||
    ids.every((ruleId) =>
      old.some(
        (binding) =>
          binding.ruleId === ruleId &&
          identityMatches(binding, {
            kind: "workflow_run",
            workflowId: input.workflowId,
          }),
      ),
    )
  )
    return previous;
  const bindings: Binding[] = [
    ...old.filter((binding) => !ids.includes(binding.ruleId)),
    ...ids.map((ruleId) => ({
      ruleId,
      kind: "workflow_run" as const,
      workflowId: input.workflowId,
    })),
  ].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const saved = await tx.repositoryCiBindings.create({
    data: {
      repositoryId: input.repositoryId,
      selectionId: input.selectionId,
      revision: (latest?.revision ?? 0) + 1,
      bindings,
    },
  });
  await tx.auditEvent.create({
    data: {
      event: "pipeline.workflow.registered",
      actorId: input.actorId,
      metadata: {
        repositoryId: input.repositoryId,
        submissionId: input.submissionId,
        selectionId: input.selectionId,
        workflowId: input.workflowId,
        bindingId: saved.id,
        ruleIds: ids,
      },
    },
  });
  return saved;
}
