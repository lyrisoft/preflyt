import { afterEach, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import type { RedisCacheService } from "../src/cache/redis-cache.service.js";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let workflow = "name: CI\non: pull_request\njobs: {}\n";
  let revision = 1;
  const values = new Map<string, { value: string; expiresAt: number }>();
  const cache = {
    get: vi.fn(async (key: string) => {
      const entry = values.get(key);
      return entry && entry.expiresAt > Date.now() ? entry.value : null;
    }),
    set: vi.fn(async (key: string, value: string, ttl: number) => {
      values.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    }),
  };
  const provider = new GitHubProviderService(
    cache as unknown as RedisCacheService,
    {
      gitHubInstallation: {
        findUnique: async () => ({ accessRevision: revision }),
      },
    } as any,
  ) as any;
  vi.spyOn(provider, "requireAppId").mockReturnValue("123");
  const request = vi.fn(async (path: string) => {
    if (path.includes("/actions/workflows"))
      return {
        total_count: 1,
        workflows: [
          {
            id: 7,
            name: "CI",
            path: ".github/workflows/ci.yml",
            state: "active",
          },
        ],
      };
    if (path.includes("/branches/")) return { commit: { sha: "a".repeat(40) } };
    return {
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(workflow),
      path: ".github/workflows/ci.yml",
      sha: "b".repeat(40),
      content: Buffer.from(workflow).toString("base64"),
    };
  });
  const access = vi.spyOn(provider, "openRepository").mockResolvedValue({
    metadata: { owner: { login: "fixture" }, name: "app" },
    request,
  });
  return {
    provider,
    cache,
    values,
    request,
    access,
    changeWorkflow: (value: string) => {
      workflow = value;
    },
    changeRevision: () => {
      revision++;
    },
  };
}

it("reuses discovery and branch-pinned YAML for five minutes while checking current access", async () => {
  const { provider, cache, request, access } = fixture();
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const first = await provider.readPipelineWorkflow(
    5n,
    6n,
    "7",
    "refs/heads/main",
  );
  const initialAccessCalls = access.mock.calls.length;
  expect(request).toHaveBeenCalledTimes(3);
  expect(await provider.readPipelineWorkflow(5n, 6n, "7", "main")).toEqual(
    first,
  );
  expect(access).toHaveBeenCalledTimes(initialAccessCalls + 1);
  expect(request).toHaveBeenCalledTimes(3);
  expect(cache.set.mock.calls.every((call) => call[2] === 300)).toBe(true);
  now += 300001;
  await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  expect(request).toHaveBeenCalledTimes(6);
  provider.close();
});

it("refreshes both discovery and YAML and replaces the cached source", async () => {
  const { provider, changeWorkflow, request } = fixture();
  await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  const latest = "name: Updated CI\non: pull_request\njobs: {}\n";
  changeWorkflow(latest);
  expect(
    (await provider.readPipelineWorkflow(5n, 6n, "7", "main")).workflow,
  ).not.toBe(latest);
  expect(
    (await provider.readPipelineWorkflow(5n, 6n, "7", "main", true)).workflow,
  ).toBe(latest);
  expect(request).toHaveBeenCalledTimes(6);
  expect(
    (await provider.readPipelineWorkflow(5n, 6n, "7", "main")).workflow,
  ).toBe(latest);
  expect(request).toHaveBeenCalledTimes(6);
  provider.close();
});

it("keeps repository, installation, branch and access revision caches separate", async () => {
  const { provider, changeWorkflow, changeRevision } = fixture();
  const original = await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  const latest = "name: New CI\non: pull_request\njobs: {}\n";
  changeWorkflow(latest);
  expect(
    (await provider.readPipelineWorkflow(5n, 9n, "7", "main")).workflow,
  ).toBe(latest);
  expect(
    (await provider.readPipelineWorkflow(8n, 6n, "7", "main")).workflow,
  ).toBe(latest);
  expect(
    (await provider.readPipelineWorkflow(5n, 6n, "7", "feature/checks"))
      .workflow,
  ).toBe(latest);
  expect(await provider.readPipelineWorkflow(5n, 6n, "7", "main")).toEqual(
    original,
  );
  changeRevision();
  expect(
    (await provider.readPipelineWorkflow(5n, 6n, "7", "main")).workflow,
  ).toBe(latest);
  provider.close();
});

it("never returns cached YAML when current repository access fails", async () => {
  const { provider, request, access } = fixture();
  await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  access.mockRejectedValue(new ForbiddenException("Repository access removed"));
  await expect(
    provider.readPipelineWorkflow(5n, 6n, "7", "main"),
  ).rejects.toThrow("Repository access removed");
  expect(request).toHaveBeenCalledTimes(3);
  provider.close();
});

it("replaces malformed cached YAML and propagates failed refreshes", async () => {
  const { provider, values, cache, request } = fixture();
  await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  const sourceKey = cache.set.mock.calls.find((call) =>
    call[0].includes(":workflow:"),
  )![0];
  values.get(sourceKey)!.value = JSON.stringify({ workflow: "invalid" });
  const result = await provider.readPipelineWorkflow(5n, 6n, "7", "main");
  expect(result.baseSha).toBe("a".repeat(40));
  expect(request).toHaveBeenCalledTimes(5);
  request.mockRejectedValue(new Error("GitHub unavailable"));
  await expect(
    provider.readPipelineWorkflow(5n, 6n, "7", "main", true),
  ).rejects.toThrow("GitHub unavailable");
  provider.close();
});
