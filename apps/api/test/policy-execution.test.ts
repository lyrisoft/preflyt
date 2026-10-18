import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeEach, expect, it, vi } from 'vitest';
import { PipelinePolicyController } from '../src/assessments/pipeline-policy.controller.js';
import { digest } from '../src/assessments/assessment-digest.js';
import { policyExecution } from '../src/assessments/policy-execution.js';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), standards: vi.fn() }));
vi.mock('../src/assessments/pipeline-identity.js', () => ({ pipelineIdentity: mocks.identity }));
vi.mock('../src/standards/policy-standards.js', () => ({ currentStandards: mocks.standards }));
const sha = 'b'.repeat(40), merge = 'c'.repeat(40);
beforeEach(() => {
  mocks.identity.mockResolvedValue({ repository_id: '51', repository: 'org/repo', run_id: '100', run_attempt: '1', sha: merge,
    event_name: 'pull_request', ref: 'refs/pull/7/merge', workflow_ref: 'org/repo/.github/workflows/ci.yml@refs/pull/7/merge' });
  mocks.standards.mockResolvedValue({ id: 'approved-selection' });
});
function fixture() {
  const definition = { rules: [{ id: 'types.required', title: 'Types', required: true, workflowCommand: 'pnpm typecheck', reportPath: 'reports/types.xml' }] };
  const policy = { id: 'policy-v1', state: 'PUBLISHED', definition, definitionHash: digest(definition) };
  const db = { gitHubRepository: { findFirst: vi.fn().mockResolvedValue({ id: 'repo', githubId: 51n, installationId: 1n, fullName: 'org/repo', readinessAutomation: { enabled: true, actorId: 'owner', organizationId: 'org' } }) }, gatePolicyRevision: { findFirst: vi.fn().mockResolvedValue(policy) } };
  const github = { readReadinessWorkflowRun: vi.fn().mockResolvedValue({ runAttempt: 1, status: 'in_progress', sourceSha: sha }),
    readPullRequest: vi.fn().mockResolvedValue({ context: { state: 'open', draft: false, head: { sha, repositoryId: '51' }, base: { ref: 'development', repositoryId: '51' } } }) };
  const access = { requireRepository: vi.fn().mockResolvedValue({}) };
  return { policy, db, github, access, controller: new PipelinePolicyController(db as any, github as any, access as any) };
}
it('exports approved execution and follows the newest published target-branch policy without workflow mappings', async () => {
  const f = fixture();
  const first = await f.controller.policy('Bearer fixture');
  expect(first).toMatchObject({ executionVersion: 1, id: 'policy-v1', headSha: sha, sourceSha: merge, branchRef: 'refs/heads/development' });
  expect(first.checks[0]!.execution).toEqual({ argv: ['bash', '-lc', 'pnpm typecheck'], report: 'reports/types.xml' });
  expect(f.db.gatePolicyRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: 'PUBLISHED', branchRef: 'refs/heads/development' }) }));
  const definition = { rules: [{ id: 'secrets.scan', title: 'Secrets', required: true }] };
  f.db.gatePolicyRevision.findFirst.mockResolvedValue({ ...f.policy, id: 'policy-v2', definition, definitionHash: digest(definition) } as any);
  const next = await f.controller.policy('Bearer fixture');
  expect(next.checks).toHaveLength(1);
  expect(next.checks[0]!.execution?.argv).toEqual(['preflyt-recipe', 'secrets.scan', '.preflyt/results/secrets.scan.sarif']);
  expect(first.checks[0]!.execution?.argv).toContain('pnpm typecheck');
});
it('keeps unconfigured custom checks and evidence-only controls unexecutable', () => {
  expect(policyExecution({ id: 'frontend.components', title: 'Components' })).toBeNull();
  expect(policyExecution({ id: 'coverage.required', title: 'Coverage' })).toBeNull();
});
it('rejects missing identity, revoked access, stale PR and altered policy before exporting commands', async () => {
  const f = fixture();
  mocks.identity.mockRejectedValueOnce(new Error('No verified identity'));
  await expect(f.controller.policy(undefined)).rejects.toThrow('identity');
  f.access.requireRepository.mockRejectedValueOnce(new Error('Permission denied'));
  await expect(f.controller.policy('Bearer fixture')).rejects.toThrow('Permission');
  f.github.readReadinessWorkflowRun.mockResolvedValueOnce({ runAttempt: 2, status: 'in_progress', sourceSha: sha });
  await expect(f.controller.policy('Bearer fixture')).rejects.toThrow('changed');
  f.github.readPullRequest.mockResolvedValueOnce({ context: { state: 'open', draft: false, head: { sha: 'd'.repeat(40), repositoryId: '51' }, base: { ref: 'development', repositoryId: '51' } } });
  await expect(f.controller.policy('Bearer fixture')).rejects.toThrow('current commit');
  f.db.gatePolicyRevision.findFirst.mockResolvedValueOnce({ ...f.policy, definitionHash: 'tampered' });
  await expect(f.controller.policy('Bearer fixture')).rejects.toThrow('integrity');
});

