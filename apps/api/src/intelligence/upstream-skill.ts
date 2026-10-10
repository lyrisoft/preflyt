import { createHash } from "node:crypto";
import { aiHttpRequest } from "./ai-http.js";
import { parseSkillMarkdown, skillMarkdownMaxBytes } from "./skill-markdown.js";
export async function readUpstreamSkill(input: {
  repository: string;
  commit: string;
  path: string;
  licensePath: string;
}) {
  const { repository, commit, path, licensePath } = input;
  const validPath = (value: string) =>
    typeof value === "string" &&
    value.length <= 80 &&
    value
      .split("/")
      .every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== "." && p !== "..");
  if (
    typeof repository !== "string" ||
    repository.length > 70 ||
    !/^[-a-zA-Z0-9]+\/[-a-zA-Z0-9_.]+$/.test(repository) ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    !validPath(path) ||
    (!path.endsWith("/SKILL.md") && path !== "SKILL.md") ||
    !validPath(licensePath)
  )
    throw new Error(
      "Choose a public GitHub repository, full commit SHA, SKILL.md path and license file",
    );
  const read = async (file: string) => {
    const url = new URL(
      `https://raw.githubusercontent.com/${repository}/${commit}/${file.split("/").map(encodeURIComponent).join("/")}`,
    );
    const response = await aiHttpRequest(url, "hosted", {
      headers: { accept: "text/plain" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Pinned upstream file unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > skillMarkdownMaxBytes)
      throw new Error("Upstream file exceeds 32 KiB");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  };
  const markdown = await read(path),
    licenseText = await read(licensePath);
  if (!licenseText.trim() || licenseText.length > 32000)
    throw new Error("Review a non-empty upstream license file");
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  const manifest = parseSkillMarkdown(markdown);
  return {
    manifest: {
      ...manifest,
      source: `GitHub ${repository}@${commit} ${path} sha256:${sha256}`,
      license: "",
    },
    licenseText,
    sha256,
    commit,
    repository,
    path,
    licensePath,
  };
}
