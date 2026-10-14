import { describe, expect, it, vi } from "vitest";
import { policyAction } from "../src/assessments/pipeline-action.js";
import { publicationGateJob } from "../src/assessments/pipeline-gate-workflow.js";
import {
  PipelineGateController,
  pipelineAiResult,
  publicationGateResult,
} from "../src/assessments/pipeline-gate.controller.js";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  standards: vi.fn().mockResolvedValue({ id: "selection" }),
}));
vi.mock("../src/standards/policy-standards.js", () => ({
  currentStandards: mocks.standards,
}));
vi.mock("../src/assessments/pipeline-identity.js", () => ({
  pipelineIdentity: mocks.identity,
}));
describe("final publication gate", () => {
  it('distinguishes execution verification, publication, AI processing and feedback without changing outcomes', () => {
    expect(publicationGateResult({ state: 'PROCESSING' }, null)).toMatchObject({ state: 'PENDING', stage: 'RESULT_VERIFICATION' })
    expect(publicationGateResult({ state: 'COMPLETE' }, null)).toMatchObject({ state: 'PENDING', stage: 'GITHUB_PUBLICATION' })
    expect(publicationGateResult({ state: 'STALE' }, null)).toMatchObject({ state: 'FAILED', stage: 'CONTEXT_CHANGED' })
    const checks = [{ id: 'review' }], snapshot = { checks }
    expect(pipelineAiResult(checks, [])).toMatchObject({ state: 'PENDING', stage: 'AI_REVIEW' })
    expect(pipelineAiResult(checks, [{ snapshot, state: 'RUNNING', feedbackState: 'NOT_REQUESTED' }])).toMatchObject({ stage: 'AI_REVIEW' })
    expect(pipelineAiResult(checks, [{ snapshot, state: 'SUCCEEDED', feedbackState: 'RETRY' }])).toMatchObject({ state: 'PENDING', stage: 'AI_PUBLICATION' })
    expect(pipelineAiResult(checks, [{ snapshot, state: 'SUCCEEDED', feedbackState: 'FAILED' }])).toMatchObject({ state: 'FAILED', stage: 'AI_PUBLICATION_FAILED' })
    expect(pipelineAiResult(checks, [{ snapshot, state: 'SUCCEEDED', feedbackState: 'PUBLISHED' }])).toMatchObject({ state: 'PASSED', stage: 'COMPLETE' })
  })
  it("passes only a verified published success; missing, failed and stale results fail closed", () => {
    expect(publicationGateResult({ state: "PENDING" }, null).state).toBe(
      "PENDING",
    );
    expect(
      publicationGateResult(
        { state: "COMPLETE" },
        { state: "PUBLISHING", verifiedAt: null, conclusion: "success" },
      ).state,
    ).toBe("PENDING");
    expect(
      publicationGateResult(
        { state: "COMPLETE" },
        { state: "PUBLISHED", verifiedAt: new Date(), conclusion: "success" },
      ).state,
    ).toBe("PASSED");
    for (const conclusion of ["failure", "action_required", null])
      expect(
        publicationGateResult(
          { state: "COMPLETE" },
          { state: "PUBLISHED", verifiedAt: new Date(), conclusion },
        ).state,
      ).toBe("FAILED");
    expect(
      publicationGateResult(
        { state: "STALE" },
        { state: "PUBLISHED", verifiedAt: new Date(), conclusion: "success" },
      ).state,
    ).toBe("FAILED");
  });
  it('chains all prerequisite jobs and never checks out PR code in the gate', () => {
    const job = publicationGateJob(['tests', 'scan'], 'https://preflyt.example/api');
    expect(job.needs).toEqual(['tests', 'scan']);
    expect(job.if).toContain('always()');
    expect(job.name).toBe('Preflyt final gate');
    expect(job.steps).toHaveLength(1);
    expect(job.steps[0]).toMatchObject({ uses: policyAction, with: { mode: 'gate' } });
    expect(job.steps[0]).not.toHaveProperty('run');
    expect(job.steps[0].with).not.toHaveProperty('source-run');
  });
  it("denies a gate from another branch or workflow before reading a submission", async () => {
    mocks.identity.mockResolvedValue({
      repository_id: "51",
      repository: "org/repo",
      run_id: "200",
      run_attempt: "1",
      event_name: "workflow_run",
      ref: "refs/heads/feature",
      workflow_ref:
        "org/repo/.github/workflows/preflyt-gate.yml@refs/heads/feature",
    });
    const prisma = {
      gitHubRepository: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            defaultBranch: "main",
            fullName: "org/repo",
            readinessAutomation: { enabled: true },
          }),
      },
      pipelineRunSubmission: { findFirst: vi.fn() },
    };
    await expect(
      new PipelineGateController(prisma as any, {} as any, {} as any).status(
        "Bearer token",
        "123",
        "1",
      ),
    ).rejects.toThrow();
    expect(prisma.pipelineRunSubmission.findFirst).not.toHaveBeenCalled();
  });
});

