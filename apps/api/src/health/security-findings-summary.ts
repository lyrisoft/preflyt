import { healthCategoryMetric } from "./health-categories.js";
import { healthFindingCount, type HealthReport } from "./health-report.js";
type Saved = {
  id: string;
  finishedAt: Date | null;
  report: HealthReport | null;
};
/** One presentation total; AI evidence does not change deterministic health. */
export function securityFindingsSummary(
  standard: Saved | undefined,
  ai: Saved | undefined,
) {
  if (!standard && !ai) return null;
  const standardValue = standard?.report
    ? healthCategoryMetric(standard.report, "security")
    : "Unavailable";
  const standardCount = standard?.report
    ? healthFindingCount(standard.report, "security", [
        "secrets.scan",
        "security.sast",
        "security.dependencies",
        "iac.policy",
      ])
    : 0;
  const aiCount = ai?.report
    ? healthFindingCount(ai.report, "security", ["security.strix"])
    : 0;
  const partial =
    standardValue === "Unavailable" ||
    standardValue.startsWith("≥") ||
    (!!ai?.report && ai.report.completeness !== "COMPLETE");
  const count = standardCount + aiCount;
  const ids = [
    ...new Set([standard?.id, ai?.id].filter((id): id is string => !!id)),
  ];
  return {
    assessmentId: standard?.id ?? ai!.id,
    assessmentIds: ids,
    standardFindings: standardCount,
    aiFindings: aiCount,
    finishedAt:
      [standard?.finishedAt, ai?.finishedAt]
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    value: partial
      ? count
        ? `≥${count.toLocaleString()}`
        : "Unavailable"
      : count.toLocaleString(),
  };
}
