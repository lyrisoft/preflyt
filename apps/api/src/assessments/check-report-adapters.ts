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
