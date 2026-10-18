import { afterEach, expect, it, vi } from "vitest";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
afterEach(() => vi.restoreAllMocks());
it("loads a branch-pinned workflow using contents read access and normalizes policy branch refs", async () => {
  const provider = new GitHubProviderService() as any;
  const workflow =
    "name: CI\non: pull_request\njobs: {test: {runs-on: ubuntu-latest, steps: []}}\n";
  vi.spyOn(provider, "discoverPipelineWorkflows").mockResolvedValue({
    workflows: [{ id: "7", name: "CI", path: ".github/workflows/ci.yml" }],
    truncated: false,
  });
  const request = vi
    .fn()
    .mockResolvedValueOnce({ commit: { sha: "a".repeat(40) } })
    .mockResolvedValueOnce({
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(workflow),
      path: ".github/workflows/ci.yml",
      sha: "b".repeat(40),
      content: Buffer.from(workflow).toString("base64"),
    });
  const reader = vi
    .spyOn(provider, "openRepository")
    .mockResolvedValue({
      metadata: { owner: { login: "fixture" }, name: "app" },
      request,
    });
  await expect(
    provider.readPipelineWorkflow(5n, 6n, "7", "refs/heads/main"),
  ).resolves.toMatchObject({
    branch: "main",
    baseSha: "a".repeat(40),
    workflow,
  });
  expect(reader).toHaveBeenCalledWith(5n, 6n, "contents", undefined, 60_000, true);
  expect(request.mock.calls[0][0]).toBe("/repos/fixture/app/branches/main");
  expect(request.mock.calls[1][0]).toContain("?ref=" + "a".repeat(40));
  provider.close();
});

it.each([
  ["branch", 404, 'Policy branch "main" was not found in fixture/app'],
  ["file", 404, 'Workflow ".github/workflows/ci.yml" was not found on policy branch "main"'],
  ["branch", 403, "GitHub denied access to the policy branch"],
  ["file", 403, "GitHub denied access to the workflow file"],
  ["metadata", 404, "GitHub repository access is unavailable"],
] as const)("reports %s lookup failures (%s) without switching branches", async (stage, status, message) => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "verifyInstallation").mockResolvedValue({ id: 5n });
  vi.spyOn(provider, "installationToken").mockResolvedValue("test-token");
  vi.spyOn(provider, "discoverPipelineWorkflows").mockResolvedValue({
    workflows: [{ id: "7", name: "CI", path: ".github/workflows/ci.yml" }],
    truncated: false,
  });
  const paths: string[] = [];
  vi.spyOn(provider, "apiFetch").mockImplementation(async (_scope: unknown, url: string) => {
    const path = new URL(url).pathname;
    paths.push(path);
    const current = path.includes("/branches/") ? "branch" : path.includes("/contents/") ? "file" : "metadata";
    return new Response(JSON.stringify(current === "metadata"
      ? { id: 6, name: "app", owner: { login: "fixture" }, default_branch: "master" }
      : { commit: { sha: "a".repeat(40) } }), { status: current === stage ? status : 200 });
  });
  try {
    await expect(provider.readPipelineWorkflow(5n, 6n, "7", "refs/heads/main", true)).rejects.toMatchObject({
      message: expect.stringContaining(message),
      status: stage === "metadata" ? 403 : status,
    });
    expect(paths.some(path => path.includes("/branches/master"))).toBe(false);
    if (stage === "branch") expect(paths.some(path => path.includes("/contents/"))).toBe(false);
  } finally {
    provider.close();
  }
});
it("does not mint a write token when the GitHub App lacks workflow write permission", async () => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "verifyInstallation").mockResolvedValue({
    permissions: { contents: "write", pull_requests: "write" },
  });
  const mint = vi.spyOn(provider, "appRequest");
  const files = {
    ".github/workflows/ci.yml": "name: CI",
  };
  await expect(
    provider.createPipelineSetupPr(
      5n,
      6n,
      "refs/heads/main",
      "a".repeat(40),
      files,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ),
  ).rejects.toThrow("permissions");
  expect(mint).not.toHaveBeenCalled();
  provider.close();
});
it("refuses to create a setup branch after the reviewed base changes", async () => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "pipelineWriteAvailability").mockResolvedValue({
    available: true,
  });
  vi.spyOn(provider, "openRepository").mockResolvedValue({
    metadata: { owner: { login: "fixture" }, name: "app" },
    request: vi.fn().mockResolvedValue({ commit: { sha: "b".repeat(40) } }),
  });
  const mint = vi.spyOn(provider, "appRequest");
  const files = {
    ".github/workflows/ci.yml": "name: CI",
  };
  await expect(
    provider.createPipelineSetupPr(
      5n,
      6n,
      "refs/heads/main",
      "a".repeat(40),
      files,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ),
  ).rejects.toThrow("branch changed");
  expect(mint).not.toHaveBeenCalled();
  provider.close();
});

