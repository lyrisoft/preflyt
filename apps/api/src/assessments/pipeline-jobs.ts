/** GitHub API job data only. Never accepts Action-reported success as execution proof. */
export const FINAL_GATE_NAME = 'Preflyt final gate'
export type PipelineJob = { id: string; name: string; sourceSha: string; status: string;
  conclusion: string | null; startedAt?: string; completedAt?: string;
  steps: { name?: string; number?: number; startedAt?: string; completedAt?: string;
    status: string; conclusion: string | null }[] }
export function completedPipelineJobs(jobs: PipelineJob[], sourceSha: string, previouslyAccepted = false) {
  const gates = jobs.filter(j => j.name === FINAL_GATE_NAME || j.name.endsWith(' / ' + FINAL_GATE_NAME))
  if (gates.length !== 1 || !['in_progress', 'completed'].includes(gates[0].status)) return null
  // The terminal policy outcome must not overwrite the independently completed
  // collection jobs. Cancelled/unknown execution still cannot establish proof.
  if (gates[0].status === 'completed' && !['success', 'failure', ...(previouslyAccepted ? ['cancelled'] : [])].includes(gates[0].conclusion ?? '')) return null
  const checks = jobs.filter(j => j !== gates[0])
  if (!checks.length || checks.some(j => j.status !== 'completed' || j.sourceSha !== sourceSha)) return null
  const executed = checks.filter(j => j.conclusion !== 'skipped')
  if (!executed.length || executed.some(j => !j.steps.length || j.steps.some(s => s.status !== 'completed'))) return null
  const success = executed.every(j => j.conclusion === 'success' && j.steps.every(s => ['success', 'skipped'].includes(s.conclusion ?? '')))
  return { jobIds: checks.map(j => j.id).sort(), conclusion: success ? 'success' : 'failure' }
}

/** GitHub copies successful jobs to new IDs on partial reruns. Match the actual
 * execution, including step timestamps, against the original accepted attempt.
 * Skipped jobs have no execution to reuse and may get fresh skip timestamps. */
export function reusedPipelineJobs(previous: PipelineJob[], current: PipelineJob[], sourceSha: string) {
  // The controller must first verify the original server receipt. Cancelling
  // that attempt's terminal gate does not change its already accepted checks.
  const before = completedPipelineJobs(previous, sourceSha, true)
  const after = completedPipelineJobs(current, sourceSha)
  if (before?.conclusion !== 'success' || after?.conclusion !== 'success') return false
  const checks = (jobs: PipelineJob[]) => jobs.filter(j => j.name !== FINAL_GATE_NAME && !j.name.endsWith(' / ' + FINAL_GATE_NAME))
  const original = checks(previous), copied = checks(current)
  if (original.length !== copied.length || new Set(original.map(j => j.name)).size !== original.length ||
    new Set(copied.map(j => j.name)).size !== copied.length) return false
  const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
  const execution = (job: PipelineJob) => {
    if (job.conclusion === 'skipped') return JSON.stringify({ name: job.name, conclusion: 'skipped' })
    if (!timestamp(job.startedAt) || !timestamp(job.completedAt) || Date.parse(job.completedAt) < Date.parse(job.startedAt) ||
      job.steps.some(s => !s.name || !Number.isSafeInteger(s.number) || !timestamp(s.startedAt) || !timestamp(s.completedAt))) return null
    return JSON.stringify({ name: job.name, sourceSha: job.sourceSha, status: job.status, conclusion: job.conclusion,
      startedAt: job.startedAt, completedAt: job.completedAt,
      steps: job.steps.map(s => ({ name: s.name, number: s.number, status: s.status, conclusion: s.conclusion,
        startedAt: s.startedAt, completedAt: s.completedAt })) })
  }
  return original.every(job => {
    const matching = copied.find(j => j.name === job.name)!
    const expected = execution(job)
    return expected !== null && execution(matching) === expected
  })
}
