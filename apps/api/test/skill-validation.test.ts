import "reflect-metadata";
import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { expect, it } from "vitest";
import { ReviewSkillsController } from "../src/intelligence/review-skills.controller.js";
import { skillTemplates } from "../src/intelligence/review-skills.js";
const metatype = Reflect.getMetadata(
  "design:paramtypes",
  ReviewSkillsController.prototype,
  "create",
)[1];
const pipe = new ValidationPipe({ transform: true, whitelist: true });
it("accepts the full long skill at the HTTP DTO boundary without truncation", async () => {
  const instructions = "x".repeat(24000),
    description = "d".repeat(2000);
  const value = await pipe.transform(
    { ...skillTemplates[0], instructions, description, expectedVersion: 0 },
    { type: "body", metatype },
  );
  expect(value.instructions).toBe(instructions);
  expect(value.description).toBe(description);
});
it("returns exact field names and counts for multiple HTTP validation errors", async () => {
  try {
    await pipe.transform(
      {
        ...skillTemplates[0],
        description: "d".repeat(2001),
        instructions: "x".repeat(24001),
        expectedVersion: 0,
      },
      { type: "body", metatype },
    );
    expect.fail("Validation should fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    expect(body.message).toEqual(
      expect.arrayContaining([
        "Description: maximum 2,000 characters; received 2,001.",
        "Instructions: maximum 24,000 characters; received 24,001.",
      ]),
    );
  }
});
