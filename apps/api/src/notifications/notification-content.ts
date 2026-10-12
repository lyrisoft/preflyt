/** Notification copy describes recorded events, never GitHub merge permission. */
export const notificationCopy: Record<
  string,
  { title: string; message: string; actionLabel: string }
> = {
  HEALTH_ASSESSMENT_COMPLETED: { title: "Repository health assessment completed", message: "Review the revision report and any analyzer findings. This report does not grant merge permission.", actionLabel: "View health report" },
  HEALTH_ASSESSMENT_PARTIAL: { title: "Repository health assessment is incomplete", message: "Some analysis could not run or establish full coverage. Open Health to review the available findings, limits and next action.", actionLabel: "Review partial report" },
  HEALTH_ASSESSMENT_FAILED: { title: "Repository health assessment could not finish", message: "Source access or analysis could not be verified. Open Health to review the reason and reassess when it is resolved.", actionLabel: "Review health assessment" },
  ASSESSMENT_COMPLETED: {
    title: "Assessment saved",
    message:
      "An assessment was saved. Open the report to see the checks evaluated and their evidence; saving an assessment does not mean every check passed.",
    actionLabel: "View assessment",
  },
  ASSESSMENT_FAILED: {
    title: "Assessment recorded failed checks",
    message:
      "The assessment recorded a failed CI result or native check. Review the affected checks, fix the failure and rerun the workflow for this commit.",
    actionLabel: "Review failed checks",
  },
  ASSESSMENT_INCOMPLETE: {
    title: "Assessment is missing required evidence",
    message:
      "Required checks could not be fully evaluated. Open the report to identify missing, outdated or unverified results, then rerun the relevant workflow.",
    actionLabel: "Review missing evidence",
  },
  CRITICAL_FINDINGS_REPORTED: {
    title: "Critical security findings recorded",
    message:
      "A saved scan report contains unsuppressed critical findings. Review the findings and affected files, address them and rerun the scan.",
    actionLabel: "Review security findings",
  },
  NATIVE_EXECUTION_FAILED: {
    title: "Check execution failed",
    message:
      "Preflyt could not complete a native check execution for this commit. Review the execution details before retrying; this does not mean a vulnerability was found.",
    actionLabel: "Review execution",
  },
  POLICY_PUBLISHED: {
    title: "Policy published",
    message:
      "A new policy revision was published for this repository. Review its branch and required standards. GitHub merge blocking is configured separately in Merge Protection.",
    actionLabel: "View published policy",
  },
  READINESS_BLOCKED: {
    title: "PR policy check reported a failure",
    message:
      "The Preflyt policy evaluation found a blocking result for this commit. Review the PR checks, fix the failing requirement and rerun its workflow. GitHub decides whether merging is allowed.",
    actionLabel: "Review PR checks",
  },
  READINESS_INCOMPLETE: {
    title: "PR policy check could not finish",
    message:
      "The Preflyt policy evaluation could not confirm all required results for this commit. Review the missing or unverified checks and ensure their workflows finish for the current commit.",
    actionLabel: "Review PR checks",
  },
  RULESET_ACTIVATED: {
    title: "GitHub merge protection activated",
    message:
      "Preflyt activated a managed GitHub ruleset. Its branch rules now apply in GitHub. Review the protected branches and required checks.",
    actionLabel: "View branch rules",
  },
  RULESET_ROLLED_BACK: {
    title: "Managed GitHub merge protection disabled",
    message:
      "Preflyt rolled back the managed GitHub ruleset. Other GitHub rulesets or branch protections may still apply. Review the remaining protection before merging.",
    actionLabel: "Review branch protection",
  },
  RULESET_DRIFTED: {
    title: "GitHub branch rules changed outside Preflyt",
    message:
      "The current GitHub rules differ from the rules Preflyt deployed. Review the deployment and current GitHub configuration before restoring or accepting the change.",
    actionLabel: "Review changed rules",
  },
  AI_MODEL_UNAVAILABLE: {
    title: "AI model requests repeatedly failed",
    message:
      "Repeated requests to a configured model failed, so affected AI reviews could not complete. Test the primary and fallback connections and check provider availability.",
    actionLabel: "Check model connections",
  },
  AI_REVIEW_BUDGET_REACHED: {
    title: "Previous AI review could not start",
    message:
      "This review was blocked by previous AI settings. Check the current model configuration in Model Router and retry the review. Changing settings does not restart the previous review.",
    actionLabel: "Review model settings",
  },
};
export function notificationContent(
  type: string,
  report?: unknown,
  policy?: { branchRef: string; revision: number },
) {
  const copy = (Object.hasOwn(notificationCopy, type)
    ? notificationCopy[type]
    : undefined) ?? {
    title: "Repository update",
    message:
      "A repository event was recorded. Open its details to review what changed.",
    actionLabel: "View details",
  };
  const details: string[] = [];
  if (type === "POLICY_PUBLISHED" && policy)
    details.push(
      `Branch: ${policy.branchRef} · Policy revision ${policy.revision}`,
    );
  const value = report as
    { checks?: unknown; observations?: { result?: string }[] } | undefined;
  if (Array.isArray(value?.checks)) {
    const checks = value.checks.filter(
      (c): c is Record<string, unknown> =>
        !!c && typeof c === "object" && !Array.isArray(c),
    );
    const names = (items: Record<string, unknown>[]) =>
      items
        .slice(0, 3)
        .map((c) =>
          typeof c.title === "string"
            ? c.title.slice(0, 120)
            : typeof c.ruleId === "string"
              ? c.ruleId.slice(0, 120)
              : "Unnamed check",
        )
        .join(", ") + (items.length > 3 ? ` and ${items.length - 3} more` : "");
    const failed = checks.filter(
      (c) =>
        c.providerResult === "FAILED" ||
        (c.evidenceSource === "NATIVE" && c.nativeOutcome === "FAIL"),
    );
    const hasNativeResult = (c: Record<string, unknown>) =>
      c.evidenceSource === "NATIVE" &&
      ["PASS", "FAIL"].includes(String(c.nativeOutcome));
    const missing = checks.filter(
      (c) =>
        !hasNativeResult(c) &&
        c.required === true &&
        [
          "MISSING",
          "UNKNOWN",
          "UNSUPPORTED",
          "SKIPPED",
          "PENDING",
          "EXPIRED",
          "FUTURE",
          "SUPERSEDED",
        ].includes(String(c.coverage)),
    );
    const unverified = checks.filter(
      (c) =>
        !hasNativeResult(c) &&
        c.required === true &&
        ["UNVERIFIED", "INVALID", "AMBIGUOUS"].includes(String(c.coverage)),
    );
    details.push(
      `${checks.length} check${checks.length === 1 ? "" : "s"} recorded · ${checks.filter((c) => c.required === true).length} required`,
    );
    const failedObservations = Array.isArray(value?.observations)
      ? value.observations.filter((o) => o?.result === "FAILED").length
      : 0;
    if (failedObservations && !failed.length)
      details.push(
        `${failedObservations} failed CI result${failedObservations === 1 ? "" : "s"} recorded; open the report for details`,
      );
    if (failed.length) details.push(`Reported failures: ${names(failed)}`);
    if (missing.length)
      details.push(`Missing or unusable evidence: ${names(missing)}`);
    if (unverified.length)
      details.push(`Results needing verification: ${names(unverified)}`);
  }
  return { ...copy, details };
}
