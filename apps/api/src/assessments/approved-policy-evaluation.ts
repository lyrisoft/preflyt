import { digest } from "./assessment-digest.js";
import type { ApprovedException } from "./policy-exception-contract.js";
import type { evaluatePublishedPolicy } from "./published-policy-evaluation.js";

/** Preserve original outcomes. Human exceptions are a separate, explicit result. */
export function applyApprovedExceptions(
  evaluation: ReturnType<typeof evaluatePublishedPolicy>,
  approved: ApprovedException[],
  definition: { rules: { id: string; operator: string }[] },
  integrityVerified: boolean,
) {
  const applicable = integrityVerified ? approved : [];
  const used = new Map<string, ApprovedException>();
  const rules = evaluation.rules.map((rule: any) => {
    const exception =
      rule.required && rule.status !== "PASS"
        ? applicable
            .filter((row) => row.ruleIds.includes(rule.ruleId))
            .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0]
        : undefined;
    if (!exception) return rule;
    used.set(exception.id, exception);
    return {
      ...rule,
      observedStatus: rule.status,
      status: "EXCEPTED",
      reasons: [...rule.reasons, "INDEPENDENT_REVIEWED_EXCEPTION"],
      exceptionId: exception.id,
    };
  });
  const required = rules.filter((rule: any) => rule.required);
  const verifiedUnwaivedExecution = required.some(
    (rule: any) =>
      rule.status === "PASS" &&
      definition.rules.some(
        (d) =>
          d.id === rule.ruleId && d.operator === "verified_check_succeeded",
      ),
  );
  const status = !used.size
    ? evaluation.status
    : required.some((rule: any) => rule.status === "BLOCK")
      ? "BLOCK"
      : !verifiedUnwaivedExecution ||
          required.some(
            (rule: any) => !["PASS", "EXCEPTED"].includes(rule.status),
          )
        ? "INCOMPLETE"
        : rules.some((rule: any) => !rule.required && rule.status !== "PASS")
          ? "WARN"
          : "PASS_WITH_EXCEPTION";
  const { evaluationHash: _previousHash, ...original } = evaluation;
  const result = {
    ...original,
    observedStatus: evaluation.status,
    status,
    rules,
    requiredRulesSatisfied: required.filter(
      (rule: any) => rule.status === "PASS",
    ).length,
    requiredRulesBlocked: required.filter(
      (rule: any) => rule.status === "BLOCK",
    ).length,
    requiredRulesIncomplete: required.filter(
      (rule: any) => rule.status === "INCOMPLETE",
    ).length,
    requiredRulesExcepted: required.filter(
      (rule: any) => rule.status === "EXCEPTED",
    ).length,
    exceptions: [...used.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({
        id: row.id,
        requestHash: row.requestHash,
        expiresAt: row.expiresAt.toISOString(),
        approvedById: row.approvedById,
      })),
  };
  return { ...result, evaluationHash: digest(result) };
}
