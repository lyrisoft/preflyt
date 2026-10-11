/** GitHub API job data only. Never accepts Action-reported success as execution proof. */
export const FINAL_GATE_NAME = 'Preflyt final gate'
export type PipelineJob = { id: string; name: string; sourceSha: string; status: string;
  conclusion: string | null; steps: { status: string; conclusion: string | null }[] }
export function completedPipelineJobs(jobs: PipelineJob[], sourceSha: string) {
  const gates = jobs.filter(j => j.name === FINAL_GATE_NAME || j.name.endsWith(' / ' + FINAL_GATE_NAME))
  if (gates.length !== 1 || !['in_progress', 'completed'].includes(gates[0].status)) return null
  if (gates[0].status === 'completed' && gates[0].conclusion !== 'success') return null
  const checks = jobs.filter(j => j !== gates[0])
  if (!checks.length || checks.some(j => j.status !== 'completed' || j.sourceSha !== sourceSha)) return null
  const executed = checks.filter(j => j.conclusion !== 'skipped')
  if (!executed.length || executed.some(j => !j.steps.length || j.steps.some(s => s.status !== 'completed'))) return null
  const success = executed.every(j => j.conclusion === 'success' && j.steps.every(s => ['success', 'skipped'].includes(s.conclusion ?? '')))
  return { jobIds: checks.map(j => j.id).sort(), conclusion: success ? 'success' : 'failure' }
}
