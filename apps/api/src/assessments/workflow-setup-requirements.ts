import { posix } from "node:path";
import type { WorkflowRule } from "./pipeline-workflow.js";
import { checkExecution } from "./workflow-snippets.js";
import type { RepositorySnapshot } from "../github/repository-profile.js";

export type SetupTarget = {
  directory: string;
  runtime: "node" | "python" | "go" | "unknown";
  command: string;
  tests: boolean;
  title: string;
};

// Deliberately recognize simple commands only. A shell program, workspace filter,
// or indirect script needs review; it must not inherit an unrelated CI job's DBs.
export function setupCommand(
  command: string,
  directory = ".",
): Omit<SetupTarget, "title"> | null {
  let run = command
    .trim()
    .replace(/^set -[a-zA-Z ]+\n/, "")
    .trim();
  const cd = run.match(/^cd\s+([\w./-]+)\s*&&\s*/);
  if (cd) {
    directory = posix.join(directory, cd[1]!);
    run = run.slice(cd[0].length).trim();
  }
  const scoped = run.match(
    /^(npm|pnpm|yarn)\s+(?:--prefix|--dir|--cwd)\s+([\w./-]+)\s+/,
  );
  if (scoped) {
    directory = posix.join(directory, scoped[2]!);
    run = scoped[1] + " " + run.slice(scoped[0].length);
  }
  directory = posix.normalize(directory);
  if (
    directory.startsWith("/") ||
    directory === ".." ||
    directory.startsWith("../")
  )
    return null;
  if (/[\n;&|<>`$]/.test(run)) return null;
  const script = run.match(/^(?:npm|pnpm|yarn)\s+(?:run\s+)?([\w:-]+)(.*)$/);
  if (script && !["exec", "dlx", "install", "ci"].includes(script[1]!)) {
    return {
      directory,
      runtime: "node" as const,
      command: `script:${script[1]}${script[2]!.replace(/\s+/g, " ")}`,
      tests: /^test(?:$|[:-])/.test(script[1]!),
    };
  }
  const runtime = /^(?:npx\s+)?(?:vitest|jest|node\s+--test)\b/.test(run)
    ? "node"
    : /^(?:(?:python3?|python3?\s+-m)\s+)?pytest\b/.test(run)
      ? "python"
      : /^go\s+test\b/.test(run)
        ? "go"
        : null;
  return runtime
    ? { directory, runtime, command: run.replace(/\s+/g, " "), tests: true }
    : null;
}

export function workflowSetupTargets(
  rules: WorkflowRule[],
  snapshot: RepositorySnapshot,
): SetupTarget[] {
  return rules.flatMap((rule): SetupTarget[] => {
    if (!checkExecution(rule)?.argv) return [];
    if (rule.workflowCommand) {
      const parsed: Omit<SetupTarget, "title"> = setupCommand(
        rule.workflowCommand,
      ) ?? {
        directory: ".",
        runtime: "unknown",
        command: rule.workflowCommand,
        tests: false,
      };
      return [{ ...parsed, title: rule.title }];
    }
    if (["lint.required", "types.required", "build.required"].includes(rule.id))
      return [
        {
          directory: ".",
          runtime: "node",
          command: `script:${rule.id === "types.required" ? "typecheck" : rule.id.split(".")[0]}`,
          tests: false,
          title: rule.title,
        },
      ];
    if (rule.id === "tests.required")
      return [
        {
          directory: ".",
          runtime: snapshot.files.some((file) => file.path === "package.json")
            ? "node"
            : "python",
          command: "default-tests",
          tests: true,
          title: rule.title,
        },
      ];
    // Fixed scanner recipes provision their own tools. They inspect source,
    // lockfiles or a container image without project dependency installation.
    return [];
  });
}

export function matchesTestTarget(
  target: SetupTarget,
  run: string,
  directory: string,
) {
  const candidate = setupCommand(run, directory);
  if (
    !candidate?.tests ||
    candidate.directory !== target.directory ||
    candidate.runtime !== target.runtime
  )
    return false;
  if (target.command === "default-tests")
    return (
      candidate.command === "script:test" ||
      /^(?:vitest run|jest|node --test|(?:python3? -m )?pytest)$/.test(
        candidate.command,
      )
    );
  return (
    candidate.runtime === target.runtime && candidate.command === target.command
  );
}
