import { digest } from "../assessments/assessment-digest.js";
import { readPullRequestContext } from "../github-events/pull-request-context.js";
import { validateSkillOutput } from "../intelligence/review-skills.js";

/** Historical visibility only. This never substitutes evidence for another assessment. */
export function sameReviewedPrRevision(reviewed: any, displayed: any) {
  const a = reviewed?.request?.pullRequest,
    b = displayed?.request?.pullRequest;
  const x = readPullRequestContext(a),
    y = readPullRequestContext(b);
  return (
    reviewed?.request?.subjectKind === "PULL_REQUEST" &&
    displayed?.request?.subjectKind === "PULL_REQUEST" &&
    Number.isSafeInteger(a?.number) &&
    a.number > 0 &&
    a.number === b?.number &&
    !!x &&
    !!y &&
    reviewed.sourceSha === x.head.sha &&
    displayed.sourceSha === y.head.sha &&
    digest({ head: x.head, base: x.base }) ===
      digest({ head: y.head, base: y.base })
  );
}

/** Return the saved advisory text and cited location metadata, never snapshot source or credentials. */
export function aiReviewFindingRows(
  review: any,
  repo: { githubId: bigint; fullName: string },
) {
  const saved = review.assessment,
    snapshot = review.snapshot,
    context = snapshot?.context;
  if (
    review.state !== "SUCCEEDED" ||
    !saved ||
    !context ||
    digest(snapshot) !== review.fingerprint ||
    digest({
      request: saved.request,
      plan: saved.plan,
      report: saved.report,
    }) !== saved.assessmentHash ||
    context.assessmentHash !== saved.assessmentHash ||
    context.sourceSha !== saved.sourceSha ||
    review.result?.context?.assessmentHash !== context.assessmentHash ||
    review.result?.context?.sourceSha !== context.sourceSha
  )
    return [];
  const number = saved.request?.pullRequest?.number;
  if (
    saved.request?.subjectKind !== "PULL_REQUEST" ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    return [];
  try {
    const findings = validateSkillOutput(
      JSON.stringify({
        assessmentHash: context.assessmentHash,
        sourceSha: context.sourceSha,
        findings: review.result.findings.map(
          ({
            checkId,
            evidenceRefs,
            summary,
            recommendation,
            severity,
            impact,
          }: any) => ({
            checkId,
            evidenceRefs,
            summary,
            recommendation,
            ...(severity !== undefined || impact !== undefined
              ? { severity, impact }
              : {}),
          }),
        ),
      }),
      context,
      snapshot.checks.map((c: any) => c.id),
    );
    return findings.map((finding) => {
      const locations = finding.evidenceRefs.flatMap((ref) => {
        const line = context.source?.lines.find((l: any) => l.ref === ref);
        return line
          ? [{ path: line.path, line: line.line, side: line.side }]
          : [];
      });
      const primary = locations.find((l) => l.side === "RIGHT") ?? locations[0];
      return {
        id: digest([
          "ai",
          String(repo.githubId),
          context.sourceSha,
          number,
          {
            checkId: finding.checkId,
            summary: finding.summary,
            recommendation: finding.recommendation,
            evidenceRefs: finding.evidenceRefs,
          },
        ]),
        origin: "ai" as const,
        category: "ai",
        status: "AI suggestion",
        severity: finding.severity ?? "unknown",
        impact: finding.impact ?? null,
        title: finding.summary,
        recommendation: finding.recommendation,
        repositoryId: String(repo.githubId),
        repository: repo.fullName,
        sourceSha: context.sourceSha,
        assessmentId: review.assessmentId,
        reviewId: review.id,
        observedAt:
          (review.finishedAt ?? review.createdAt)?.toISOString() ?? null,
        pullRequest: number,
        pullRequestUrl: `https://github.com/${repo.fullName}/pull/${number}`,
        checkTitle:
          snapshot.checks.find((c: any) => c.id === finding.checkId)?.title ??
          finding.checkId,
        ruleId: finding.checkId,
        evidence: finding.evidenceRefs,
        evidenceLocations: finding.evidenceRefs.map((ref) => {
          const line = context.source?.lines.find((l: any) => l.ref === ref);
          return line
            ? { ref, path: line.path, line: line.line, side: line.side }
            : {
                ref,
                label:
                  context.evidence.find((e: any) => e.ref === ref)?.ruleId ??
                  ref,
              };
        }),
        verification: "Suggestions only",
        feedbackState: review.feedbackState,
        path: primary?.path ?? null,
        line: primary?.line ?? null,
        endLine: primary?.line ?? null,
        codeSide: primary?.side ?? null,
        relatedLocations: locations
          .filter((l) => l.side === "RIGHT")
          .slice(0, 3)
          .map((l) => ({ path: l.path, line: l.line, endLine: l.line })),
        occurrences: 1,
      };
    });
  } catch {
    return [];
  }
}
