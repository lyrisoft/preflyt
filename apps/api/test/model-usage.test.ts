import { expect, it, vi } from "vitest";
import { trackModelUsage } from "../src/intelligence/model-usage.js";
it("pins model identity and retains provider usage even when validation fails", async () => {
  const db: any = {
    aiModelUsage: {
      create: vi.fn(async () => ({ id: "event" })),
      update: vi.fn(),
    },
  };
  const callback = vi.fn();
  const provider: any = {
    id: "connection",
    organizationId: "org",
    revision: 2,
    modelId: "model-at-call-time",
    encryptedCredential: "private-key",
  };
  await expect(
    trackModelUsage(
      { db, repositoryId: "repo", workload: "VAPT", sourceId: "scan" },
      provider,
      callback,
      async (report) => {
        await report({ inputTokens: 100, outputTokens: 25, cachedTokens: 50 });
        throw new Error("Private model response");
      },
    ),
  ).rejects.toThrow("Private model response");
  expect(db.aiModelUsage.create).toHaveBeenCalledWith({
    data: {
      organizationId: "org",
      providerId: "connection",
      providerRevision: 2,
      modelId: "model-at-call-time",
      repositoryId: "repo",
      workload: "VAPT",
      sourceId: "scan",
    },
  });
  expect(db.aiModelUsage.update).toHaveBeenCalledWith({
    where: { id: "event" },
    data: { inputTokens: 100, outputTokens: 25, cachedTokens: 50 },
  });
  expect(db.aiModelUsage.update).toHaveBeenLastCalledWith({
    where: { id: "event" },
    data: { state: "FAILED", finishedAt: expect.any(Date) },
  });
  expect(JSON.stringify(db.aiModelUsage.update.mock.calls)).not.toContain(
    "Private",
  );
  expect(callback).toHaveBeenCalledOnce();
});
it("keeps unreported usage unknown on transport failure and records successful zero usage", async () => {
  const db: any = {
    aiModelUsage: {
      create: vi.fn(async () => ({ id: "event" })),
      update: vi.fn(),
    },
  };
  const provider: any = {
    id: "connection",
    organizationId: "org",
    revision: 1,
    modelId: "model",
  };
  const context: any = {
    db,
    repositoryId: "repo",
    workload: "AI_REVIEW",
    sourceId: "review",
  };
  await expect(
    trackModelUsage(context, provider, undefined, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(db.aiModelUsage.update).toHaveBeenCalledTimes(1);
  await trackModelUsage(context, provider, undefined, async (report) => {
    await report({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
    return "ok";
  });
  expect(db.aiModelUsage.update).toHaveBeenLastCalledWith({
    where: { id: "event" },
    data: { state: "COMPLETED", finishedAt: expect.any(Date) },
  });
});
