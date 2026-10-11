import {
  checkReportAdapters,
  checkReportFormat,
} from "../assessments/check-report-adapters.js";
import { digest as contentDigest } from "../assessments/assessment-digest.js";
import { createHash } from "node:crypto";
import type { ProfileSignal } from "../github/repository-profile.js";
export type AdoptionProfile = "DEFAULT" | "RECOMMENDED" | "STRICT";
export const adoptionProfiles = ["DEFAULT", "RECOMMENDED", "STRICT"] as const;
export type Rule = {
  id: string;
  version: string;
  title: string;
  risk: string;
  signal: string | null;
  check: string;
  capability: "available" | "import_only" | "planned";
  requiredIn: AdoptionProfile[];
  severity: "critical" | "high" | "medium";
  operator: string;
  onMissing: "INCOMPLETE";
  allowedSources: string[];
  maxAgeHours: number;
  applicability: string;
  thresholds: { maxFailedChecks: number; minimumExecutedTests?: number };
  exceptionEligible: boolean;
  defaultEnforcement: "observe";
  guidance: string;
  workflowCommand?: string;
  reportPath?: string;
  rationale: string;
};
function rule(
  id: string,
  title: string,
  signal: string | null,
  capability: Rule["capability"],
  core = false,
): Rule {
  return {
    id,
    version: "1.0.0",
    title,
    signal,
    check: id,
    capability,
    requiredIn: core
      ? ["DEFAULT", "RECOMMENDED", "STRICT"]
      : ["RECOMMENDED", "STRICT"],
    severity: id.startsWith("secrets") ? "critical" : "high",
    risk: "Missing or unverified engineering evidence can allow defects to reach later lifecycle stages.",
    operator:
      capability === "available"
        ? "configuration_hint_present"
        : "verified_check_succeeded",
    onMissing: "INCOMPLETE",
    allowedSources:
      capability === "available"
        ? ["pinned_repository_profile"]
        : ["verified_imported_ci", "approved_sandbox"],
    maxAgeHours: 24,
    applicability:
      "Selected repository; repository, pull-request and CI stages.",
    thresholds: {
      maxFailedChecks: 0,
      ...(id === "tests.required" ? { minimumExecutedTests: 1 } : {}),
    },
    exceptionEligible: true,
    defaultEnforcement: "observe",
    guidance:
      "Configure the named control and collect revision-bound, trusted evidence. Configuration alone does not establish compliance.",
    rationale: "/docs/product/engineering-standards-library.md",
  };
}
/** Names and remediation text do not change evaluation requirements. */
export function ruleRequirementsDigest(value: Rule & { packIds?: string[] }) {
  const {
    title: _title,
    guidance: _guidance,
    workflowCommand: _command,
    reportPath: _path,
    packIds: _packIds,
    ...requirements
  } = value;
  return contentDigest(requirements);
}
export type CheckInput = {
  id: string;
  title: string;
  guidance: string;
  workflowCommand?: string;
  reportPath?: string;
};
export function validCheckWorkflow(
  input: Pick<CheckInput, "workflowCommand" | "reportPath">,
) {
  return (
    (input.workflowCommand === undefined ||
      (typeof input.workflowCommand === "string" &&
        input.workflowCommand.length <= 4000 &&
        !input.workflowCommand.includes("\0"))) &&
    (input.reportPath === undefined ||
      (typeof input.reportPath === "string" &&
        !!input.reportPath.trim() &&
        input.reportPath.length <= 512 &&
        !input.reportPath.startsWith("/") &&
        !input.reportPath.split("/").includes("..") &&
        !/[\x00-\x1f\\]/.test(input.reportPath)))
  );
}
export function checkWorkflow(
  input: Pick<CheckInput, "workflowCommand" | "reportPath">,
) {
  return {
    ...(input.workflowCommand?.trim()
      ? { workflowCommand: input.workflowCommand.trim() }
      : {}),
    ...(input.reportPath?.trim()
      ? { reportPath: input.reportPath.trim() }
      : {}),
  };
}
export function customRule(input: CheckInput): Rule | undefined {
  if (
    !input ||
    typeof input.id !== "string" ||
    !input.id.startsWith("custom-") ||
    !checkReportFormat(input.id) ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120 ||
    typeof input.guidance !== "string" ||
    input.guidance.length > 4000 ||
    !validCheckWorkflow(input)
  )
    return;
  return {
    ...rule(input.id, input.title.trim(), null, "import_only"),
    guidance: input.guidance.trim(),
    ...checkWorkflow(input),
    allowedSources: ["verified_imported_ci"],
    thresholds: {
      maxFailedChecks: 0,
      ...(checkReportFormat(input.id) === "junit"
        ? { minimumExecutedTests: 1 }
        : {}),
    },
  };
}
function validOrganizationRule(value: Rule): boolean {
  if (
    !value ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 120 ||
    typeof value.guidance !== "string" ||
    value.guidance.length > 4000 ||
    !validCheckWorkflow(value)
  )
    return false;
  if (typeof value.id === "string" && value.id.startsWith("custom-")) {
    const canonical = customRule(value);
    return !!canonical && contentDigest(canonical) === contentDigest(value);
  }
  return catalogueVersions.some((pack) =>
    pack.rules.some(
      (known) =>
        known.id === value.id &&
        contentDigest({
          ...known,
          title: value.title,
          guidance: value.guidance,
          ...checkWorkflow(value),
        }) === contentDigest(value),
    ),
  );
}
const tests = rule(
  "tests.required",
  "Required test execution",
  "tests",
  "import_only",
  true,
);
const types = rule("types.required", "Type checking", null, "planned");
const lint = rule("lint.required", "Lint validation", null, "planned");
const build = rule("build.required", "Build validation", null, "planned");
const secrets = rule(
  "secrets.scan",
  "Secret scanning",
  "gitleaks",
  "planned",
  true,
);
const packs = [
  {
    id: "baseline-engineering",
    title: "Baseline Engineering",
    description: "Core CI, tests, dependency hygiene and secret controls.",
    repositoryTypes: ["all"],
    rules: [
      rule("ci.configured", "CI configuration", "ci", "available", true),
      tests,
      secrets,
      rule(
        "dependencies.locked",
        "Dependency lockfiles",
        "lockfiles",
        "available",
      ),
    ],
  },
  {
    id: "application-security",
    title: "Application Security",
    description: "SAST, dependency vulnerability and secret evidence.",
    repositoryTypes: ["all"],
    rules: [
      secrets,
      rule(
        "security.sast",
        "Static application security",
        "semgrep",
        "import_only",
      ),
      rule(
        "security.dependencies",
        "Dependency vulnerability scan",
        "trivy",
        "planned",
      ),
    ],
  },
  {
    id: "backend-service",
    title: "Backend Services",
    description: "Backend build, tests, types and service resilience evidence.",
    repositoryTypes: ["backend"],
    rules: [
      tests,
      types,
      lint,
      build,
      {
        ...rule(
          "service.resilience",
          "Timeout and retry controls",
          null,
          "planned",
        ),
        requiredIn: ["STRICT"] as AdoptionProfile[],
      },
    ],
  },
  {
    id: "frontend-application",
    title: "Frontend Applications",
    description:
      "Frontend build, component tests, types and dependency controls.",
    repositoryTypes: ["frontend"],
    rules: [
      tests,
      types,
      lint,
      build,
      rule(
        "frontend.components",
        "Component test coverage",
        "tests",
        "planned",
      ),
    ],
  },
  {
    id: "infrastructure-as-code",
    title: "Infrastructure as Code",
    description: "IaC policy, container and infrastructure exposure evidence.",
    repositoryTypes: ["infrastructure"],
    rules: [
      rule("iac.policy", "Infrastructure policy checks", "checkov", "planned"),
      rule(
        "containers.scan",
        "Container vulnerability scan",
        "trivy",
        "planned",
      ),
      rule(
        "iac.exposures",
        "Unsafe infrastructure exposures",
        "iac",
        "planned",
      ),
    ],
  },
].map((pack) => ({
  schemaVersion: 1,
  version: "1.0.0",
  owner: "Lyrisoft Technologies",
  languages: ["*"],
  stages: ["repository", "pull_request", "ci"],
  changelog: ["Initial catalogue; no policy enforcement."],
  ...pack,
}));
// Publish immutable definitions. New versions must be added, never edited in place after release.
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const legacyCatalogue = freeze(
  packs.map((pack) => ({
    ...pack,
    digest: createHash("sha256").update(JSON.stringify(pack)).digest("hex"),
  })),
);
/** New definitions enable implemented CI report adapters; published 1.0.0 stays immutable. */
export const catalogue = freeze(
  legacyCatalogue.map(({ digest: _digest, ...pack }) => {
    const updated = {
      ...pack,
      version: "1.1.0",
      changelog: [
        "Trusted pipeline report adapters for all engineering checks. Existing selections keep their saved version.",
      ],
      rules: pack.rules.map((control) =>
        control.capability === "planned" && checkReportAdapters[control.id]
          ? {
              ...control,
              version: "1.1.0",
              capability: "import_only" as const,
              guidance:
                "Collect a report from an approved, commit-pinned workflow that executes this named control. Review the workflow's coverage before approving it; missing or unverified execution stays incomplete.",
            }
          : control,
      ),
    };
    return {
      ...updated,
      digest: createHash("sha256")
        .update(JSON.stringify(updated))
        .digest("hex"),
    };
  }),
);
export const catalogueVersions = freeze([...legacyCatalogue, ...catalogue]);
export type AiCheck = {
  id: string;
  title: string;
  kind: "AI_REVIEW";
  mode: "ADVISORY";
  skillId: string;
  skillVersion: number;
  skillDigest: string;
  stages: ("repository" | "pull_request")[];
};
export function validAiCheck(c: AiCheck): boolean {
  return (
    !!c &&
    Object.keys(c).sort().join(",") ===
      "id,kind,mode,skillDigest,skillId,skillVersion,stages,title" &&
    /^ai-review-[a-f0-9-]{36}$/.test(c.id) &&
    typeof c.title === "string" &&
    !!c.title.trim() &&
    c.title.length <= 120 &&
    c.kind === "AI_REVIEW" &&
    c.mode === "ADVISORY" &&
    /^[a-f0-9-]{36}$/.test(c.skillId) &&
    Number.isInteger(c.skillVersion) &&
    c.skillVersion > 0 &&
    /^[a-f0-9]{64}$/.test(c.skillDigest) &&
    Array.isArray(c.stages) &&
    c.stages.length > 0 &&
    c.stages.length <= 2 &&
    new Set(c.stages).size === c.stages.length &&
    c.stages.every((s) => ["repository", "pull_request"].includes(s))
  );
}
export type StandardPack = (typeof catalogue)[number] & {
  aiChecks?: AiCheck[];
};
export function assessmentAiChecks(plan: unknown, stage: string): AiCheck[] {
  const packs = (plan as { packs?: StandardPack[] })?.packs ?? [];
  const checks = new Map<string, AiCheck>();
  if (!Array.isArray(packs) || packs.length > 5)
    throw new Error("Invalid assessment standards");
  for (const pack of packs) {
    if (!pack.aiChecks?.length) continue;
    if (!organizationPack(pack))
      throw new Error("Invalid AI review definition");
    for (const check of pack.aiChecks) {
      const old = checks.get(check.id);
      if (old && contentDigest(old) !== contentDigest(check))
        throw new Error("Conflicting AI review definitions");
      checks.set(check.id, check);
    }
  }
  return [...checks.values()].filter((check) =>
    check.stages.includes(stage as "repository" | "pull_request"),
  );
}
export type PackRef = {
  id: string;
  version: string;
  definition?: StandardPack;
};
export function packDigest(pack: Omit<StandardPack, "digest">) {
  return contentDigest(pack);
}
// Embedded organization versions come only from a server-frozen selection.
// Revalidate the complete definition against supported check contracts before use.
export function organizationPack(value: unknown): StandardPack | undefined {
  if (!value || typeof value !== "object") return;
  const pack = value as StandardPack;
  const { digest, ...definition } = pack;
  if (
    !/^org-standard-[a-f0-9-]{36}$/.test(pack.id) ||
    !/^1\.0\.[1-9]\d{0,5}$/.test(pack.version) ||
    typeof pack.title !== "string" ||
    !pack.title.trim() ||
    pack.title.length > 120 ||
    typeof pack.description !== "string" ||
    pack.description.length > 2000 ||
    !Array.isArray(pack.rules) ||
    !pack.rules.length ||
    pack.rules.length > 64 ||
    new Set(pack.rules.map((r) => r.id)).size !== pack.rules.length ||
    pack.schemaVersion !== 1 ||
    pack.owner !== "Organization" ||
    JSON.stringify(pack.stages) !==
      JSON.stringify(["repository", "pull_request", "ci"]) ||
    JSON.stringify(pack.languages) !== JSON.stringify(["*"]) ||
    JSON.stringify(pack.repositoryTypes) !== JSON.stringify(["all"]) ||
    !Array.isArray(pack.changelog) ||
    pack.changelog.length !== 1 ||
    pack.changelog[0] !== "Organization-managed version." ||
    Object.keys(pack)
      .filter((k) => k !== "aiChecks")
      .sort()
      .join(",") !==
      "changelog,description,digest,id,languages,owner,repositoryTypes,rules,schemaVersion,stages,title,version" ||
    (pack.aiChecks !== undefined &&
      (!Array.isArray(pack.aiChecks) ||
        pack.aiChecks.length > 12 ||
        new Set(pack.aiChecks.map((c) => c.id)).size !== pack.aiChecks.length ||
        pack.aiChecks.some((c) => !validAiCheck(c)))) ||
    digest !== packDigest(definition) ||
    pack.rules.some((r) => !validOrganizationRule(r))
  )
    return;
  return pack;
}
export function resolvePacks(refs: PackRef[]) {
  return refs.map(
    (ref) =>
      catalogueVersions.find(
        (pack) => pack.id === ref.id && pack.version === ref.version,
      ) ??
      (ref.definition &&
      ref.definition.id === ref.id &&
      ref.definition.version === ref.version
        ? organizationPack(ref.definition)
        : undefined),
  );
}
export function recommend(signals: ProfileSignal[]) {
  const detected = new Map(
    signals.filter((s) => s.state === "detected").map((s) => [s.id, s]),
  );
  const frameworks = detected.get("frameworks")?.observations ?? [];
  const backend = frameworks.filter((s) =>
    ["NestJS", "Express", "Fastify"].includes(s),
  );
  const frontend = frameworks.filter((s) =>
    ["React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte"].includes(s),
  );
  const refs = [
    {
      id: "baseline-engineering",
      reason: "Core engineering controls apply to every selected repository.",
      signalIds: [] as string[],
    },
    {
      id: "application-security",
      reason: "Security evidence is relevant to every selected repository.",
      signalIds: [] as string[],
    },
  ];
  if (backend.length)
    refs.push({
      id: "backend-service",
      reason: `Detected backend framework: ${backend.join(", ")}.`,
      signalIds: ["frameworks"],
    });
  if (frontend.length)
    refs.push({
      id: "frontend-application",
      reason: `Detected frontend framework: ${frontend.join(", ")}.`,
      signalIds: ["frameworks"],
    });
  if (detected.has("iac") || detected.has("containers"))
    refs.push({
      id: "infrastructure-as-code",
      reason: "Infrastructure or container configuration was detected.",
      signalIds: ["iac", "containers"].filter((id) => detected.has(id)),
    });
  return refs.map((ref) => ({
    ...ref,
    version: "1.1.0",
    evidence: ref.signalIds.flatMap((id) => detected.get(id)?.evidence ?? []),
  }));
}
export function posture(
  refs: PackRef[],
  profile: AdoptionProfile,
  signals: ProfileSignal[],
) {
  const rules = new Map<string, Rule & { packIds: string[] }>();
  for (const pack of resolvePacks(refs)) {
    if (!pack) throw new Error("Unknown frozen pack version");
    for (const rule of pack.rules) {
      const existing = rules.get(rule.id);
      if (existing) {
        if (ruleRequirementsDigest(existing) !== ruleRequirementsDigest(rule))
          throw new Error("Conflicting frozen rule definitions");
        existing.packIds.push(pack.id);
        continue;
      }
      rules.set(rule.id, { ...rule, packIds: [pack.id] });
    }
  }
  return [...rules.values()].map((rule) => {
    const signal = signals.find((s) => s.id === rule.signal);
    return {
      ...rule,
      required: rule.requiredIn.includes(profile),
      assessmentResult: null,
      configuration:
        !signal || signal.state === "unknown"
          ? "UNKNOWN"
          : signal.state === "detected"
            ? "HINT_DETECTED"
            : "MISSING",
      evidence: signal?.evidence ?? [],
      reason:
        signal?.state === "detected"
          ? "Configuration hint only; execution and compliance are not evaluated."
          : "Required evidence has not been mapped or evaluated.",
    };
  });
}
