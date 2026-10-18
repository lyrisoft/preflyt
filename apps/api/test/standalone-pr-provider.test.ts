import { afterEach, expect, it, vi } from "vitest";
import { GitHubProviderService } from "../src/github/github-provider.service.js";

afterEach(() => vi.restoreAllMocks());
it("reads the explicitly selected target branch without looking up an existing workflow", async () => {
  const provider = new GitHubProviderService() as any;
  const snapshot = {
    sourceSha: "a".repeat(40),
    branch: "development",
    files: [],
    warnings: [],
  };
  const inspectSource = vi.fn().mockResolvedValue(snapshot);
  const request = vi
    .fn()
    .mockResolvedValue({ commit: { sha: snapshot.sourceSha } });
  const assertAccess = vi.fn();
  vi.spyOn(provider, "openRepository").mockResolvedValue({
    metadata: { owner: { login: "fixture" }, name: "app" },
    request,
    inspectSource,
    assertAccess,
  });
  const discover = vi.spyOn(provider, "discoverPipelineWorkflows");
  try {
    await expect(
      provider.readStandaloneWorkflowSource(5n, 6n, "refs/heads/development"),
    ).resolves.toBe(snapshot);
    expect(request).toHaveBeenCalledWith(
      "/repos/fixture/app/branches/development",
      expect.any(Object),
    );
    expect(inspectSource).toHaveBeenCalledWith(
      snapshot.sourceSha,
      "development",
      false,
    );
    expect(discover).not.toHaveBeenCalled();
    expect(assertAccess).toHaveBeenCalled();
  } finally {
    provider.close();
  }
});
it("adds only preflyt.yml on a setup branch and preserves every existing workflow", async () => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "pipelineWriteAvailability").mockResolvedValue({
    available: true,
  });
  vi.spyOn(provider, "openRepository").mockResolvedValue({
    metadata: { owner: { login: "fixture" }, name: "app" },
    request: vi.fn().mockResolvedValue({ commit: { sha: "a".repeat(40) } }),
  });
  vi.spyOn(provider, "appRequest").mockResolvedValue({
    data: { token: "fixture-only" },
  });
  const calls: { path: string; method: string; body: any }[] = [];
  vi.spyOn(provider, "apiFetch").mockImplementation(
    async (_scope: string, url: string, options: any) => {
      const path = new URL(url).pathname;
      calls.push({
        path,
        method: options.method,
        body: options.body ? JSON.parse(options.body) : null,
      });
      const data =
        path.includes("matching-refs") ||
        (path.endsWith("/pulls") && options.method === "GET")
          ? []
          : path.endsWith("/git/commits/" + "a".repeat(40))
            ? { tree: { sha: "b".repeat(40) } }
            : path.endsWith("/git/trees")
              ? { sha: "c".repeat(40) }
              : path.endsWith("/git/commits")
                ? { sha: "d".repeat(40) }
                : path.endsWith("/pulls")
                  ? {
                      number: 4,
                      html_url: "https://github.com/fixture/app/pull/4",
                      head: { sha: "d".repeat(40) },
                      base: { ref: "development" },
                    }
                  : {};
      return { ok: true, json: async () => data };
    },
  );
  try {
    await provider.createPipelineSetupPr(
      5n,
      6n,
      "development",
      "a".repeat(40),
      { ".github/workflows/preflyt.yml": "# Reviewed workflow" },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      true,
    );
    expect(calls.find((c) => c.path.endsWith("/git/trees"))?.body.tree).toEqual(
      [
        {
          path: ".github/workflows/preflyt.yml",
          mode: "100644",
          type: "blob",
          content: "# Reviewed workflow",
        },
      ],
    );
    expect(
      calls.find((c) => c.path.endsWith("/pulls") && c.method === "POST")?.body
        .base,
    ).toBe("development");
    expect(calls.find((c) => c.path.endsWith("/git/refs"))?.body.ref).toMatch(
      /^refs\/heads\/preflyt\/setup-/,
    );
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  } finally {
    provider.close();
  }
});
