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
  expect(reader).toHaveBeenCalledWith(5n, 6n, "contents");
  expect(request.mock.calls[0][0]).toBe("/repos/fixture/app/branches/main");
  expect(request.mock.calls[1][0]).toContain("?ref=" + "a".repeat(40));
  provider.close();
});
it("does not mint a write token when the GitHub App lacks workflow write permission", async () => {
  const provider = new GitHubProviderService() as any;
  vi.spyOn(provider, "verifyInstallation").mockResolvedValue({
    permissions: { contents: "write", pull_requests: "write" },
  });
  const mint = vi.spyOn(provider, "appRequest");
  const files = {
    ".github/workflows/ci.yml": "name: CI",
    ".github/actions/preflyt-policy/action.yml": "name: Preflyt",
    ".github/actions/preflyt-policy/run.py": "# fixture",
    ".github/actions/preflyt-policy/transport.py": "# fixture",
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
    ".github/actions/preflyt-policy/action.yml": "name: Preflyt",
    ".github/actions/preflyt-policy/run.py": "# fixture",
    ".github/actions/preflyt-policy/transport.py": "# fixture",
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
  const job = {id: 9, run_id: 7, head_sha: "a".repeat(40), status: "completed", conclusion: "success", steps: [{status: "completed", conclusion: "success"}]};
  const request = vi.fn().mockResolvedValue({total_count: 1, jobs: [job]});
  const reader = vi.spyOn(provider, "openRepository").mockResolvedValue({metadata: {owner: {login: "fixture"}, name: "app"}, request});
  await expect(provider.readPipelineJobs(5n, 6n, "7", 2)).resolves.toEqual([{id: "9", sourceSha: "a".repeat(40), status: "completed", conclusion: "success", steps: job.steps}]);
  expect(reader).toHaveBeenCalledWith(5n, 6n, "actions");
  expect(request).toHaveBeenCalledWith("/repos/fixture/app/actions/runs/7/attempts/2/jobs?per_page=100");
  for (const response of [{total_count: 2, jobs: [job]}, {total_count: 0, jobs: []}, {total_count: 1, jobs: [{...job,run_id: 8}]}, {total_count: 1, jobs: [{...job,steps: undefined}]}]) {
    request.mockResolvedValue(response);
    await expect(provider.readPipelineJobs(5n, 6n, "7", 2)).rejects.toThrow("Workflow jobs could not be verified");
  }
  await expect(provider.readPipelineJobs(5n, 6n, "7", 0)).rejects.toThrow("Invalid workflow run attempt");
  provider.close();
});
