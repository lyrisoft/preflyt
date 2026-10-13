import { digest } from "../assessments/assessment-digest.js";
import {
  adoptionProfiles,
  ruleRequirementsDigest,
  type Rule,
  resolvePacks,
  type AdoptionProfile,
  type StandardPack,
  type PackRef,
} from "../standards/catalogue.js";
/** Compose additive requirements only; conflicting versions never silently win. */
export function composeTeamStandards(
  sources: {
    label: string;
    profile: string;
    packs: (PackRef & { digest: string })[];
  }[],
) {
  const packs = new Map<string, PackRef & { digest: string }>();
  const conflicts: string[] = [];
  let profile: AdoptionProfile = "DEFAULT";
  for (const source of sources) {
    if (!adoptionProfiles.includes(source.profile as AdoptionProfile))
      conflicts.push(`${source.label}: unsupported profile`);
    if (
      adoptionProfiles.indexOf(source.profile as AdoptionProfile) >
      adoptionProfiles.indexOf(profile)
    )
      profile = source.profile as AdoptionProfile;
    for (const ref of source.packs) {
      const pack = resolvePacks([ref])[0];
      if (!pack || pack.digest !== ref.digest) {
        conflicts.push(
          `${source.label}: standard version could not be verified`,
        );
        continue;
      }
      const prior = packs.get(ref.id);
      if (
        prior &&
        (prior.version !== ref.version || prior.digest !== ref.digest)
      )
        conflicts.push(`${source.label}: conflicting versions of ${ref.id}`);
      else packs.set(ref.id, ref);
    }
  }
  if (packs.size > 5)
    conflicts.push(
      "This repository would exceed the supported limit of five standards. Choose a combined organization standard.",
    );
  const rules = new Map<string, Rule>();
  const ai = new Map<string, unknown>();
  for (const ref of packs.values()) {
    const pack = resolvePacks([ref])[0]! as StandardPack;
    for (const rule of pack.rules) {
      if (rules.has(rule.id) && ruleRequirementsDigest(rules.get(rule.id)!) !== ruleRequirementsDigest(rule))
        conflicts.push(`Conflicting definitions of ${rule.id}`);
      else rules.set(rule.id, rule);
    }
    for (const check of pack.aiChecks ?? []) {
      if (ai.has(check.id) && digest(ai.get(check.id)) !== digest(check))
        conflicts.push(`Conflicting AI Review versions of ${check.id}`);
      else ai.set(check.id, check);
    }
  }
  return {
    profile,
    packs: [...packs.values()].sort((a, b) => a.id.localeCompare(b.id)),
    conflicts: [...new Set(conflicts)],
  };
}
