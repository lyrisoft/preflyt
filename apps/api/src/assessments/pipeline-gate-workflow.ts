import { policyAction } from './pipeline-action.js'
import { FINAL_GATE_NAME } from './pipeline-jobs.js'
import { parseDocument } from 'yaml'
import { BadRequestException } from '@nestjs/common'
export function publicationGateJob(needs: string[], apiUrl: string) {
  if (!needs.length || !apiUrl) throw new BadRequestException('Choose the check jobs and configure the public Preflyt API URL')
  return { name: FINAL_GATE_NAME, needs, if: "${{ always() && !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}",
    'runs-on': 'ubuntu-latest', 'timeout-minutes': 20, permissions: { contents: 'read', 'id-token': 'write' },
    steps: [{ name: 'Verify results, AI review and PR publication', uses: policyAction,
      with: { mode: 'gate', 'api-url': apiUrl } }] }
}
export function chainPublicationGate(workflow: string, apiUrl: string) {
  const document = parseDocument(workflow, { uniqueKeys: true })
  if (document.errors.length) throw new BadRequestException('Invalid workflow YAML')
  const value = document.toJS({ maxAliasCount: 10 })
  if (!value?.jobs || typeof value.jobs !== 'object') throw new BadRequestException('Add workflow check jobs first')
  // Reserve one stable display name so GitHub API verification excludes only this terminal job.
  const gateIds = Object.entries(value.jobs).filter(([, j]: [string, any]) => j.name === FINAL_GATE_NAME).map(([id]) => id)
  if (gateIds.length > 1) throw new BadRequestException('Keep one Preflyt final gate job')
  const id = gateIds[0] ?? 'preflyt_gate'
  if (!gateIds.length && value.jobs[id]) throw new BadRequestException('The preflyt_gate job ID is already used')
  const dependencies = Object.keys(value.jobs).filter(key => key !== id)
  document.setIn(['jobs', id], publicationGateJob(dependencies, apiUrl))
  return document.toString({ lineWidth: 0 })
}
