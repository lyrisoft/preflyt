import { checkReportFormat } from './check-report-adapters.js'
import { checkExecution, type SnippetRule } from './workflow-snippets.js'

export const POLICY_EXECUTION_VERSION = 1

/** Commands come only from the integrity-checked published policy definition. */
export function policyExecution(rule: SnippetRule) {
  if (!checkReportFormat(rule.id)) return null
  const execution = checkExecution(rule)
  return execution?.argv ? execution : null
}
