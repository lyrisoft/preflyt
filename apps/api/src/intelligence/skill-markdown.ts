import { parseDocument, stringify } from "yaml";
import { validateSkill, type SkillManifest } from "./review-skills.js";

export class SkillImportValidationError extends Error {}

export const skillMarkdownMaxBytes = 131072;
const fields = new Set([
  "name",
  "description",
  "source",
  "license",
  "stages",
  "repositories",
  "languages",
  "frameworks",
]);

/** A bounded instruction document, never an executable package or approval record. */
export function parseSkillMarkdown(markdown: string): SkillManifest {
  if (
    typeof markdown !== "string" ||
    Buffer.byteLength(markdown, "utf8") > skillMarkdownMaxBytes
  )
    throw new Error(
      `File: maximum 131,072 bytes (128 KiB); received ${typeof markdown === "string" ? Buffer.byteLength(markdown, "utf8").toLocaleString("en-US") : "non-text input"}.`,
    );
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (match && match[1]!.length > 8192)
    throw new Error(
      `YAML header: maximum 8,192 characters; received ${match[1]!.length.toLocaleString("en-US")}.`,
    );
  if (!match)
    throw new Error(
      "SKILL.md needs a YAML header with name and description, followed by Markdown instructions",
    );
  let metadata: Record<string, unknown>;
  try {
    const doc = parseDocument(match[1]!, {
      schema: "core",
      uniqueKeys: true,
      merge: false,
    });
    if (doc.errors.length || doc.warnings.length) throw new Error();
    const value: unknown = doc.toJS({ maxAliasCount: 0 });
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    metadata = value as Record<string, unknown>;
  } catch {
    throw new Error(
      "Use a valid YAML header without duplicate fields, aliases or custom tags",
    );
  }
  const unsupported = Object.keys(metadata).filter((key) => !fields.has(key));
  if (unsupported.length)
    throw new Error(
      "SKILL.md supports name, description, source, license, stages, repositories, languages and frameworks. Remove unsupported header fields.",
    );
  const manifest = validateSkill({
    languages: metadata.languages as string[] | undefined,
    frameworks: metadata.frameworks as string[] | undefined,
    name: metadata.name as string,
    description: metadata.description as string,
    instructions: match[2]!,
    source:
      metadata.source === undefined
        ? "Uploaded SKILL.md"
        : (metadata.source as string),
    license:
      metadata.license === undefined
        ? "Not specified"
        : (metadata.license as string),
    stages:
      metadata.stages === undefined
        ? ["repository", "pull_request"]
        : (metadata.stages as string[]),
    repositories:
      metadata.repositories === undefined
        ? []
        : (metadata.repositories as string[]),
  });
  // The editor requires an explicit license before saving an imported draft.
  return {
    ...manifest,
    license: metadata.license === undefined ? "" : manifest.license,
  };
}

export function exportSkillMarkdown(skill: SkillManifest) {
  const { instructions, ...metadata } = validateSkill(skill);
  return `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${instructions}\n`;
}
