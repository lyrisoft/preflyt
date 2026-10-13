/** Trusted workflow contracts bind these reports to the named control and exact commit.
 * A report format alone never establishes tool execution, control coverage or a passing gate.
 */
export const checkReportAdapters: Readonly<Record<string, 'junit' | 'sarif'>> =
  Object.freeze({
    'tests.required': 'junit',
    'types.required': 'junit',
    'build.required': 'junit',
    'frontend.components': 'junit',
    'service.resilience': 'junit',
    'lint.required': 'sarif',
    'security.sast': 'sarif',
    'secrets.scan': 'sarif',
    'security.dependencies': 'sarif',
    'containers.scan': 'sarif',
    'iac.policy': 'sarif',
    'iac.exposures': 'sarif',
  })

/** Organization checks use the same trusted report validation as built-ins. */
export function checkReportFormat(ruleId: string): 'junit' | 'sarif' | undefined {
  const known = checkReportAdapters[ruleId]
  if (known) return known
  const match = /^custom-(junit|sarif)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(ruleId)
  return match?.[1] as 'junit' | 'sarif' | undefined
}