it("verifies the PR-head GitHub receipt and queries only the submitted assessment at the pinned policy", async () => {
  mocks.identity.mockResolvedValue({
    repository_id: "51",
    repository: "org/repo",
    run_id: "123", run_attempt: "1", sha: "merge-sha", event_name: "pull_request",
    ref: "refs/pull/7/merge", workflow_ref: "org/repo/.github/workflows/ci.yml@refs/pull/7/merge",
  });
  const prisma = {
    gitHubRepository: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "repo",
          githubId: 51n,
          installationId: 50n,
          defaultBranch: "main",
          fullName: "org/repo",
          readinessAutomation: {
            enabled: true,
            actorId: "actor",
            organizationId: "org",
          },
        }),
    },
    pipelineRunSubmission: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          state: "COMPLETE",
          prNumber: 7,
          sourceSha: "head",
          policyId: "policy",
          policyHash: "hash",
          assessmentId: "assessment",
        }),
    },
    gatePolicyRevision: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "policy", definitionHash: "hash", definition: {} }),
    },
    gitHubCheckPublication: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "publication",
          checkRunId: "9",
          state: "PUBLISHED",
          verifiedAt: new Date(),
          conclusion: "success",
        }),
    },
  };
  const github = {
    readPipelineVerificationRun: vi.fn().mockResolvedValue({ runAttempt: 1, sourceSha: 'head',
      event: 'pull_request', workflowPath: '.github/workflows/ci.yml', status: 'in_progress',
      verifiedJobs: { jobIds: ['check'], conclusion: 'success' } }),
    readPullRequest: vi
      .fn()
      .mockResolvedValue({
        context: {
          state: "open",
          draft: false,
          head: { sha: "head", repositoryId: "51" },
          base: { ref: "main", repositoryId: "51" },
        },
      }),
    readPublishedReadinessCheck: vi
      .fn()
      .mockResolvedValue({ externalId: "publication", conclusion: "success" }),
  };
  const controller = new PipelineGateController(
    prisma as any,
    { requireRepository: vi.fn() } as any,
    github as any,
  );
  expect((await controller.status("Bearer token", "123", "1")).state).toBe(
    "PASSED",
  );
  expect(prisma.gitHubCheckPublication.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        repositoryId: "repo",
        organizationId: "org",
        assessmentId: "assessment",
        sourceSha: "head",
        policyId: "policy",
        policyHash: "hash",
      },
    }),
  );
  expect(github.readPublishedReadinessCheck).toHaveBeenCalledWith(
    50n,
    51n,
    "9",
    "head",
  );
  github.readPublishedReadinessCheck.mockResolvedValue({
    externalId: "other-assessment",
    conclusion: "success",
  });
  expect((await controller.status("Bearer token", "123", "1")).state).toBe(
    "FAILED",
  );
  github.readPublishedReadinessCheck.mockRejectedValue(
    new Error("GitHub unavailable"),
  );
  await expect(controller.status("Bearer token", "123", "1")).rejects.toThrow(
    "GitHub unavailable",
  );
});

it('waits for every configured AI review and PR publication, while advisory findings do not block', () => {
  const checks = [{ id: 'review' }];
  const snapshot = { checks };
  expect(pipelineAiResult(checks, []).state).toBe('PENDING');
  expect(pipelineAiResult(checks, [{ snapshot, state: 'SUCCEEDED', feedbackState: 'RETRY' }]).state).toBe('PENDING');
  expect(pipelineAiResult(checks, [{ snapshot, state: 'UNAVAILABLE', feedbackState: 'NOT_REQUESTED' }]).state).toBe('FAILED');
  expect(pipelineAiResult(checks, [{ snapshot, state: 'SUCCEEDED', feedbackState: 'PUBLISHED' }]).state).toBe('PASSED');
  expect(pipelineAiResult([{ id: 'other' }], [{ snapshot, state: 'SUCCEEDED', feedbackState: 'PUBLISHED' }]).state).toBe('PENDING');
});

