import { digest } from "../assessments/assessment-digest.js";
import {
  readPullRequestContext,
  type PullRequestContext,
} from "../github-events/pull-request-context.js";
export type DiffLine = {
  ref: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  text: string;
};
export type PrReviewSource = {
  number: number;
  context: PullRequestContext;
  digest: string;
  lines: DiffLine[];
  omittedFiles: number;
  omittedLines: number;
};
const credential =
  /Bearer\s+[a-zA-Z0-9._~+\/-]{16,}|-----BEGIN (?:[A-Z ]*PRIVATE KEY)|\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9_-]{16,}|AKIA[A-Z0-9]{16})|(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"']{8,}/i;
// These paths are installed by Preflyt's generated integration. User-authored
// workflows and custom Actions remain reviewable.
const preflytIntegration = (path: string) =>
  path.startsWith(".github/actions/preflyt-policy/") ||
  /^\.github\/workflows\/preflyt-gate\.ya?ml$/.test(path) ||
  path.startsWith(".preflyt/");
export function sameReviewPr(a: unknown, b: unknown) {
  const x = readPullRequestContext(a),
    y = readPullRequestContext(b);
  return (
    !!x &&
    !!y &&
    x.state === "open" &&
    !x.draft &&
    !x.merged &&
    digest(x) === digest(y)
  );
}
/** Only explicit added/deleted hunk lines are citable. Omitted content cannot establish coverage. */
export function prReviewSource(
  number: number,
  expected: PullRequestContext,
  files: unknown,
): PrReviewSource {
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !sameReviewPr(expected, expected) ||
    !Array.isArray(files) ||
    files.length > 200
  )
    throw new Error("PR diff exceeds the review limit or is unavailable");
  const lines: DiffLine[] = [];
  let bytes = 0,
    omittedFiles = 0,
    omittedLines = 0;
  const seen = new Set<string>();
  // Keep application changes ahead of workflow scaffolding within the same
  // fixed disclosure bound. GitHub lists .github files first alphabetically.
  const priority = (file: any) => typeof file?.filename === "string" &&
    (file.filename.startsWith(".github/") || /(?:^|\/)(?:[^/]+\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file.filename)) ? 1 : 0;
  const orderedFiles = [...files].sort((a, b) => priority(a) - priority(b));
  for (const file of orderedFiles) {
    const path = file?.filename;
    if (
      typeof path !== "string" ||
      path.length > 500 ||
      !path ||
      /[\x00-\x1f\x7f`<>]|(^|\/)\.\.(\/|$)/.test(path) ||
      path.startsWith("/") ||
      seen.has(path)
    )
      throw new Error("Invalid diff file identity");
    const oldPath = file.previous_filename ?? path;
    if (
      typeof oldPath !== "string" ||
      oldPath.length > 500 ||
      !oldPath ||
      /[\x00-\x1f\x7f`<>]|(^|\/)\.\.(\/|$)/.test(oldPath) ||
      oldPath.startsWith("/")
    )
      throw new Error("Invalid previous file identity");
    seen.add(path);
    if (
      preflytIntegration(path) ||
      preflytIntegration(oldPath) ||
      /(^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx))$/i.test(path) ||
      /(^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx))$/i.test(oldPath) ||
      typeof file.patch !== "string"
    ) {
      omittedFiles++;
      continue;
    }
    if (credential.test(file.patch)) {
      omittedFiles++;
      continue;
    }
    let left = 0,
      right = 0,
      inHunk = false,
      leftRemaining = 0,
      rightRemaining = 0;
    const fileLines: Omit<DiffLine, "ref">[] = [];
    for (const row of file.patch.split("\n")) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
      if (hunk) {
        if (inHunk && (leftRemaining || rightRemaining))
          throw new Error("Truncated diff hunk");
        left = Number(hunk[1]);
        right = Number(hunk[3]);
        leftRemaining = Number(hunk[2] ?? 1);
        rightRemaining = Number(hunk[4] ?? 1);
        inHunk = true;
        continue;
      }
      if (!inHunk || row.startsWith("\\")) continue;
      if (row.startsWith("+")) {
        if (rightRemaining-- <= 0) throw new Error("Invalid diff hunk");
        fileLines.push({
          path,
          line: right++,
          side: "RIGHT",
          text: row.slice(1),
        });
      } else if (row.startsWith("-")) {
        if (leftRemaining-- <= 0) throw new Error("Invalid diff hunk");
        fileLines.push({
          path: oldPath,
          line: left++,
          side: "LEFT",
          text: row.slice(1),
        });
      } else if (row.startsWith(" ")) {
        if (leftRemaining-- <= 0 || rightRemaining-- <= 0)
          throw new Error("Invalid diff hunk");
        left++;
        right++;
      } else if (row !== "") throw new Error("Invalid diff hunk");
    }
    if (inHunk && (leftRemaining || rightRemaining)) {
      omittedFiles++;
      continue;
    }
    if (!inHunk) {
      omittedFiles++;
      continue;
    }
    for (const line of fileLines) {
      if (line.line < 1 || !Number.isSafeInteger(line.line))
        throw new Error("Invalid changed line");
      const size = Buffer.byteLength(JSON.stringify(line));
      if (
        lines.length >= 300 ||
        bytes + size > 24000 ||
        line.text.length > 2000
      ) {
        omittedLines++;
        continue;
      }
      lines.push({ ...line, ref: `diff:${lines.length}` });
      bytes += size;
    }
  }
  if (!lines.length)
    throw new Error("No safe changed lines available for source review");
  const data = { number, context: expected, lines, omittedFiles, omittedLines };
  return { ...data, digest: digest(data) };
}
export function publicPrSource(source: PrReviewSource) {
  return { ...source, lines: source.lines.map(({ text, ...line }) => line) };
}
