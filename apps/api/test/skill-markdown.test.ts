import { expect, it } from "vitest";
import {
  parseSkillMarkdown,
  exportSkillMarkdown,
} from "../src/intelligence/skill-markdown.js";
import {
  skillDigest,
  skillTemplates,
} from "../src/intelligence/review-skills.js";
const minimal =
  "---\nname: Evidence review\ndescription: Explain missing checks\n---\n\n# Review\n\n- Cite evidence.\n";
it("round-trips the exact validated content digest including Markdown and repository scope", () => {
  const skill = {
    ...skillTemplates[0]!,
    instructions:
      "# Security review\n\n- Cite evidence 🔎.\n\n```sh\necho example\n```",
    repositories: ["123"],
    stages: ["repository", "pull_request"],
  };
  const exported = exportSkillMarkdown(skill);
  const imported = parseSkillMarkdown(
    "\ufeff" + exported.replaceAll("\n", "\r\n"),
  );
  expect(skillDigest(imported)).toBe(skillDigest(skill));
  expect(imported.instructions).toBe(skill.instructions);
  expect(exported).not.toMatch(/status:|enabled:|contentDigest:/);
});
it("opens minimal files as unapproved drafts and requires an explicit license before saving", () => {
  expect(parseSkillMarkdown(minimal)).toMatchObject({
    name: "Evidence review",
    license: "",
    source: "Uploaded SKILL.md",
    stages: ["pull_request", "repository"],
    repositories: [],
  });
});
it.each([
  "enabled: true",
  "status: APPROVED",
  "commands: [sh]",
  "tools: [shell]",
  "version: 99",
  "__proto__: {}",
])("rejects unsupported authority metadata: %s", (field) => {
  expect(() =>
    parseSkillMarkdown(
      minimal.replace(
        "name: Evidence review",
        "name: Evidence review\n" + field,
      ),
    ),
  ).toThrow("unsupported header fields");
});
it.each([
  "name: First\nname: Second\ndescription: Review",
  "name: &x Review\ndescription: *x",
  "name: !unsafe Review\ndescription: Review",
  "name: [unterminated",
  "- name: Review",
])("rejects unsafe or malformed YAML: %s", (header) => {
  expect(() =>
    parseSkillMarkdown("---\n" + header + "\n---\nInstructions"),
  ).toThrow("valid YAML header");
});
it("bounds files by UTF-8 bytes and preserves instruction-only content", () => {
  expect(() => parseSkillMarkdown(minimal + "🔎".repeat(8192))).toThrow(
    "32 KiB",
  );
  expect(() => parseSkillMarkdown(minimal + "x".repeat(6000))).toThrow("6,000");
  expect(() => parseSkillMarkdown("# No header")).toThrow("YAML header");
  expect(() =>
    parseSkillMarkdown(
      minimal.replace("Cite evidence.", "Cite\u0000evidence."),
    ),
  ).toThrow("valid skill");
});