it.skipIf(!process.env.PREFLYT_ACTION_CHECKOUT).each(['pull_request','push'])('runs the actual exported API manifest in the separate Action checkout (%s)', async event => {
  const root = await mkdtemp(join(tmpdir(), 'preflyt-contract-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    await writeFile(join(root, 'source.txt'), 'contract fixture');
    git('add', 'source.txt');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    const head = git('rev-parse', 'HEAD');
    if(event==='push')mocks.identity.mockResolvedValue({repository_id:'51',repository:'org/repo',run_id:'100',run_attempt:'1',sha:head,event_name:'push',ref:'refs/heads/development',workflow_ref:'org/repo/.github/workflows/ci.yml@refs/heads/development'});
    const f = fixture();
    f.github.readReadinessWorkflowRun.mockResolvedValue({ runAttempt: 1, status: 'in_progress', sourceSha: head, event, headBranch:'development',runCreatedAt:new Date().toISOString() });
    f.github.readPullRequest.mockResolvedValue({ context: { state: 'open', draft: false, head: { sha: head, repositoryId: '51' }, base: { ref: 'development', repositoryId: '51' } } });
    const definition = { rules: [{ id: 'build.required', title: 'Build', required: true, workflowCommand: 'python3 -c "raise SystemExit(0)"' }] };
    f.db.gatePolicyRevision.findFirst.mockResolvedValue({ ...f.policy, definition, definitionHash: digest(definition) } as any);
    const exported = await f.controller.policy('Bearer fixture');
    await writeFile(join(root, 'policy.json'), JSON.stringify(exported));
    execFileSync('python3', [join(process.env.PREFLYT_ACTION_CHECKOUT!, 'run.py')], { cwd: root, encoding: 'utf8', env: { ...process.env,
      GITHUB_WORKSPACE: root, GITHUB_SHA: event==='push'?head:merge, GITHUB_REPOSITORY_ID: '51', GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_WORKFLOW_REF: 'org/repo/.github/workflows/ci.yml@refs/pull/7/merge', RUNNER_TEMP: root,
      PREFLYT_POLICY_PATH: join(root, 'policy.json'), GITHUB_OUTPUT: join(root, 'outputs'), GITHUB_STEP_SUMMARY: join(root, 'summary') } });
    const outputs = Object.fromEntries((await readFile(join(root, 'outputs'), 'utf8')).trim().split('\n').map(line => line.split('=')));
    expect(outputs.result).toBe('passed');
    const bundle = JSON.parse(await readFile(outputs.bundle!, 'utf8'));
    expect(bundle).toMatchObject({ headSha: head, sourceSha: event==='push'?head:merge, policyHash: exported.definitionHash, repositoryId: '51' });
    expect(bundle.reports[0]).toMatchObject({ ruleId: 'build.required', format: 'junit' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('exports push-branch commands without requiring an open PR and rejects mismatched identities', async () => {
  const f=fixture();
  mocks.identity.mockResolvedValue({repository_id:'51',repository:'org/repo',run_id:'100',run_attempt:'1',sha,event_name:'push',ref:'refs/heads/development',workflow_ref:'org/repo/.github/workflows/ci.yml@refs/heads/development'});
  const run={event:'push',headBranch:'development',sourceSha:sha,runAttempt:1,status:'in_progress',runCreatedAt:new Date().toISOString()};
  f.github.readReadinessWorkflowRun.mockResolvedValue(run);
  expect(await f.controller.policy('Bearer fixture')).toMatchObject({stage:'branch',pullRequest:null,headSha:sha,sourceSha:sha,branchRef:'refs/heads/development'});
  expect(f.github.readPullRequest).not.toHaveBeenCalled();
  for(const patch of [{headBranch:'other'},{sourceSha:merge},{event:'pull_request'},{runCreatedAt:''},{runAttempt:2}]){
    f.github.readReadinessWorkflowRun.mockResolvedValueOnce({...run,...patch});
    await expect(f.controller.policy('Bearer fixture')).rejects.toThrow();
  }
  f.access.requireRepository.mockRejectedValueOnce(new Error('Permission denied'));
  await expect(f.controller.policy('Bearer fixture')).rejects.toThrow('Permission');
});
