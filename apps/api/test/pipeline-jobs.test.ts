import { expect, it } from 'vitest'
import { completedPipelineJobs } from '../src/assessments/pipeline-jobs.js'
import { recordJobEvidence } from '../src/assessments/pipeline-job-evidence.js'
import { validateObservation } from '../src/assessments/evidence-validation.js'
const sha = 'a'.repeat(40)
const check = { id: '1', name: 'Type checks', sourceSha: sha, status: 'completed', conclusion: 'success', steps: [{ status: 'completed', conclusion: 'success' }] }
const gate = { ...check, id: '2', name: 'Preflyt final gate', status: 'in_progress', conclusion: null }
it('verifies completed prerequisites while only the terminal gate is running', () => {
  expect(completedPipelineJobs([check, gate], sha)).toEqual({jobIds: ['1'], conclusion: 'success'});
  expect(completedPipelineJobs([check, gate, {...check, id: '3', status: 'in_progress'}], sha)).toBeNull();
  expect(completedPipelineJobs([{...check, sourceSha: 'b'.repeat(40)}, gate], sha)).toBeNull();
  expect(completedPipelineJobs([gate], sha)).toBeNull();
  expect(completedPipelineJobs([check, gate, {...gate, id: '3'}], sha)).toBeNull();
  expect(completedPipelineJobs([{...check, conclusion: 'failure'}, gate], sha)?.conclusion).toBe('failure');
  expect(completedPipelineJobs([{...check, steps: [{status: 'in_progress', conclusion: null}]}, gate], sha)).toBeNull();
});
it('retains API job evidence separately from webhook events with a validated immutable projection', async () => {
  let delivery: any, observation: any;
  const db = { gitHubWebhookDelivery: { createMany: async ({data}: any) => { delivery = data[0] }, findUniqueOrThrow: async () => delivery },
    importedCiEvidence: { createMany: async ({data}: any) => { observation = data[0] }, findUniqueOrThrow: async () => observation } };
  const row = await recordJobEvidence(db, { submissionId: 'receipt', repositoryId: 51n, installationId: 50n,
    sourceSha: sha, runId: '10', runAttempt: 2, workflowId: '20', jobIds: ['1'], conclusion: 'success' });
  expect(row.sourceKind).toBe('workflow_jobs');
  expect(validateObservation(row, delivery)).toBe(true);
  expect(validateObservation({...row, sourceSha: 'b'.repeat(40)}, delivery)).toBe(false);
});
