import type { SkillManifest } from "./review-skills.js";
/** Only a profile pinned to this assessment's exact commit can select a constrained skill. */
export function skillApplicability(
  skill: Pick<SkillManifest, "languages" | "frameworks">,
  profile: { sourceSha: string; report: unknown } | null,
  sourceSha: string,
) {
  const languages = skill.languages ?? [],
    frameworks = skill.frameworks ?? [];
  if (!languages.length && !frameworks.length)
    return { eligible: true, reason: null };
  if (!profile || profile.sourceSha !== sourceSha)
    return {
      eligible: false,
      reason: "Skipped: no language/framework profile for this commit",
    };
  const signals = (
    profile.report as {
      signals?: { id: string; state: string; observations: string[] }[];
    }
  )?.signals;
  const match = (id: string, values: string[]) =>
    !values.length ||
    (Array.isArray(signals) &&
      signals.some(
        (s) =>
          s.id === id &&
          s.state === "detected" &&
          Array.isArray(s.observations) &&
          s.observations.some((v) => values.includes(v.toLowerCase())),
      ));
  return match("languages", languages) && match("frameworks", frameworks)
    ? { eligible: true, reason: null }
    : {
        eligible: false,
        reason: "Skipped: language/framework scope does not match",
      };
}
