import { digest } from '../assessments/assessment-digest.js'
import { previewGate } from '../assessments/gate-preview.js'

type Observation = {
  repositoryId: string
  sourceObjectId: string
  sourceSha: string
  pullRequestNumber: number | null
  observedAt: Date
}
type Assessment = {
  id: string
  repositoryId: string
  sourceSha: string
  selectionId: string
  createdAt: Date
  assessmentHash: string
  request: unknown
  plan: unknown
  report: unknown
}
const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
const percent = (passed: number, total: number) =>
  total ? Math.round((passed / total) * 1000) / 10 : null

/** Historical standards evidence only. Never infers a person's performance or current merge readiness. */
export function contributorCompliance(
  observations: Observation[],
  assessments: Assessment[],
  truncated: boolean,
) {
  const groups = new Map<string, Observation[]>()
  for (const observation of observations) {
    if (!observation.pullRequestNumber) continue
    const key = `${observation.repositoryId}:${observation.pullRequestNumber}`
    const group = groups.get(key) ?? []
    group.push(observation)
    groups.set(key, group)
  }
  const baselines = new Map<
    string,
    {
      selectionId: string
      revision: number | null
      repositoryId: string
      assessed: number
      complete: number
      passed: number
      blocked: number
      incomplete: number
      firstEvaluated: number
      firstPassed: number
    }
  >()
  const assessmentIndex = new Map<string, Assessment[]>()
  for (const assessment of assessments) {
    const pr = record(record(assessment.request).pullRequest)
    if (record(pr.head).sha !== assessment.sourceSha) continue
    const key = `${assessment.repositoryId}:${pr.number}`
    const group = assessmentIndex.get(key) ?? []
    group.push(assessment)
    assessmentIndex.set(key, group)
  }
  const rows = [...groups.values()].map((group) => {
    group.sort(
      (a, b) =>
        b.observedAt.getTime() - a.observedAt.getTime() ||
        a.sourceSha.localeCompare(b.sourceSha),
    )
    const latest = group[0]
    const shas = new Set(group.map((o) => o.sourceSha))
    const matching = (
      assessmentIndex.get(
        `${latest.repositoryId}:${latest.pullRequestNumber}`,
      ) ?? []
    )
      .filter((a) => {
        const request = record(a.request),
          pr = record(request.pullRequest)
        return (
          a.repositoryId === latest.repositoryId &&
          shas.has(a.sourceSha) &&
          pr.number === latest.pullRequestNumber &&
          pr.objectId === latest.sourceObjectId
        )
      })
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
    const evaluate = (assessment: Assessment) => {
      if (
        record(assessment.request).selectionId !== assessment.selectionId ||
        digest({
          request: assessment.request,
          plan: assessment.plan,
          report: assessment.report,
        }) !== assessment.assessmentHash
      )
        return null
      return previewGate(assessment)
    }
    const current = matching
      .filter((a) => a.sourceSha === latest.sourceSha)
      .at(-1)
    const ambiguous = group.some(
      (o) =>
        o.observedAt.getTime() === latest.observedAt.getTime() &&
        o.sourceSha !== latest.sourceSha,
    )
    const result = current && !ambiguous ? evaluate(current) : null
    const status = ambiguous
      ? 'UNKNOWN'
      : !current
        ? matching.length
          ? 'STALE'
          : 'UNASSESSED'
        : !result
          ? 'INVALID'
          : result.requiredRules === 0 ||
              result.reasons.length ||
              result.requiredRulesIncomplete
            ? result.status === 'BLOCK'
              ? 'BLOCK_INCOMPLETE'
              : 'INCOMPLETE'
            : result.requiredRulesBlocked
              ? 'BLOCK'
              : 'PASS'
    const complete = status === 'PASS' || status === 'BLOCK'
    const first = matching
      .map((assessment) => ({ assessment, result: evaluate(assessment) }))
      .find(
        ({ result }) =>
          result &&
          result.requiredRules > 0 &&
          !result.reasons.length &&
          !result.requiredRulesIncomplete,
      )
    if (current && result) {
      const request = record(current.request)
      const baseline = baselines.get(current.selectionId) ?? {
        selectionId: current.selectionId,
        repositoryId: latest.repositoryId,
        revision: Number.isInteger(request.selectionRevision)
          ? request.selectionRevision
          : null,
        assessed: 0,
        complete: 0,
        passed: 0,
        blocked: 0,
        incomplete: 0,
        firstEvaluated: 0,
        firstPassed: 0,
      }
      baseline.assessed++
      if (complete) baseline.complete++
      if (status === 'PASS') baseline.passed++
      if (status === 'BLOCK' || status === 'BLOCK_INCOMPLETE')
        baseline.blocked++
      if (!complete) baseline.incomplete++
      // First and latest are comparable only when their saved standards selection is identical.
      if (first && first.assessment.selectionId === current.selectionId) {
        baseline.firstEvaluated++
        if (!first.result!.requiredRulesBlocked) baseline.firstPassed++
      }
      baselines.set(current.selectionId, baseline)
    }
    return {
      repositoryId: latest.repositoryId,
      number: latest.pullRequestNumber!,
      sourceSha: latest.sourceSha,
      status,
      assessmentId: current?.id ?? null,
      selectionId: current?.selectionId ?? null,
      requiredRules: result?.requiredRules ?? null,
      passedRules: result?.requiredRulesSatisfied ?? null,
      blockedRules: result?.requiredRulesBlocked ?? null,
      missingRules: result?.requiredRulesIncomplete ?? null,
      assessedAt: current?.createdAt.toISOString() ?? null,
    }
  })
  const complete = rows.filter(
    (r) => r.status === 'PASS' || r.status === 'BLOCK',
  ).length
  const passed = rows.filter((r) => r.status === 'PASS').length
  const versions = [...baselines.values()].map((b) => ({
    ...b,
    passRate: truncated ? null : percent(b.passed, b.complete),
    firstRecordedPassRate: truncated
      ? null
      : percent(b.firstPassed, b.firstEvaluated),
  }))
  return {
    mode: 'SAVED_STANDARDS_PREVIEW',
    eligiblePrs: rows.length,
    completePrs: complete,
    passingPrs: passed,
    blockedPrs: rows.filter((r) =>
      ['BLOCK', 'BLOCK_INCOMPLETE'].includes(r.status),
    ).length,
    incompletePrs: rows.filter((r) =>
      ['INCOMPLETE', 'BLOCK_INCOMPLETE', 'INVALID', 'UNKNOWN'].includes(
        r.status,
      ),
    ).length,
    unassessedPrs: rows.filter((r) => r.status === 'UNASSESSED').length,
    stalePrs: rows.filter((r) => r.status === 'STALE').length,
    passRate:
      truncated || versions.length !== 1 ? null : percent(passed, complete),
    coverage: truncated ? null : percent(complete, rows.length),
    mixedBaselines: versions.length > 1,
    truncated,
    baselines: versions,
    rows: rows.slice(0, 200),
    rowsTruncated: rows.length > 200,
  }
}
