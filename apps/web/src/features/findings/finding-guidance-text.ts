import type { Finding } from './finding-types'

const normalize = (text: string | null | undefined) =>
  text
    ?.normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim()
    .toLowerCase()
const isRemediation = (text: string | null | undefined) =>
  /^(?:(?:recommendation|remediation|suggested (?:fix|solution)|solution|fix|to fix(?: this)?)[\s:—-]*)?(?:use|avoid|replace|remove|add|change|prefer|ensure|do not|don't|recommend|consider|you should|you must)\b/i.test(
    text?.trim() ?? ''
  )

/** Both presentations separate the code issue/impact from remediation without inventing an unknown cause. */
export function findingGuidanceText(finding: Finding) {
  if (finding.origin === 'ai' && finding.recommendation)
    return {
      title: finding.title,
      explanation: finding.impact ?? null,
      solution: finding.recommendation,
      impactLabel: finding.impact ? 'Potential impact' : undefined,
      sourceLabel: 'AI review',
      attribution: `Saved PR review · commit ${finding.sourceSha.slice(0, 12)} · Suggestions only. Review this hypothesis against the cited code.`,
    }
  const ai = finding.aiGuidance
  if (
    ai &&
    ai.sourceSha === finding.sourceSha &&
    ai.problem &&
    ai.impact &&
    ai.solution
  ) {
    return {
      title: ai.problem,
      explanation: ai.impact,
      solution: ai.solution,
      impactLabel: 'Likely effect',
      attribution: `AI guidance · commit ${finding.sourceSha.slice(0, 12)}${ai.model ? ` · ${ai.model}` : ''} · Suggestions only`,
      sourceLabel: 'AI guidance',
    }
  }
  const guide = finding.guidance
  const reported = finding.reportGuidance
  const testFailure = finding.category === 'tests'
  const reference = finding.referenceGuidance
  const suppliedSolution = guide?.fix ?? reference?.fix ?? reported?.advice
  const suppliedExplanation =
    guide?.why ?? reference?.why ?? reported?.explanation
  // Analyzer descriptions are sometimes the same imperative sentence as their help text.
  const explanation =
    suppliedExplanation &&
    !isRemediation(suppliedExplanation) &&
    normalize(suppliedExplanation) !== normalize(suppliedSolution)
      ? suppliedExplanation
      : testFailure
        ? 'This test failed in the saved CI report. The reported location identifies the failing test; the underlying cause may be in the code it calls or its setup.'
        : 'The saved report does not describe the code issue or its effect. Review the reported rule and assessed code to establish the cause.'
  const originalIsAdvice =
    isRemediation(finding.title) ||
    normalize(finding.title) === normalize(suppliedSolution)
  return {
    impactLabel: undefined as string | undefined,
    title:
      reference?.problem ??
      (originalIsAdvice ? 'Analyzer finding at this location' : finding.title),
    explanation:
      normalize(finding.title) === normalize(explanation) && !originalIsAdvice
        ? null
        : explanation,
    solution:
      suppliedSolution ??
      (testFailure
        ? 'Compare the failing assertion with the expected behavior, then inspect the called code and test setup at this commit. Fix the cause and let CI rerun the test to verify the change. Update the assertion only if the expected behavior has intentionally changed.'
        : 'No rule-specific fix was supplied. Review the reported message and affected code against the rule documentation, then verify the change with the relevant check. If evidence is missing, restore the check before changing source code.'),
    attribution: guide
      ? `Preflyt rule guidance v${guide.version} · saved with this assessment. ${guide.limits}`
      : reference
        ? `Preflyt rule reference v${reference.version} for ${reference.rule}. ${reference.limits}`
        : reported
          ? 'Analyzer-provided guidance from the saved report. Review it against the affected code; this advice does not independently verify the finding.'
          : testFailure
            ? 'General test-failure guidance. The saved report does not include a verified root cause or a specific fix.'
            : 'Rule-specific guidance is unavailable for this saved result. The reported location does not independently confirm a defect.',
    sourceLabel: guide
      ? 'Preflyt rule guidance'
      : reference
        ? 'Preflyt rule reference'
        : reported
          ? 'Analyzer guidance'
          : testFailure
            ? 'Test failure guidance'
            : 'Finding guidance',
  }
}
export type FindingGuidanceText = ReturnType<typeof findingGuidanceText>
