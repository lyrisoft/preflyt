import { parseDocument, stringify } from "yaml";
import { validateSkill, type SkillManifest } from "./review-skills.js";

export const skillMarkdownMaxBytes = 32768;
const fields = new Set([
  "name",
  "description",
  "source",
  "license",
  "stages",
  "repositories",
]);

/** A bounded instruction document, never an executable package or approval record. */
export function parseSkillMarkdown(markdown: string): SkillManifest {
  if (
    typeof markdown !== "string" ||
    Buffer.byteLength(markdown, "utf8") > skillMarkdownMaxBytes
  )
    throw new Error("Choose a UTF-8 Markdown file no larger than 32 KiB");
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (!match || match[1]!.length > 8192)
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
  if (Object.keys(metadata).some((key) => !fields.has(key)))
    throw new Error(
      "SKILL.md supports name, description, source, license, stages and repositories. Remove unsupported header fields.",
    );
  try {
    const manifest = validateSkill({
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
  } catch {
    throw new Error(
      "Enter a valid skill name, description and up to 6,000 instruction characters; check the source, license and repository fields",
    );
  }
}

export function exportSkillMarkdown(skill: SkillManifest) {
  const { instructions, ...metadata } = validateSkill(skill);
  return `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${instructions}\n`;
}
