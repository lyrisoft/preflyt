import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PipelineSetupController } from "../src/assessments/pipeline-setup.controller.js";
import { standalonePrWorkflow } from "../src/assessments/standalone-pr-workflow.js";

const rules = [{ id: "security.sast", title: "Security", required: true }];
const snapshot = {
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  branch: "development",
  fullName: "fixture/app",
  complete: true,
  warnings: [],
  files: [],
};
const generated = standalonePrWorkflow(
  snapshot,
  rules,
  "https://preflyt.example",
);
const session = {
  authenticated: true,
  identityId: "actor",
  subject: "actor",
  email: null,
  role: "USER",
  organizationId: "org",
};
const request = {
  headers: { origin: "https://preflyt.example" },
  preflytSession: session,
} as any;
let controller: PipelineSetupController;
let github: any;
let access: any;
let prisma: any;
let automation: any;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv("PREFLYT_PUBLIC_API_URL", "https://preflyt.example");
  vi.stubEnv("GITHUB_CHECK_PUBLICATION_ENABLED", "true");
  vi.stubEnv("AUTOMATIC_CHECK_PUBLICATION_ENABLED", "true");
  github = {
    createPipelineSetupPr: vi
      .fn()
      .mockResolvedValue({
        number: 7,
        url: "https://github.com/fixture/app/pull/7",
      }),
  };
  access = { requireRepository: vi.fn().mockResolvedValue({}) };
  prisma = {
    readinessAutomation: {
      findUnique: vi.fn().mockResolvedValue({ enabled: true }),
    },
    auditEvent: { createMany: vi.fn() },
  };
  automation = { configure: vi.fn() };
  controller = new PipelineSetupController(
    prisma,
    access,
    { assertOrigin: vi.fn() } as any,
    github,
    {} as any,
    {} as any,
    automation,
  );
  vi.spyOn(controller as any, "standaloneSource").mockResolvedValue({
    repo: { id: "repo", installationId: 5n, githubId: 6n },
    policy: {
      id: "policy",
      branchRef: "refs/heads/development",
      definition: { rules },
    },
    generated,
    snapshot,
  });
  vi.spyOn(controller as any, "context").mockResolvedValue({});
});
const body = () => ({
  policyId: "policy",
  workflow: generated.workflow,
  baseSha: snapshot.sourceSha,
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
});
it('generates a review-only draft using the verified branch source and dedicated service', async () => {
  const ai = { generate: vi.fn(async () => ({ workflow: generated.workflow, summary: 'Review setup', skill: { id: 'preflyt-ci-setup' } })) };
  (controller as any).ai = ai;
  await expect(controller.standaloneGenerate('6', { ...body(), instructions: '' }, request)).resolves.toMatchObject({ skill: { id: 'preflyt-ci-setup' } });
  expect(ai.generate).toHaveBeenCalledWith(session, '6', 'policy', expect.any(Array), snapshot, generated.workflow, '', 'https://preflyt.example', body().requestId);
  expect(github.createPipelineSetupPr).not.toHaveBeenCalled();
  expect(automation.configure).not.toHaveBeenCalled();
});
it('rejects stale source or permission loss before generation and a branch move during inference', async () => {
  const ai = { generate: vi.fn(async () => ({ workflow: generated.workflow, summary: 'Review setup' })) };
  (controller as any).ai = ai;
  await expect(controller.standaloneGenerate('6', { ...body(), baseSha: 'd'.repeat(40), instructions: '' }, request)).rejects.toThrow('branch changed');
  expect(ai.generate).not.toHaveBeenCalled();
  access.requireRepository.mockRejectedValueOnce(new Error('Not allowed'));
  await expect(controller.standaloneGenerate('6', { ...body(), instructions: '' }, request)).rejects.toThrow('Not allowed');
  expect(ai.generate).not.toHaveBeenCalled();
  const source = (controller as any).standaloneSource;
  const current = await source();
  source.mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, generated: { ...generated, baseSha: 'e'.repeat(40) } });
  await expect(controller.standaloneGenerate('6', { ...body(), instructions: '' }, request)).rejects.toThrow('changed during generation');
  expect(github.createPipelineSetupPr).not.toHaveBeenCalled();
});
it("creates exactly the reviewed standalone file on the selected policy branch without a workflow ID", async () => {
  await expect(
    controller.standalonePullRequest("6", body(), request),
  ).resolves.toMatchObject({ number: 7, branch: "refs/heads/development" });
  expect(github.createPipelineSetupPr).toHaveBeenCalledWith(
    5n,
    6n,
    "refs/heads/development",
    snapshot.sourceSha,
    { ".github/workflows/preflyt.yml": generated.workflow },
    body().requestId,
    true,
  );
  expect(automation.configure).not.toHaveBeenCalled();
  expect(prisma.auditEvent.createMany).toHaveBeenCalledWith(
    expect.objectContaining({ skipDuplicates: true }),
  );
});
it("rejects stale target branches and unauthorized callers before writing GitHub", async () => {
  await expect(
    controller.standalonePullRequest(
      "6",
      { ...body(), baseSha: "d".repeat(40) },
      request,
    ),
  ).rejects.toThrow("target branch changed");
  access.requireRepository.mockRejectedValue(
    new Error("Repository is unavailable"),
  );
  await expect(
    controller.standalonePullRequest("6", body(), request),
  ).rejects.toThrow("unavailable");
  expect(github.createPipelineSetupPr).not.toHaveBeenCalled();
});
it("enables the publisher before the first setup PR can trigger a run", async () => {
  prisma.readinessAutomation.findUnique.mockResolvedValue(null);
  await controller.standalonePullRequest("6", body(), request);
  expect(automation.configure).toHaveBeenCalledWith(session, "6", true, 0);
  expect(automation.configure.mock.invocationCallOrder[0]).toBeLessThan(
    github.createPipelineSetupPr.mock.invocationCallOrder[0],
  );
});