it("reads the exact workflow attempt directly and requires a complete job collection", async () => {
  const provider = new GitHubProviderService() as any;
  const job = {name: "Checks", id: 9, run_id: 7, head_sha: "a".repeat(40), status: "completed", conclusion: "success", steps: [{status: "completed", conclusion: "success"}]};
  const request = vi.fn().mockResolvedValue({total_count: 1, jobs: [job]});
  const reader = vi.spyOn(provider, "openRepository").mockResolvedValue({metadata: {owner: {login: "fixture"}, name: "app"}, request});
  await expect(provider.readPipelineJobs(5n, 6n, "7", 2)).resolves.toEqual([{id: "9", name: "Checks", sourceSha: "a".repeat(40), status: "completed", conclusion: "success", steps: job.steps}]);
  expect(reader).toHaveBeenCalledWith(5n, 6n, "actions");
  expect(request).toHaveBeenCalledWith("/repos/fixture/app/actions/runs/7/attempts/2/jobs?per_page=100");
  for (const response of [{total_count: 2, jobs: [job]}, {total_count: 0, jobs: []}, {total_count: 1, jobs: [{...job,run_id: 8}]}, {total_count: 1, jobs: [{...job,steps: undefined}]}]) {
    request.mockResolvedValue(response);
    await expect(provider.readPipelineJobs(5n, 6n, "7", 2)).rejects.toThrow("Workflow jobs could not be verified");
  }
  await expect(provider.readPipelineJobs(5n, 6n, "7", 0)).rejects.toThrow("Invalid workflow run attempt");
  provider.close();
});

it("creates one reviewed chained workflow and removes the legacy gate on the selected branch", async () => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "pipelineWriteAvailability").mockResolvedValue({available: true});
  vi.spyOn(provider, "openRepository").mockResolvedValue({
    metadata: {owner: {login: "fixture"}, name: "app"},
    request: vi.fn().mockResolvedValue({commit: {sha: "a".repeat(40)}}),
  });
  const mint = vi.spyOn(provider, "appRequest").mockResolvedValue({data: {token: "test-token"}});
  const fetch = vi.spyOn(provider, "apiFetch").mockImplementation(async (key: any, url: any, options: any) => {
    const path = new URL(url).pathname;
    let data: any = {};
    if (path.endsWith("/pulls") && options.method === "GET") data = [];
    else if (path.includes("/matching-refs/")) data = [];
    else if (path.endsWith("/git/commits/" + "a".repeat(40))) data = {tree: {sha: "b".repeat(40)}};
    else if (path.endsWith('/git/trees/' + 'b'.repeat(40))) data = {tree: [{path: '.github/workflows/preflyt-gate.yml'}], truncated: false};
    else if (path.endsWith("/git/trees")) data = {sha: "c".repeat(40)};
    else if (path.endsWith("/git/commits")) data = {sha: "d".repeat(40)};
    else if (path.endsWith("/pulls")) data = {number: 3, html_url: "https://github.com/fixture/app/pull/3", head: {sha: "d".repeat(40)}, base: {ref: "main"}};
    return {ok: true, json: async () => data};
  });
  const files = {".github/workflows/ci.yml": "name: CI"};
  const args = [5n, 6n, "main", "a".repeat(40), files, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
  await expect(provider.createPipelineSetupPr(...args)).resolves.toEqual({number: 3, url: "https://github.com/fixture/app/pull/3"});
  const tree = fetch.mock.calls.find((call: any[]) => call[1].endsWith("/git/trees"))!;
  expect(JSON.parse((tree[2] as any).body)).toMatchObject({base_tree: "b".repeat(40), tree: [...Object.entries(files).map(([path, content]) => ({path, content})), {path: ".github/workflows/preflyt-gate.yml", sha: null}]});
  expect(mint).toHaveBeenCalledTimes(1);
  for (const invalid of [{}, {...files, ".github/actions/preflyt-policy/run.py": "# unnecessary"}, {".github/workflows/preflyt-gate.yml": "gate", "secrets.txt": "unsafe"}]) {
    await expect(provider.createPipelineSetupPr(...args.slice(0, 4), invalid, args[5])).rejects.toThrow("Invalid reviewed workflow files");
  }
  expect(mint).toHaveBeenCalledTimes(1);
  provider.close();
});
