import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { builtinReviewSkills } from "../src/intelligence/builtin-review-skills.js";
import {
  validateSkill,
  skillDigest,
} from "../src/intelligence/review-skills.js";
import { parseSkillMarkdown } from "../src/intelligence/skill-markdown.js";
import { catalogue } from "../src/standards/catalogue.js";

it("ships useful defaults for every existing engineering check with valid bounded instructions", () => {
  expect(builtinReviewSkills).toHaveLength(12);
  expect(new Set(builtinReviewSkills.map((s) => s.id)).size).toBe(12);
  const rules = new Map(
    catalogue.flatMap((p) => p.rules.map((r) => [r.id, r.title] as const)),
  );
  const covered = new Set(builtinReviewSkills.flatMap((s) => s.checkIds));
  for (const id of rules.keys()) expect(covered.has(id), id).toBe(true);
  for (const skill of builtinReviewSkills) {
    expect(validateSkill(skill).instructions.length).toBeGreaterThan(900);
    expect(skill.checks).toEqual(skill.checkIds.map((id) => rules.get(id)));
    expect(skill.instructions).toContain("## Review steps");
    expect(skill.instructions).toContain("## Evidence and safety");
    expect(skill.instructions).toContain("Never mark a gate passing");
    expect(skill.repositories).toEqual([]);
    expect(skill.stages).toEqual(["repository", "pull_request"]);
  }
});

it.each(builtinReviewSkills)(
  "keeps the shipped $id template identical to its editable SKILL.md",
  async (skill) => {
    const markdown = await readFile(
      new URL(
        `../../../docs/skills/builtin/${skill.id}/SKILL.md`,
        import.meta.url,
      ),
      "utf8",
    );
    expect(parseSkillMarkdown(markdown)).toEqual(validateSkill(skill));
    const copy = {
      ...validateSkill(skill),
      instructions: skill.instructions + "\nOrganization-specific guidance.",
    };
    expect(skillDigest(copy)).not.toBe(skillDigest(skill));
    expect(parseSkillMarkdown(markdown).instructions).toBe(skill.instructions);
  },
);
