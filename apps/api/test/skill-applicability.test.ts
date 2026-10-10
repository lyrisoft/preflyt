import { expect, it } from "vitest";
import { skillApplicability } from "../src/intelligence/skill-applicability.js";
import {
  skillDigest,
  validateSkill,
  skillTemplates,
} from "../src/intelligence/review-skills.js";
import {
  parseSkillMarkdown,
  exportSkillMarkdown,
} from "../src/intelligence/skill-markdown.js";
const profile = {
  sourceSha: "a".repeat(40),
  report: {
    signals: [
      { id: "languages", state: "detected", observations: ["TypeScript"] },
      { id: "frameworks", state: "detected", observations: ["React"] },
    ],
  },
};
it("preserves existing digests when selectors are empty", () =>
  expect(
    skillDigest({ ...skillTemplates[0]!, languages: [], frameworks: [] }),
  ).toBe(skillDigest(skillTemplates[0]!)));
it("matches pinned language and framework observations with AND between dimensions", () => {
  expect(
    skillApplicability(
      { languages: ["typescript"], frameworks: ["react"] },
      profile,
      profile.sourceSha,
    ).eligible,
  ).toBe(true);
  expect(
    skillApplicability(
      { languages: ["python"], frameworks: ["react"] },
      profile,
      profile.sourceSha,
    ).eligible,
  ).toBe(false);
});
it("skips constrained skills for missing or different-commit detection", () => {
  expect(
    skillApplicability({ languages: ["typescript"] }, null, profile.sourceSha)
      .eligible,
  ).toBe(false);
  expect(
    skillApplicability({ frameworks: ["react"] }, profile, "b".repeat(40))
      .eligible,
  ).toBe(false);
  expect(skillApplicability({}, null, profile.sourceSha).eligible).toBe(true);
});
it("round-trips normalized selectors through Markdown and changes the reviewed digest", () => {
  const skill = validateSkill({
    ...skillTemplates[0]!,
    languages: ["TypeScript"],
    frameworks: ["React"],
  });
  expect(skill.languages).toEqual(["typescript"]);
  expect(parseSkillMarkdown(exportSkillMarkdown(skill))).toEqual(skill);
  expect(skillDigest(skill)).not.toBe(skillDigest(skillTemplates[0]!));
  expect(() =>
    validateSkill({ ...skill, frameworks: ["../../secret"] }),
  ).toThrow();
  expect(() => validateSkill({ ...skill, languages: [" "] })).toThrow();
});
