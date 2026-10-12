import type { Finding } from './finding-types'

/** Both presentations use the same saved evidence and explicitly labeled fallback. */
export function findingGuidanceText(finding: Finding) {
  const guide = finding.guidance
  const reported = finding.reportGuidance
  const testFailure = finding.category === 'tests'
  return {
    title: finding.title,
    explanation:
      guide?.why ??
      reported?.explanation ??
      (testFailure
        ? 'This test failed in the saved CI report. The reported location identifies the failing test; the underlying cause may be in the code it calls or its setup.'
        : null),
    solution:
      guide?.fix ??
      reported?.advice ??
      (testFailure
        ? 'Compare the failing assertion with the expected behavior, then inspect the called code and test setup at this commit. Fix the cause and let CI rerun the test to verify the change. Update the assertion only if the expected behavior has intentionally changed.'
        : 'No rule-specific fix was supplied. Review the reported message and affected code against the rule documentation, then verify the change with the relevant check. If evidence is missing, restore the check before changing source code.'),
    attribution: guide
      ? `Preflyt rule guidance v${guide.version} · saved with this assessment. ${guide.limits}`
      : reported
        ? 'Analyzer-provided guidance from the saved report. Review it against the affected code; this advice does not independently verify the finding.'
        : testFailure
          ? 'General test-failure guidance. The saved report does not include a verified root cause or a specific fix.'
          : 'Rule-specific guidance is unavailable for this saved result. The reported location does not independently confirm a defect.',
    sourceLabel: guide
      ? 'Preflyt rule guidance'
      : reported
        ? 'Analyzer guidance'
        : testFailure
          ? 'Test failure guidance'
          : 'Finding guidance',
  }
}
export type FindingGuidanceText = ReturnType<typeof findingGuidanceText>
