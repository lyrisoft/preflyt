import { BadRequestException } from "@nestjs/common";
import { checkReportFormat } from "./check-report-adapters.js";

export function setupConfiguration(
  apiUrl: string,
  checksJson: string,
  ruleIds: string[],
) {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new BadRequestException("Enter the public HTTPS Preflyt API address");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new BadRequestException(
      "GitHub runners need a public HTTPS Preflyt API address",
    );
  let checks: unknown;
  try {
    checks = JSON.parse(checksJson);
  } catch {
    throw new BadRequestException("Check configuration is invalid");
  }
  if (
    !checks ||
    typeof checks !== "object" ||
    Array.isArray(checks) ||
    Object.keys(checks).length > 10
  )
    throw new BadRequestException(
      "Provide at most 10 pipeline report checks per run",
    );
  const normalized: Record<string, { report: string; argv?: string[] }> = {};
  for (const [id, value] of Object.entries(checks)) {
    if (
      !ruleIds.includes(id) ||
      !checkReportFormat(id) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      throw new BadRequestException("Choose a check from this policy");
    const check = value as { report?: unknown; argv?: unknown };
    if (
      typeof check.report !== "string" ||
      !check.report.trim() ||
      check.report.length > 512 ||
      check.report.startsWith("/") ||
      check.report.split("/").includes("..") ||
      /[\x00-\x1f\\]/.test(check.report)
    )
      throw new BadRequestException(
        "Report paths must be inside the repository",
      );
    if (
      check.argv !== undefined &&
      (!Array.isArray(check.argv) ||
        !check.argv.length ||
        check.argv.length > 65 ||
        check.argv.some(
          (arg) =>
            typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"),
        ) ||
        !check.argv[0])
    )
      throw new BadRequestException(
        "Check commands must contain valid arguments",
      );
    normalized[id] = {
      report: check.report.trim(),
      ...(check.argv !== undefined ? { argv: check.argv as string[] } : {}),
    };
  }
  for (const id of ruleIds.filter((id) => checkReportFormat(id)))
    if (!(id in normalized))
      throw new BadRequestException(
        "Add every pipeline check in this policy to the workflow",
      );
  return { checks: JSON.stringify(normalized, null, 2) + "\n" };
}
