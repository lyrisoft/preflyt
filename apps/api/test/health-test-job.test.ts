import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  runHealthTests,
  cleanupHealthTests,
} from "../src/health/health-test-job.js";
import { digest } from "../src/assessments/assessment-digest.js";
const scope = {
  requestId: randomUUID(),
  organizationId: "org",
  repositoryId: "51",
  sourceSha: "a".repeat(40),
  sourceHash: "b".repeat(64),
  planHash: "c".repeat(64),
};
const tool = {
  ruleId: "tests.coverage" as const,
  image: "sha256:" + "d".repeat(64),
  configHash: "e".repeat(64),
  toolVersion: "24.16.0",
  license: "MIT",
  reviewDigest: "f".repeat(64),
  expiresAt: "2099-01-01T00:00:00Z",
  databaseBuiltAt: null,
};
it("refuses a source outside the verified workspace without starting a container", async () => {
  const command = vi.fn(async () => Buffer.alloc(0));
  const result = await runHealthTests(
    scope,
    tool,
    "/tmp",
    "runc",
    { command: "", directory: ".", framework: "auto" },
    async () => {},
    command,
  );
  expect(result.state).toBe("INCOMPLETE");
  expect(result.cleanupConfirmed).toBe(true);
  expect(
    command.mock.calls.some(
      ([args]) => args[0] === "create" || args[0] === "start",
    ),
  ).toBe(false);
});
it("rejects changed effective volume controls before creating either phase and removes its owned volume", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "preflyt-native-")),
  );
  await mkdir(join(directory, "source"));
  let created = false;
  const label = digest({ scope, ruleId: "tests.coverage", tool });
  const command = vi.fn(async (args: string[]) => {
    if (args[0] === "volume" && args[1] === "create") {
      created = true;
      return Buffer.from("volume");
    }
    if (args[0] === "volume" && args[1] === "ls")
      return Buffer.from(created ? "volume" : "");
    if (args[0] === "volume" && args[1] === "inspect")
      return Buffer.from(
        JSON.stringify([
          {
            Driver: "local",
            Labels: { "preflyt.scope": label },
            Options: { type: "none", device: "/host" },
          },
        ]),
      );
    return Buffer.alloc(0);
  });
  try {
    const result = await runHealthTests(
      scope,
      tool,
      join(directory, "source"),
      "runc",
      { command: "", directory: ".", framework: "auto" },
      async () => {},
      command,
    );
    expect(result.state).toBe("INCOMPLETE");
    expect(result.reason).toBe("TEST_ENVIRONMENT_UNAVAILABLE");
    expect(result.cleanupConfirmed).toBe(true);
    expect(
      command.mock.calls.some(
        ([args]) => args[0] === "create" || args[0] === "start",
      ),
    ).toBe(false);
    expect(
      command.mock.calls.some(
        ([args]) => args[0] === "volume" && args[1] === "rm",
      ),
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("never removes a container belonging to another request during recovery", async () => {
  const command = vi.fn(async (args: string[]) =>
    Buffer.from(
      args[0] === "ps"
        ? "container"
        : JSON.stringify([
            { Config: { Labels: { "preflyt.scope": "other" } } },
          ]),
    ),
  );
  await expect(cleanupHealthTests(scope, tool, command)).rejects.toThrow(
    "ownership",
  );
  expect(command.mock.calls.some(([args]) => args[0] === "rm")).toBe(false);
});
