import { checkReportAdapters } from './check-report-adapters.js'
import { digest } from './assessment-digest.js'
export type ExecutionContract = {
  ruleId: string
  signerWorkflow: string
  signerDigest: string
  format: 'junit' | 'sarif'
  tool: string
  toolVersion: string
}
/** Deployment-approved, reviewed workflow code is the execution trust boundary. */
export function executionContracts(): {
  contracts: ExecutionContract[]
  digest: string
} | null {
  try {
    const contracts = JSON.parse(
      process.env.CI_EXECUTION_CONTRACTS ?? '[]',
    ) as ExecutionContract[]
    if (
      !Array.isArray(contracts) ||
      !contracts.length ||
      contracts.length > 64 ||
      new Set(contracts.map((c) => c.ruleId)).size !== contracts.length ||
      contracts.some(
        (c) =>
          !c ||
          checkReportAdapters[c.ruleId] !== c.format ||
          !/^[a-f0-9]{40}$/.test(c.signerDigest) ||
          !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(
            c.signerWorkflow,
          ) ||
          typeof c.tool !== 'string' ||
          !c.tool.trim() ||
          c.tool.length > 100 ||
          typeof c.toolVersion !== 'string' ||
          !c.toolVersion.trim() ||
          c.toolVersion.length > 100,
      )
    )
      return null
    const normalized = contracts
      .map(
        ({
          ruleId,
          signerWorkflow,
          signerDigest,
          format,
          tool,
          toolVersion,
        }) => ({
          ruleId,
          signerWorkflow,
          signerDigest,
          format,
          tool,
          toolVersion,
        }),
      )
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    return { contracts: normalized, digest: digest(normalized) }
  } catch {
    return null
  }
}
