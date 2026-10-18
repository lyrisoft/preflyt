import { BadRequestException } from "@nestjs/common";
import { digest } from "./assessment-digest.js";
import type { RepositorySnapshot } from "../github/repository-profile.js";
import type { WorkflowRule } from "./pipeline-workflow.js";
import {
  standalonePrWorkflow,
  standaloneSetupSources,
  validateStandalonePrWorkflow,
} from "./standalone-pr-workflow.js";
import { preflytCiSetupInstructions } from "../intelligence/preflyt-ci-setup-skill.js";

// Do not send literal credentials in copied CI configuration to a model. References
// remain reviewable; real credentials belong in GitHub's secret store.
export function setupContainsCredentials(text: string) {
  return (
    /-----BEGIN .*PRIVATE KEY|\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9_.-]{8,}/i.test(
      text,
    ) ||
    text
      .split("\n")
      .map((line) =>
        line.replace(
          /\bid-token["']?\s*:\s*["']?(?:read|write|none)["']?\b/gi,
          "",
        ),
      )
      .some((line) => {
        if (/^\s*#/.test(line)) return false;
        const assignment =
          /(?:password|secret|token|api[_-]?key)["']?\s*[=:]\s*(.*)/i.exec(
            line,
          );
        if (!assignment) return false;
        const value = assignment[1]
          .trim()
          .replace(/^["']/, "")
          .replace(/["'],?$/, "");
        return (
          !/^\$\{\{[^\n]*\}\}$/.test(value) &&
          !/^\$(?:[A-Z_][A-Z_0-9]*|\{[A-Z_][A-Z_0-9]*\})$/.test(value)
        );
      })
  );
}
export function ciSetupContext(
  snapshot: RepositorySnapshot,
  rules: WorkflowRule[],
  apiUrl: string,
) {
  // Manifests provide scripts/engines; workflow candidates provide exact setup.
  // Never send arbitrary source, lockfile contents, or unread files to inference.
  if (
    rules.some((rule) => setupContainsCredentials(rule.workflowCommand ?? ""))
  )
    throw new BadRequestException(
      "Replace literal credentials in policy commands with GitHub secret references before generating setup",
    );
  const packages = snapshot.files
    .filter((f) => /(^|\/)package\.json$/.test(f.path))
    .slice(0, 16)
    .map((file) => {
      try {
        const value = JSON.parse(file.content ?? "");
        const safe = {
          path: file.path,
          packageManager: value.packageManager,
          engines: value.engines,
          workspaces: value.workspaces,
          scripts: value.scripts,
          testTools: Object.keys({
            ...value.dependencies,
            ...value.devDependencies,
          }).filter((key) =>
            /^(vitest|jest|mocha|nyc|c8|@vitest\/coverage-v8|typescript)$/.test(
              key,
            ),
          ),
        };
        return setupContainsCredentials(JSON.stringify(safe, null, 2))
          ? {
              path: file.path,
              unavailable: "Sensitive manifest values omitted",
            }
          : safe;
      } catch {
        return { path: file.path, unavailable: "Manifest content unavailable" };
      }
    });
  const workflows = snapshot.files.filter((f) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.path),
  );
  const safeFiles = snapshot.files.filter(
    (file) => !file.content || !setupContainsCredentials(file.content),
  );
  const source = { ...snapshot, files: safeFiles };
  const fallback = standalonePrWorkflow(
    {
      ...source,
      files: safeFiles.filter((f) => !/^\.github\/workflows\//.test(f.path)),
    },
    rules,
    apiUrl,
  );
  const variants = [
    fallback,
    ...standaloneSetupSources(source, rules).map((setup) =>
      standalonePrWorkflow(source, rules, apiUrl, setup),
    ),
  ];
  const choices = [
    ...new Map(
      variants.map((variant) => [digest(variant.workflow), variant]),
    ).entries(),
  ]
    .map(([setupId, variant]) => ({
      setupId,
      workflow: variant.workflow,
      sources: variant.setupSources,
      notes: variant.notes,
    }))
    .filter((choice) => !setupContainsCredentials(choice.workflow));
  if (!choices.length)
    throw new BadRequestException(
      "No credential-free setup can be proposed. Replace literal credentials with GitHub secret references.",
    );
  const evidence = {
    sourceSha: snapshot.sourceSha,
    branch: snapshot.branch,
    complete: snapshot.complete,
    packages,
    files: snapshot.files.slice(0, 200).map((file) => file.path),
    omitted:
      snapshot.files.length > 200 ||
      snapshot.files.filter((f) => /(^|\/)package\.json$/.test(f.path)).length >
        16,
    warnings: [
      ...snapshot.warnings,
      ...(safeFiles.length !== snapshot.files.length
        ? [
            "Files containing potential credentials were excluded from AI setup. Review secret references manually.",
          ]
        : []),
    ],
    workflows: workflows.map((file) => ({
      path: file.path,
      available: !!file.content && safeFiles.includes(file),
    })),
    policy: { checks: rules, apiUrl },
    choices,
  };
  // A bounded request is rejected rather than silently losing setup evidence.
  const user = JSON.stringify(evidence);
  if (Buffer.byteLength(user) > 128 * 1024)
    throw new BadRequestException(
      "Repository setup is too large for one AI request. Use the YAML editor to review the setup.",
    );
  return {
    prompt: { system: preflytCiSetupInstructions, user },
    inputHash: digest(evidence),
    choices,
    validate(raw: string, credential?: string) {
      if (
        raw.length > 12000 ||
        (credential && raw.includes(credential)) ||
        setupContainsCredentials(raw)
      )
        throw new BadRequestException(
          "AI returned an unsafe setup response. The draft was rejected.",
        );
      let result: any;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new BadRequestException(
          "AI did not return a complete setup choice. Try again.",
        );
      }
      if (
        !result ||
        Array.isArray(result) ||
        Object.keys(result).sort().join(",") !== "setupId,summary" ||
        typeof result.summary !== "string" ||
        !result.summary.trim() ||
        result.summary.length > 1500
      )
        throw new BadRequestException(
          "AI returned an invalid setup choice. Try again.",
        );
      const choice = choices.find((item) => item.setupId === result.setupId);
      if (!choice)
        throw new BadRequestException(
          "AI selected setup that was not found in this repository. The draft was rejected.",
        );
      validateStandalonePrWorkflow(
        choice.workflow,
        rules,
        `refs/heads/${snapshot.branch}`,
        apiUrl,
      );
      return {
        workflow: choice.workflow,
        summary: result.summary,
        setupSources: choice.sources,
        notes: [
          ...choice.notes,
          ...evidence.warnings,
          ...(evidence.omitted
            ? [
                "AI setup context was bounded; review packages and file paths omitted from the proposal context.",
              ]
            : []),
        ],
        sourceSha: snapshot.sourceSha,
      };
    },
  };
}
