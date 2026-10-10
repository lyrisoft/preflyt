import { BadRequestException } from "@nestjs/common";
import { digest } from "./assessment-digest.js";

export const maximumExceptionHours = 168;
export type ExceptionScope = {
  organizationId: string;
  repositoryId: string;
  policyId: string;
  policyHash: string;
  branchRef: string;
  sourceSha: string;
  ruleIds: string[];
  reason: string;
  requestedById: string;
  expiresAt: Date;
};
/** Canonical human-reviewed scope: later edits require a different request. */
export function exceptionRequestHash(scope: ExceptionScope) {
  const {
    organizationId,
    repositoryId,
    policyId,
    policyHash,
    branchRef,
    sourceSha,
    reason,
    requestedById,
  } = scope;
  return digest({
    organizationId,
    repositoryId,
    policyId,
    policyHash,
    branchRef,
    sourceSha,
    reason,
    requestedById,
    ruleIds: [...scope.ruleIds].sort(),
    expiresAt: scope.expiresAt.toISOString(),
  });
}
export function validateExceptionRequest(
  input: {
    sourceSha: string;
    ruleIds: string[];
    reason: string;
    expiresAt: string;
  },
  policy: { rules?: { id: string; required: boolean; operator: string }[] },
  now = new Date(),
) {
  const expiresAt = new Date(input.expiresAt);
  const reason = input.reason.trim();
  if (
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !Array.isArray(input.ruleIds) ||
    !input.ruleIds.length ||
    input.ruleIds.length > 10 ||
    input.ruleIds.some(
      (id) => typeof id !== "string" || !id || id.length > 80,
    ) ||
    new Set(input.ruleIds).size !== input.ruleIds.length ||
    reason.length < 20 ||
    reason.length > 2000 ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > maximumExceptionHours * 3600000
  )
    throw new BadRequestException(
      "Choose up to 10 checks, explain the reason in at least 20 characters and set an expiry within seven days",
    );
  const rules = policy.rules ?? [];
  if (
    input.ruleIds.some(
      (id) => !rules.some((rule) => rule.id === id && rule.required),
    )
  )
    throw new BadRequestException(
      "Choose required checks from the current published policy",
    );
  if (
    !rules.some(
      (rule) =>
        rule.required &&
        rule.operator === "verified_check_succeeded" &&
        !input.ruleIds.includes(rule.id),
    )
  )
    throw new BadRequestException(
      "At least one required execution check must remain without an exception",
    );
  return {
    sourceSha: input.sourceSha,
    ruleIds: [...input.ruleIds].sort(),
    reason,
    expiresAt,
  };
}
export type ApprovedException = ExceptionScope & {
  id: string;
  state: string;
  requestHash: string;
  approvedById: string | null;
  approvedAt: Date | null;
};
/** Actor permissions and proof-linked identity checks must be resolved by the service. */
export function matchesExceptionScope(
  row: ApprovedException,
  scope: Pick<
    ExceptionScope,
    | "organizationId"
    | "repositoryId"
    | "policyId"
    | "policyHash"
    | "branchRef"
    | "sourceSha"
  >,
  now = new Date(),
) {
  return (
    row.state === "APPROVED" &&
    !!row.approvedById &&
    row.approvedById !== row.requestedById &&
    !!row.approvedAt &&
    row.approvedAt <= now &&
    row.expiresAt > now &&
    row.requestHash === exceptionRequestHash(row) &&
    Object.entries(scope).every(
      ([key, value]) => row[key as keyof typeof scope] === value,
    )
  );
}