function gateRetryFixture() {
  const step = { name: 'Policy checks', number: 1, status: 'completed', conclusion: 'success',
    startedAt: '2026-10-14T20:00:00Z', completedAt: '2026-10-14T20:01:00Z' }
  const check = { id: '10', name: 'checks', sourceSha: 'head', status: 'completed', conclusion: 'success',
    startedAt: step.startedAt, completedAt: step.completedAt, steps: [step] }
  const gate = { ...check, id: '20', name: 'Preflyt final gate', status: 'completed', conclusion: 'failure' }
  const previous = [check, gate], current = [{ ...check, id: '30' }, { ...gate, id: '40', status: 'in_progress', conclusion: null }]
  const prior = { id: 'submission', runAttempt: 1, state: 'COMPLETE', prNumber: 7, sourceSha: 'head',
    workflowSha: 'merge-sha', policyId: 'policy', policyHash: 'hash', assessmentId: 'assessment' }
  const metadata = { schemaVersion: 1, submissionId: prior.id, repositoryId: 'repo', sourceSha: 'head', runId: '123', runAttempt: 1,
    workflowId: '99', policyId: 'policy', policyHash: 'hash', verificationScope: 'jobs', jobIds: ['10'] }
  const db = {
    gitHubRepository: { findFirst: vi.fn().mockResolvedValue({ id: 'repo', githubId: 51n, installationId: 50n,
      fullName: 'org/repo', readinessAutomation: { enabled: true, actorId: 'actor', organizationId: 'org' } }) },
    pipelineRunSubmission: { findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(typeof where.runAttempt === 'number' ? null : prior)) },
    auditEvent: { findUnique: vi.fn().mockResolvedValue({ event: 'pipeline.run.verified', metadata }) },
    gatePolicyRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'policy', definitionHash: 'hash' }) },
    gitHubCheckPublication: { findFirst: vi.fn().mockResolvedValue({ id: 'publication', checkRunId: '9', state: 'PUBLISHED',
      verifiedAt: new Date(), conclusion: 'success' }) },
  }
  const github = {
    readPipelineVerificationRun: vi.fn().mockResolvedValue({ runAttempt: 2, sourceSha: 'head', event: 'pull_request',
      workflowPath: '.github/workflows/ci.yml', workflowId: '99', verifiedJobs: { jobIds: ['30'], conclusion: 'success' } }),
    readPipelineJobs: vi.fn().mockImplementation((_i, _r, _run, attempt) => Promise.resolve(attempt === 1 ? previous : current)),
    readPullRequest: vi.fn().mockResolvedValue({ context: { state: 'open', draft: false,
      head: { sha: 'head', repositoryId: '51' }, base: { ref: 'development', repositoryId: '51' } } }),
    readPublishedReadinessCheck: vi.fn().mockResolvedValue({ externalId: 'publication', conclusion: 'success' }),
  }
  mocks.identity.mockResolvedValue({ repository_id: '51', repository: 'org/repo', run_id: '123', run_attempt: '2',
    sha: 'merge-sha', event_name: 'pull_request', ref: 'refs/pull/7/merge',
    workflow_ref: 'org/repo/.github/workflows/ci.yml@refs/pull/7/merge' })
  const controller = new PipelineGateController(db as any, { requireRepository: vi.fn() } as any, github as any)
  return { db, github, prior, metadata, previous, current, status: () => controller.status('Bearer token', '123', '2') }
}
it('reuses a verified earlier submission only for copied executions in the same authenticated run', async () => {
  const f = gateRetryFixture()
  expect(await f.status()).toMatchObject({ state: 'PASSED' })
  expect(f.github.readPipelineJobs.mock.calls.map(c => c[3])).toEqual([1, 2])
  expect(f.db.pipelineRunSubmission.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
    runId: '123', runAttempt: { lt: 2 }, sourceSha: 'head', workflowSha: 'merge-sha', state: 'COMPLETE',
  }) }))
  expect(f.db.gitHubCheckPublication.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assessmentId: 'assessment' }) }))
})
it('fails immediately when completed jobs have no compatible submission instead of waiting for an impossible submission', async () => {
  const f = gateRetryFixture()
  f.db.pipelineRunSubmission.findFirst.mockResolvedValue(null)
  expect(await f.status()).toMatchObject({ state: 'FAILED', stage: 'RESULT_VERIFICATION_FAILED' })
  expect(f.github.readPublishedReadinessCheck).not.toHaveBeenCalled()
})
it('rejects missing or mismatched acceptance proof, different workflow commits and newly executed prerequisite jobs', async () => {
  for (const change of ['no-proof', 'proof-jobs', 'proof-policy', 'proof-run', 'workflow', 'new-execution', 'changed-policy', 'changed-head']) {
    const f = gateRetryFixture()
    if (change === 'no-proof') f.db.auditEvent.findUnique.mockResolvedValue(null)
    if (change === 'proof-jobs') f.metadata.jobIds = ['other']
    if (change === 'proof-policy') f.metadata.policyHash = 'other'
    if (change === 'proof-run') f.metadata.runId = '999'
    if (change === 'workflow') f.prior.workflowSha = 'other'
    if (change === 'new-execution') f.current[0].completedAt = '2026-10-14T21:00:00Z'
    if (change === 'changed-policy') f.db.gatePolicyRevision.findFirst.mockResolvedValue({ id: 'new-policy', definitionHash: 'new-hash' })
    if (change === 'changed-head') f.github.readPullRequest.mockResolvedValue({ context: { state: 'open', draft: false,
      head: { sha: 'new-head', repositoryId: '51' }, base: { ref: 'development', repositoryId: '51' } } })
    expect(await f.status(), change).toMatchObject({ state: 'FAILED' })
  }
})
it('never falls back to old evidence when the current attempt submitted its own failed result', async () => {
  const f = gateRetryFixture()
  f.db.pipelineRunSubmission.findFirst.mockResolvedValue({ ...f.prior, runAttempt: 2, state: 'FAILED' })
  expect(await f.status()).toMatchObject({ state: 'FAILED', stage: 'RESULT_VERIFICATION_FAILED' })
  expect(f.db.auditEvent.findUnique).not.toHaveBeenCalled()
})
